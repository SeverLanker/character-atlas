import { applyCatalogImport, catalogLabels, exportCatalog, parseCatalog } from "./catalog-io";
import { catalogKey, normalizeCatalogName } from "./catalog-key";
import { validateLibrary, type Library } from "./model";
import { historyReducer, type HistoryState } from "./useLibraryHistory";

export interface AgentReply { status: number; body: string; content_type: string }
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
}
export const agentJson = (status: number, value: unknown): AgentReply => ({ status, body: JSON.stringify(value), content_type: "application/json;charset=utf-8" });
class ApiError extends Error { constructor(public status: number, message: string) { super(message); } }
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
    if (path === "/catalog/import") {
      if ([...url.searchParams.keys()].some(key => key !== "dry_run") || (url.searchParams.has("dry_run") && !["0", "1"].includes(url.searchParams.get("dry_run")!))) throw new ApiError(422, "导入查询参数仅支持 dry_run=0 或 1");
      const unknown = Object.keys(body).filter(key => !["format", "text", "request_id", "overwrite", "overwrite_rows"].includes(key));
      if (unknown.length) throw new ApiError(422, `不支持的导入参数：${unknown.join("、")}`);
    }
    const dry = request.method === "POST" && path === "/catalog/import" && url.searchParams.get("dry_run") === "1";
    const mutating = request.method !== "GET" && !dry;
    const requestId = request.request_id ?? body.request_id;
    if (request.request_id && body.request_id && request.request_id !== body.request_id) throw new ApiError(422, "请求头与请求体的 request_id 不一致");
    if (mutating) {
      if (typeof requestId !== "string" || !/^[A-Za-z0-9._:-]{1,128}$/.test(requestId)) throw new ApiError(422, "写操作必须提供 request_id（1–128 位字母、数字、._:-）");
      const cached = await context.lookup(requestId, request.fingerprint).catch(error => { throw operational(error, 503); });
      if (cached) return cached;
    }
    let reply: AgentReply, next: HistoryState | undefined;
    const catalog = library.catalog ?? [];
    if (request.method === "GET" && path === "/stats") {
      reply = agentJson(200, { characters: library.characters.length, versions: library.characters.reduce((n, c) => n + c.versions.length, 0), catalog: catalog.length, catalog_by_kind: Object.fromEntries(Object.keys(catalogLabels).map(kind => [kind, catalog.filter(row => row.kind === kind).length])), can_undo: !!state.past.length, can_redo: !!state.future.length });
    } else if (request.method === "POST" && path === "/catalog/import") {
      if (typeof body.format !== "string" || !["csv", "json", "tsv"].includes(body.format) || typeof body.text !== "string") throw new ApiError(422, "format 必须为 csv/json/tsv，text 必须为字符串");
      if (body.overwrite !== undefined && (typeof body.overwrite !== "string" || !["all", "skip"].includes(body.overwrite))) throw new ApiError(422, "overwrite 必须为 skip 或 all");
      if (body.overwrite_rows !== undefined && (!Array.isArray(body.overwrite_rows) || body.overwrite_rows.some(v => !Number.isInteger(v) || Number(v) < 1))) throw new ApiError(422, "overwrite_rows 必须为数据行编号数组");
      const rows = parseCatalog(body.text, body.format as "csv" | "json" | "tsv", catalog);
      const duplicates = rows.filter(row => row.status === "duplicate");
      const overwrite = new Set(body.overwrite === "all" ? duplicates.map(row => row.line) : body.overwrite_rows as number[] ?? []);
      if ([...overwrite].some(n => !duplicates.some(row => row.line === n))) throw new ApiError(422, "overwrite_rows 包含非重名行，请先 dry_run 核对");
      const errors = rows.filter(row => row.status === "error").map(row => ({ row: row.line, title: row.title, reason: row.reason }));
      const added = rows.filter(row => row.status === "new").length;
      const warnings = rows.filter(row => row.warnings.length).map(row => ({ row: row.line, title: row.title, warnings: row.warnings, attention: !!row.attention }));
      if (dry) reply = agentJson(200, { total: rows.length, will_add: added, will_overwrite: overwrite.size, skipped_dup: duplicates.length - overwrite.size, errors, warnings, header_notes: rows[0]?.headerNotes ?? [], preview_ids: rows.filter(row => row.entry).map(row => `row:${row.line}`), preview: rows.map(row => ({ row: row.line, title: row.title, status: row.status, reason: row.reason, entry: row.entry })) });
      else {
        const imported = applyCatalogImport(catalog, rows, overwrite);
        // Even all-skipped requests get a durable receipt, but no empty undo step.
        if (added + overwrite.size) next = historyReducer(state, { type: "set", update: { ...library, catalog: imported }, time: Date.now(), checkpoint: true });
        reply = agentJson(200, { added, skipped_dup: duplicates.length - overwrite.size, overwritten: overwrite.size, errors, warnings });
      }
    } else if (request.method === "GET" && path === "/catalog/export") {
      if ([...url.searchParams.keys()].some(key => !["format", "scope", "kind", "world", "tag", "q", "favorite"].includes(key))) throw new ApiError(422, "存在未识别的导出筛选参数");
      if (url.searchParams.has("favorite") && !["0", "1"].includes(url.searchParams.get("favorite")!)) throw new ApiError(422, "favorite 必须为 0 或 1");
      const format = url.searchParams.get("format") ?? "json", scope = url.searchParams.get("scope") ?? "all";
      if (format !== "json" && format !== "csv") throw new ApiError(422, "format 必须为 json 或 csv");
      if (scope !== "all" && !scope.startsWith("kind:") && !scope.startsWith("world:")) throw new ApiError(422, "scope 必须为 all / kind:skill / world:世界名");
      const kind = scope.startsWith("kind:") ? scope.slice(5) : url.searchParams.get("kind");
      if (kind && !Object.hasOwn(catalogLabels, kind)) throw new ApiError(422, "类别必须是 skill/spell/specialty/item");
      const world = scope.startsWith("world:") ? scope.slice(6) : url.searchParams.get("world");
      const tokens = (url.searchParams.get("q") ?? "").trim().toLowerCase().split(/\s+/).filter(Boolean);
      const tag = url.searchParams.get("tag");
      const selected = catalog.filter(row => (!kind || row.kind === kind) && (world === null || normalizeCatalogName(row.world ?? "") === normalizeCatalogName(world)) && (!tag || row.tags?.includes(tag)) && (url.searchParams.get("favorite") !== "1" || row.favorite) && tokens.every(token => `${row.title} ${row.world ?? ""} ${row.rank} ${row.text} ${(row.tags ?? []).join(" ")}`.toLowerCase().includes(token)));
      reply = { status: 200, body: exportCatalog(selected, format), content_type: format === "json" ? "application/json;charset=utf-8" : "text/csv;charset=utf-8" };
    } else if (path.startsWith("/catalog/") && path.split("/").length === 3) {
      const id = decodeURIComponent(path.slice(9)), found = catalog.find(row => row.id === id);
      if (!found) throw new ApiError(404, "条目不存在");
      if (request.method === "GET") reply = agentJson(200, found);
      else if (request.method === "PATCH") {
        const unknown = Object.keys(body).filter(key => !["world", "rank", "tags", "text", "request_id"].includes(key));
        if (unknown.length) throw new ApiError(422, `不支持修改字段：${unknown.join("、")}`);
        const patch = Object.fromEntries(Object.entries(body).filter(([key]) => key !== "request_id"));
        const candidate = { ...found, ...patch, updatedAt: new Date().toISOString() };
        const checked = parseCatalog(JSON.stringify([candidate]), "json", catalog.filter(row => row.id !== id));
        if (checked[0].status === "error") throw new ApiError(422, checked[0].reason);
        if (catalog.some(row => row.id !== id && catalogKey(row) === catalogKey(candidate))) throw new ApiError(409, "修改后与同世界、同类别条目重名");
        next = historyReducer(state, { type: "set", update: { ...library, catalog: catalog.map(row => row.id === id ? candidate : row) }, checkpoint: true, time: Date.now() });
        reply = agentJson(200, candidate);
      } else if (request.method === "DELETE") {
        next = historyReducer(state, { type: "set", update: { ...library, catalog: catalog.filter(row => row.id !== id) }, checkpoint: true, time: Date.now() });
        reply = agentJson(200, { deleted: id, remaining: catalog.length - 1 });
      } else throw new ApiError(405, "不支持的请求方法");
    } else if (request.method === "POST" && ["/undo", "/redo"].includes(path)) {
      next = historyReducer(state, { type: path === "/undo" ? "undo" : "redo" });
      if (next === state) throw new ApiError(409, "没有可撤销／重做的操作（历史仅在本次应用会话保留）");
      reply = agentJson(200, { action: path.slice(1), catalog: next.current?.catalog?.length ?? 0 });
    } else throw new ApiError(404, "接口不存在");
    if (mutating) {
      const candidate = next?.current ?? library;
      validateLibrary(candidate);
      try { await context.commit(request, library, candidate, { request_id: requestId as string, fingerprint: request.fingerprint, reply }); } catch (error) { throw operational(error, 500); }
      if (next) context.publish(next);
    }
    return reply;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const status = error instanceof ApiError ? error.status : /503|资料正在处理/.test(message) ? 503 : 422;
    return agentJson(status, { error: message });
  } finally { release?.(); }
}
