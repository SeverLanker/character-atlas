import { applyCatalogImport, catalogLabels, exportCatalog, parseCatalog } from "./catalog-io";
import { catalogKey } from "./catalog-key";
import { validateLibrary, type Library } from "./model";
import { historyReducer, type HistoryState } from "./useLibraryHistory";
import { markOperation } from "./history-labels";
import { characterChoices, decodeBase64, parseCharacterJson, parseCharacterZip, type ParsedCharacters } from "./character-import";
import { mergeLibraries } from "./merge";
import { duplicateGroups, field, fields, lightEntry, queryIsEmpty, readQuery, selectCatalog, tagList, worldCounts } from "./agent-catalog";

export interface AgentReply {
  status: number; body: string; content_type: string;
  /** "base64" when body carries binary data (GET /backup). */
  encoding?: "base64";
  /** Ids touched by a write, for the desktop audit log only; the transport never sends it. */
  audit_ids?: string[];
}
export interface AgentRequest {
  id: string; method: string; url: string; body?: unknown; fingerprint: string;
  request_id?: string; deadline: number;
}
export interface AgentRecord { request_id: string; fingerprint: string; reply: AgentReply }
export interface AgentContext {
  lock: () => () => void;
  flush: () => Promise<void>;
  history: () => HistoryState;
  publish: (state: HistoryState) => void;
  lookup: (id: string, fingerprint: string) => Promise<AgentReply | null>;
  commit: (request: AgentRequest, previous: Library, next: Library, record: AgentRecord) => Promise<void>;
  /** Writes incoming images under fresh names and rewrites refs in `library` in place (UI append-import pipeline). */
  importAssets?: (library: Library, assets: Record<string, Uint8Array>) => Promise<void>;
  /** Builds the same zip as the UI full backup. */
  backup?: (library: Library) => Promise<Uint8Array>;
}
/** Library states produced by agent writes in this session; /undo and /redo only move across these. */
const agentStates = new WeakSet<Library>();
const stable = (value: unknown): string => JSON.stringify(value, (_key, item) => item && typeof item === "object" && !Array.isArray(item) ? Object.fromEntries(Object.keys(item).sort().map(key => [key, item[key]])) : item);
const sameEntry = (a: object, b: object) => stable({ ...a, updatedAt: undefined }) === stable({ ...b, updatedAt: undefined });
export const agentJson = (status: number, value: unknown): AgentReply => ({ status, body: JSON.stringify(value), content_type: "application/json;charset=utf-8" });
class ApiError extends Error { constructor(public status: number, message: string, public detail: Record<string, unknown> = {}) { super(message); } }
const MAX_BACKUP = 48 * 1024 * 1024;
const toBase64 = (bytes: Uint8Array) => { let text = ""; for (let i = 0; i < bytes.length; i += 0x8000) text += String.fromCharCode(...bytes.subarray(i, i + 0x8000)); return btoa(text); };
const diffKind = (before: Library | null | undefined, after: Library | null | undefined) => {
  if (!before || !after) return "library_update";
  const catalog = stable(before.catalog ?? []) !== stable(after.catalog ?? []), characters = stable(before.characters) !== stable(after.characters);
  return catalog && !characters ? "catalog_update" : characters && !catalog ? "character_update" : "library_update";
};
/** Consecutive agent-made steps the API can undo or redo right now. */
export function agentDepth(state: HistoryState) {
  let undo = 0;
  for (let current = state.current, i = state.past.length; current && i > 0 && agentStates.has(current); undo++) current = state.past[--i];
  let redo = 0;
  while (redo < state.future.length && agentStates.has(state.future[redo])) redo++;
  return { undo, redo };
}
const writeKeys = new Set(["request_id", "dry_run"]);
const operational = (error: unknown, fallback: number) => {
  const message = error instanceof Error ? error.message : String(error);
  return new ApiError(/409|资料库已变化/.test(message) ? 409 : /已超时/.test(message) ? 504 : fallback, message);
};
const object = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new ApiError(422, "请求体必须是 JSON 对象");
  return value as Record<string, unknown>;
};

/** Same domain parser and history reducer as the UI; transports never mutate catalog rows. */
export async function executeAgentRequest(request: AgentRequest, context: AgentContext): Promise<AgentReply> {
  let release: (() => void) | undefined;
  try {
    release = context.lock();
    try { await context.flush(); } catch (error) { throw operational(error, 503); }
    if (Date.now() > request.deadline) throw new ApiError(504, "请求已超时，请使用相同 request_id 重试");
    const state = context.history(), library = state.current;
    if (!library) throw new ApiError(503, "资料库尚未加载");
    const url = new URL(request.url, "http://127.0.0.1"), path = url.pathname;
    if (new Set(url.searchParams.keys()).size !== [...url.searchParams.keys()].length) throw new ApiError(422, "查询参数不能重复");
    const body = request.body === undefined ? {} : object(request.body);
    if (url.searchParams.has("request_id")) throw new ApiError(422, `${field("request_id")} 只接受 Idempotency-Key 请求头或请求体，不接受查询参数`);
    if (body.dry_run !== undefined && typeof body.dry_run !== "boolean") throw new ApiError(422, `${field("dry_run")} 在请求体中必须是 true/false`);
    const previewable = request.method === "POST" && (path === "/catalog/import" || path === "/characters/import") || request.method === "PATCH" && path === "/catalog";
    if (!previewable && (body.dry_run !== undefined || url.searchParams.has("dry_run"))) throw new ApiError(422, `本接口不支持 ${field("dry_run")}`);
    if (previewable && url.searchParams.has("dry_run") && body.dry_run !== undefined && (url.searchParams.get("dry_run") === "1") !== body.dry_run) throw new ApiError(422, `查询参数与请求体的 ${field("dry_run")} 不一致`);
    if (path === "/catalog/import") {
      if ([...url.searchParams.keys()].some(key => key !== "dry_run") || (url.searchParams.has("dry_run") && !["0", "1"].includes(url.searchParams.get("dry_run")!))) throw new ApiError(422, "导入查询参数仅支持 dry_run=0 或 1");
      const unknown = Object.keys(body).filter(key => !["format", "text", "overwrite", "overwrite_rows"].includes(key) && !writeKeys.has(key));
      if (unknown.length) throw new ApiError(422, `不支持的导入参数：${fields(unknown)}`);
    }
    if (request.method === "PATCH" && path === "/catalog" && url.searchParams.has("dry_run") && !["0", "1"].includes(url.searchParams.get("dry_run")!)) throw new ApiError(422, "dry_run 必须为 0 或 1");
    const dry = previewable && (url.searchParams.get("dry_run") === "1" || body.dry_run === true);
    const mutating = request.method !== "GET" && !dry;
    const requestId = request.request_id ?? body.request_id;
    if (request.request_id && body.request_id !== undefined && request.request_id !== body.request_id) throw new ApiError(422, `Idempotency-Key 请求头与请求体的 ${field("request_id")} 不一致`);
    if (mutating) {
      if (typeof requestId !== "string" || !/^[A-Za-z0-9._:-]{1,128}$/.test(requestId)) throw new ApiError(422, `写操作必须提供 ${field("request_id")}：Idempotency-Key 请求头或请求体字段，1–128 位字母、数字、._:-`);
      const cached = await context.lookup(requestId, request.fingerprint).catch(error => { throw operational(error, 503); });
      if (cached) return cached;
    }
    let reply: AgentReply, next: HistoryState | undefined;
    const catalog = library.catalog ?? [];
    if (request.method === "GET" && path === "/stats") {
      reply = agentJson(200, { characters: library.characters.length, versions: library.characters.reduce((n, c) => n + c.versions.length, 0), catalog: catalog.length, catalog_by_kind: Object.fromEntries(Object.keys(catalogLabels).map(kind => [kind, catalog.filter(row => row.kind === kind).length])), can_undo: !!state.past.length, can_redo: !!state.future.length, undo_depth: state.past.length, redo_depth: state.future.length, agent_undo_depth: agentDepth(state).undo, agent_redo_depth: agentDepth(state).redo, catalog_by_world: worldCounts(catalog), tags: tagList(catalog) });
    } else if (request.method === "POST" && path === "/catalog/import") {
      if (typeof body.format !== "string" || !["csv", "json", "tsv"].includes(body.format) || typeof body.text !== "string") throw new ApiError(422, "format 必须为 csv/json/tsv，text 必须为字符串");
      if (body.overwrite !== undefined && (typeof body.overwrite !== "string" || !["all", "skip"].includes(body.overwrite))) throw new ApiError(422, "overwrite 必须为 skip 或 all");
      if (body.overwrite_rows !== undefined && (!Array.isArray(body.overwrite_rows) || body.overwrite_rows.some(v => !Number.isInteger(v) || Number(v) < 1))) throw new ApiError(422, "overwrite_rows 必须为数据行编号数组");
      const rows = parseCatalog(body.text, body.format as "csv" | "json" | "tsv", catalog);
      const duplicates = rows.filter(row => row.status === "duplicate");
      const overwrite = new Set(body.overwrite === "all" ? duplicates.map(row => row.line) : body.overwrite_rows as number[] ?? []);
      if ([...overwrite].some(n => !duplicates.some(row => row.line === n))) throw new ApiError(422, "overwrite_rows 包含非重名行，请先 dry_run 核对");
      // Overwrite rows whose result equals the stored entry are reported as unchanged, not overwritten.
      const unchanged = new Set<number>();
      for (const line of overwrite) {
        const row = duplicates.find(item => item.line === line)!, existing = row.entry && catalog.find(entry => catalogKey(entry) === catalogKey(row.entry!));
        if (existing && sameEntry(existing, applyCatalogImport([existing], [row], new Set([line]))[0])) unchanged.add(line);
      }
      for (const line of unchanged) overwrite.delete(line);
      const errors = rows.filter(row => row.status === "error").map(row => ({ row: row.line, title: row.title, reason: row.reason }));
      const added = rows.filter(row => row.status === "new").length;
      const warnings = rows.filter(row => row.warnings.length).map(row => ({ row: row.line, title: row.title, warnings: row.warnings, attention: !!row.attention }));
      if (dry) reply = agentJson(200, { total: rows.length, will_add: added, will_overwrite: overwrite.size, unchanged: unchanged.size, skipped_dup: duplicates.length - overwrite.size - unchanged.size, errors, warnings, header_notes: rows[0]?.headerNotes ?? [], preview_ids: rows.filter(row => row.entry).map(row => `row:${row.line}`), preview: rows.map(row => ({ row: row.line, title: row.title, status: row.status, reason: row.reason, entry: row.entry })) });
      else {
        const imported = applyCatalogImport(catalog, rows, overwrite);
        // Even all-skipped requests get a durable receipt, but no empty undo step.
        if (added + overwrite.size) next = historyReducer(state, { type: "set", update: { ...library, catalog: imported }, time: Date.now(), checkpoint: true });
        reply = { ...agentJson(200, { added, skipped_dup: duplicates.length - overwrite.size - unchanged.size, overwritten: overwrite.size, unchanged: unchanged.size, errors, warnings }), audit_ids: imported.filter((entry, i) => i >= catalog.length || !sameEntry(entry, catalog[i])).map(entry => entry.id) };
      }
    } else if (request.method === "GET" && path === "/catalog/export") {
      if ([...url.searchParams.keys()].some(key => !["format", "scope", "kind", "world", "tag", "tags", "tag_mode", "q", "favorite", "ids"].includes(key))) throw new ApiError(422, "存在未识别的导出筛选参数");
      if (url.searchParams.has("favorite") && !["0", "1"].includes(url.searchParams.get("favorite")!)) throw new ApiError(422, `${field("favorite")} 必须为 0 或 1`);
      const format = url.searchParams.get("format") ?? "json", scope = url.searchParams.get("scope") ?? "all";
      if (format !== "json" && format !== "csv" && format !== "tsv") throw new ApiError(422, `${field("format")} 必须为 json、csv 或 tsv`);
      if (scope !== "all" && !scope.startsWith("kind:") && !scope.startsWith("world:")) throw new ApiError(422, `${field("scope")} 必须为 all / kind:skill / world:世界名`);
      const query = readQuery(key => key === "kind" && scope.startsWith("kind:") ? scope.slice(5) : key === "world" && scope.startsWith("world:") ? scope.slice(6) : url.searchParams.get(key) ?? undefined);
      const selected = selectCatalog(catalog, query);
      reply = { status: 200, body: exportCatalog(selected, format), content_type: format === "json" ? "application/json;charset=utf-8" : format === "tsv" ? "text/tab-separated-values;charset=utf-8" : "text/csv;charset=utf-8" };
    } else if (request.method === "GET" && path === "/catalog") {
      if ([...url.searchParams.keys()].some(key => !["kind", "world", "tag", "tags", "tag_mode", "q", "favorite", "ids", "limit", "cursor"].includes(key))) throw new ApiError(422, "存在未识别的列表参数（支持 kind、world、tag、tags、tag_mode、q、favorite、ids、limit、cursor）");
      const query = readQuery(key => url.searchParams.get(key) ?? undefined);
      const limit = Number(url.searchParams.get("limit") ?? 100);
      if (!Number.isInteger(limit) || limit < 1 || limit > 1000) throw new ApiError(422, `${field("limit")} 必须是 1–1000 的整数`);
      const selected = selectCatalog(catalog, query), cursor = url.searchParams.get("cursor");
      // The cursor is the last id of the previous page, so inserts and deletes elsewhere never skip or repeat rows.
      let start = 0;
      if (cursor) { const index = selected.findIndex(row => row.id === cursor); if (index < 0) throw new ApiError(422, `${field("cursor")} 已失效（该条目已删除或不再匹配筛选），请从头列出`); start = index + 1; }
      const page = selected.slice(start, start + limit);
      reply = agentJson(200, { total: selected.length, items: page.map(lightEntry), next_cursor: start + limit < selected.length ? page.at(-1)!.id : null });
    } else if (request.method === "GET" && path === "/catalog/duplicates") {
      if ([...url.searchParams.keys()].some(key => !["by", "kind", "world"].includes(key))) throw new ApiError(422, "重名查询只支持 by、kind、world");
      const by = url.searchParams.get("by") ?? "normalized";
      if (by !== "normalized" && by !== "name") throw new ApiError(422, `${field("by")} 必须为 normalized 或 name`);
      const groups = duplicateGroups(selectCatalog(catalog, readQuery(key => url.searchParams.get(key) ?? undefined)), by);
      reply = agentJson(200, { by, groups, group_count: groups.length, entry_count: groups.reduce((n, g) => n + g.ids.length, 0) });
    } else if (request.method === "PATCH" && path === "/catalog") {
      if ([...url.searchParams.keys()].some(key => key !== "dry_run")) throw new ApiError(422, "批量修改的筛选条件请放在请求体 filter 中");
      const unknown = Object.keys(body).filter(key => !["filter", "set", "add_tags", "remove_tags"].includes(key) && !writeKeys.has(key));
      if (unknown.length) throw new ApiError(422, `不支持的批量参数：${fields(unknown)}`);
      const filter = object(body.filter ?? {}), set = object(body.set ?? {});
      const badFilter = Object.keys(filter).filter(key => !["kind", "world", "tag", "tags", "tag_mode", "q", "favorite", "ids", "all"].includes(key));
      if (badFilter.length) throw new ApiError(422, `不支持的筛选字段：${fields(badFilter)}`);
      const badSet = Object.keys(set).filter(key => !["world", "rank", "source", "sourceId", "favorite"].includes(key));
      if (badSet.length) throw new ApiError(422, `批量不支持设置：${fields(badSet)}（批量只能改 world、rank、source、sourceId、favorite；改名称请逐条 PATCH）`);
      const tagArg = (key: string) => { const value = body[key] ?? []; if (!Array.isArray(value) || value.some(tag => typeof tag !== "string" || !tag.trim() || tag.length > 100)) throw new ApiError(422, `${field(key)} 必须是非空字符串数组`); return value.map(tag => (tag as string).trim()); };
      const add = tagArg("add_tags"), remove = new Set(tagArg("remove_tags"));
      if (!Object.keys(set).length && !add.length && !remove.size) throw new ApiError(422, `请至少提供 ${fields(["set", "add_tags", "remove_tags"])} 之一`);
      const query = readQuery(key => filter[key]);
      if (queryIsEmpty(query) && filter.all !== true) throw new ApiError(422, `筛选为空会改动整个条目库；确认请在 filter 中写 "all": true`);
      const matched = selectCatalog(catalog, query), ids = new Set(matched.map(row => row.id)), now = new Date().toISOString();
      const changed: string[] = [];
      const updated = catalog.map(row => {
        if (!ids.has(row.id)) return row;
        const candidate = { ...row, ...set, tags: [...new Set([...(row.tags ?? []).filter(tag => !remove.has(tag)), ...add])] } as typeof row;
        for (const key of ["source", "sourceId"] as const) if (candidate[key] === "") delete candidate[key];
        if (sameEntry(row, candidate)) return row;
        changed.push(row.id);
        return { ...candidate, updatedAt: now };
      });
      const checked = parseCatalog(JSON.stringify(updated.filter(row => changed.includes(row.id))), "json", []);
      const invalid = checked.find(row => row.status === "error");
      if (invalid) throw new ApiError(422, `条目「${invalid.title}」修改后无效：${invalid.reason}`);
      const keys = new Map<string, string>(), conflicts: { id: string; conflict_id: string }[] = [];
      for (const row of updated) { const key = catalogKey(row), other = keys.get(key); if (other && (changed.includes(row.id) || changed.includes(other))) conflicts.push({ id: changed.includes(row.id) ? row.id : other, conflict_id: changed.includes(row.id) ? other : row.id }); else if (!other) keys.set(key, row.id); }
      if (conflicts.length) throw new ApiError(409, "批量修改后会与同世界、同类别条目重名，未做任何修改", { conflicts, conflict_id: conflicts[0].conflict_id });
      if (dry) reply = agentJson(200, { dry_run: true, matched: matched.length, will_update: changed.length, ids: changed });
      else {
        if (changed.length) next = historyReducer(state, { type: "set", update: { ...library, catalog: updated }, checkpoint: true, time: Date.now() });
        reply = { ...agentJson(200, { matched: matched.length, updated: changed.length, ids: changed }), audit_ids: changed };
      }
    } else if (request.method === "GET" && path === "/backup") {
      if ([...url.searchParams.keys()].length) throw new ApiError(422, "整库备份不接受查询参数");
      if (!context.backup) throw new ApiError(501, "当前运行模式不支持整库备份");
      const bytes = await context.backup(library);
      if (bytes.length > MAX_BACKUP) throw new ApiError(413, "备份超过 48 MB，请在界面「设置 → 导出完整备份」中保存");
      reply = { status: 200, body: toBase64(bytes), content_type: "application/zip", encoding: "base64" };
    } else if (path.startsWith("/catalog/") && path.split("/").length === 3) {
      const id = decodeURIComponent(path.slice(9)), found = catalog.find(row => row.id === id);
      if (!found) throw new ApiError(404, "条目不存在");
      if (request.method === "GET") reply = agentJson(200, found);
      else if (request.method === "PATCH") {
        const editable = ["title", "kind", "world", "rank", "tags", "text", "source", "sourceId", "favorite"];
        const unknown = Object.keys(body).filter(key => !editable.includes(key) && key !== "request_id");
        if (unknown.length) throw new ApiError(422, `不支持修改字段：${fields(unknown)}（可改：${fields(editable)}）`);
        const patch = Object.fromEntries(Object.entries(body).filter(([key]) => key !== "request_id"));
        if (typeof patch.title === "string") patch.title = patch.title.trim();
        // Empty source / sourceId clears the field.
        const candidate = { ...found, ...patch, id, updatedAt: new Date().toISOString() } as typeof found;
        for (const key of ["source", "sourceId"] as const) if (candidate[key] === "") delete candidate[key];
        const checked = parseCatalog(JSON.stringify([candidate]), "json", []);
        if (checked[0].status === "error") throw new ApiError(422, checked[0].reason);
        const conflict = catalog.find(row => row.id !== id && catalogKey(row) === catalogKey(candidate));
        if (conflict) throw new ApiError(409, `修改后与同世界、同类别条目「${conflict.title}」重名（按 NFKC、空格归一比较），未修改`, { conflict_id: conflict.id });
        if (sameEntry(found, candidate)) reply = { ...agentJson(200, found), audit_ids: [id] };
        else {
          next = historyReducer(state, { type: "set", update: { ...library, catalog: catalog.map(row => row.id === id ? candidate : row) }, checkpoint: true, time: Date.now() });
          reply = { ...agentJson(200, candidate), audit_ids: [id] };
        }
      } else if (request.method === "DELETE") {
        next = historyReducer(state, { type: "set", update: { ...library, catalog: catalog.filter(row => row.id !== id) }, checkpoint: true, time: Date.now() });
        reply = { ...agentJson(200, { deleted: id, remaining: catalog.length - 1 }), audit_ids: [id] };
      } else throw new ApiError(405, "不支持的请求方法");
    } else if (request.method === "POST" && ["/undo", "/redo"].includes(path)) {
      next = historyReducer(state, { type: path === "/undo" ? "undo" : "redo" });
      if (next === state) throw new ApiError(409, "没有可撤销／重做的操作（历史仅在本次应用会话保留）");
      // Only step across agent-made states, so the API never reverts edits made in the UI.
      const target = path === "/undo" ? state.current : state.future[0];
      if (!target || !agentStates.has(target)) {
        const before = path === "/undo" ? state.past.at(-1) : state.current;
        throw new ApiError(409, path === "/undo" ? "最近一步不是 Agent 操作，接口不会撤销界面中的修改" : "下一步重做不是 Agent 操作，请在界面中重做", { blocked_by: "ui", top_action: { kind: diffKind(before, target), at: path === "/undo" && state.time ? new Date(state.time).toISOString() : null }, agent_undo_depth: agentDepth(state).undo, agent_redo_depth: agentDepth(state).redo });
      }
      reply = agentJson(200, { action: path.slice(1), catalog: next.current?.catalog?.length ?? 0 });
    } else if (request.method === "GET" && path === "/characters") {
      if ([...url.searchParams.keys()].length) throw new ApiError(422, "角色列表不接受查询参数");
      // Public fields only; secret archives are never returned by the API.
      reply = agentJson(200, { characters: library.characters.map(c => ({ id: c.id, name: c.name, collection: c.collection, versions: c.versions.length })) });
    } else if (request.method === "POST" && path === "/characters/import") {
      if ([...url.searchParams.keys()].some(key => key !== "dry_run") || (url.searchParams.has("dry_run") && !["0", "1"].includes(url.searchParams.get("dry_run")!))) throw new ApiError(422, "导入查询参数仅支持 dry_run=0 或 1");
      const unknown = Object.keys(body).filter(key => !["format", "text", "data_base64", "on_conflict", "request_id"].includes(key));
      if (unknown.length) throw new ApiError(422, `不支持的导入参数：${unknown.join("、")}`);
      const onConflict = body.on_conflict ?? "skip";
      if (typeof onConflict !== "string" || !["skip", "replace", "copy"].includes(onConflict)) throw new ApiError(422, "on_conflict 必须为 skip、replace 或 copy");
      let parsed: ParsedCharacters;
      try {
        if (body.format === "json" && typeof body.text === "string" && body.data_base64 === undefined) parsed = parseCharacterJson(body.text);
        else if (body.format === "zip" && typeof body.data_base64 === "string" && body.text === undefined) parsed = parseCharacterZip(decodeBase64(body.data_base64));
        else throw new ApiError(422, "format=json 需要 text；format=zip 需要 data_base64");
      } catch (error) { if (error instanceof ApiError) throw error; throw new ApiError(422, error instanceof Error ? error.message : String(error)); }
      const incoming = parsed.library;
      const choices = characterChoices(library, incoming, onConflict as "skip" | "replace" | "copy");
      const existing = new Set(library.characters.map(c => c.id));
      const plan = incoming.characters.map(c => ({ id: c.id, name: c.name, status: !existing.has(c.id) ? "new" : choices[c.id] === "skip" ? "skipped" : choices[c.id] === "replace" ? "replace" : "copy" }));
      const count = (status: string) => plan.filter(row => row.status === status).length;
      const summary = { total: parsed.total, errors: parsed.errors };
      // Validate the merged result before touching images or storage.
      const preview = mergeLibraries(library, incoming, choices);
      if (dry) reply = agentJson(200, { ...summary, will_add: count("new"), will_replace: count("replace"), will_copy: count("copy"), will_skip: count("skipped"), characters: plan });
      else {
        let added = plan;
        if (count("new") + count("replace") + count("copy")) {
          if (context.importAssets && Object.keys(parsed.assets).length) await context.importAssets(incoming, parsed.assets);
          const merged = Object.keys(parsed.assets).length ? mergeLibraries(library, incoming, choices) : preview;
          // mergeLibraries appends new and copied characters in input order; report the ids actually stored.
          const appended = merged.characters.slice(library.characters.length).map(c => c.id);
          let cursor = 0;
          added = plan.map(row => row.status === "new" || row.status === "copy" ? { ...row, id: appended[cursor++] ?? row.id } : row);
          next = historyReducer(state, { type: "set", update: merged, time: Date.now(), checkpoint: true });
        }
        reply = { ...agentJson(200, { ...summary, added: count("new"), replaced: count("replace"), copied: count("copy"), skipped: count("skipped"), characters: added }), audit_ids: added.filter(row => row.status !== "skipped").map(row => row.id) };
      }
    } else throw new ApiError(404, "接口不存在");
    if (mutating) {
      const candidate = next?.current ?? library;
      validateLibrary(candidate);
      try { await context.commit(request, library, candidate, { request_id: requestId as string, fingerprint: request.fingerprint, reply }); } catch (error) { throw operational(error, 500); }
      if (next) { if (path !== "/undo" && path !== "/redo" && next.current) { agentStates.add(next.current); markOperation(next.current, library, "agent", Date.now()); } context.publish(next); }
    }
    return reply;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const status = error instanceof ApiError ? error.status : /503|资料正在处理/.test(message) ? 503 : 422;
    return agentJson(status, { error: message, ...(error instanceof ApiError ? error.detail : {}) });
  } finally { release?.(); }
}
