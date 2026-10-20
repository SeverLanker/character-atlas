import { validateLibrary, uid, type CatalogEntry, type CatalogKind } from "./model";

export const catalogLabels: Record<CatalogKind, string> = { skill: "技能", spell: "法术", specialty: "专长", item: "物品" };
const columns = ["名称", "类别", "等级", "标签", "说明"];
const maxBytes = 32 * 1024 * 1024;
import { catalogKey, normalizeCatalogName } from "./catalog-key";
export { catalogKey } from "./catalog-key";
const aliases: Record<string, string> = {
 名称:"名称",名字:"名称",条目名:"名称",name:"名称",title:"名称",
 类别:"类别",类型:"类别",分类:"类别",kind:"类别",
 等级:"等级",级别:"等级",rank:"等级",标签:"标签",tag:"标签",tags:"标签",
 说明:"说明",内容:"说明",描述:"说明",text:"说明",世界:"世界",作品:"世界",world:"世界",
};
export interface CatalogImportRow {
  line: number; title: string; status: "new" | "duplicate" | "error"; reason: string;
  entry?: CatalogEntry; supplied: string[];
  warnings: string[]; attention?: boolean; headerNotes: string[];
}

/** CSV/TSV state machine: quoted commas, escaped quotes and multiline descriptions. */
function table(text: string, separator: string): string[][] {
  const rows: string[][] = []; let row: string[] = [], cell = "", quoted = false, closed = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else { quoted = false; closed = true; } }
      else cell += c;
    } else if (c === separator || c === "\n" || c === "\r") {
      row.push(cell); cell = ""; closed = false;
      if (c !== separator) { if (row.some(value => value.trim())) rows.push(row); row = []; if (c === "\r" && text[i + 1] === "\n") i++; }
    } else if (c === '"' && !cell && !closed) quoted = true;
    else { if (closed || c === '"') throw new Error("表格引号格式错误，请检查引号或使用标准 CSV 导出。"); cell += c; }
  }
  if (quoted) throw new Error("CSV 引号未闭合，未导入任何内容。");
  row.push(cell); if (row.some(value => value.trim())) rows.push(row);
  return rows;
}

export function parseCatalog(text: string, format: "json" | "csv" | "tsv", existing: CatalogEntry[]): CatalogImportRow[] {
  if (new TextEncoder().encode(text).length > maxBytes) throw new Error("条目文件超过 32 MB，请分批导入。");
  text = text.replace(/^\uFEFF/, "");
  let raw: unknown[];
  const headerNotes: string[] = [];
  if (format === "json") {
    let data: unknown;
    try { data = JSON.parse(text); } catch { throw new Error("JSON 语法错误，未导入任何内容。"); }
    if (Array.isArray(data)) raw = data;
    else if (data && typeof data === "object" && "entries" in data && Array.isArray(data.entries)) {
      if ("schemaVersion" in data && data.schemaVersion !== 1) throw new Error("不支持的条目文件版本，请使用 schemaVersion: 1。");
      raw = data.entries;
    }
    else throw new Error("JSON 应为条目数组，或包含 entries 数组的对象。");
  } else {
    const rows = table(text, format === "tsv" ? "\t" : ",");
    const original = rows.shift()?.map(cell => cell.trim()) ?? [];
    const header = original.map(cell => { const key = normalizeCatalogName(cell); return Object.hasOwn(aliases, key) ? aliases[key] : cell; });
    const missing = columns.filter(key => !header.includes(key));
    const duplicates = [...new Set(header.filter((key, i) => header.indexOf(key) !== i))];
    if (missing.length || duplicates.length) throw new Error(`表头错误（第 1 行）：收到「${original.join("、") || "空表头"}」；${missing.length ? `缺少列：${missing.join("、")}；` : ""}${duplicates.length ? `映射后重复列：${duplicates.join("、")}；` : ""}需包含名称、类别、等级、标签、说明。`);
    original.forEach((cell, i) => {
      if (cell !== header[i]) headerNotes.push(`第 1 行：『${cell}』按『${header[i]}』处理`);
      if (![...columns, "世界"].includes(header[i])) headerNotes.push(`第 1 行：未识别列『${cell}』，将忽略`);
    });
    raw = rows.map(cells => cells.length !== header.length ? { _error: `列数 ${cells.length} 与表头 ${header.length} 不符；含逗号或换行的内容需用双引号包围` } : Object.fromEntries(header.map((key, i) => [[...columns, "世界"].includes(key) ? key : `${key}（未识别列）`, cells[i]])));

  }
  if (raw.length > 10000) throw new Error("单次最多导入 10000 条，请分批导入。");
  const seen = new Set(existing.map(catalogKey));
  const compared = new Map<string, CatalogEntry>();
  const existingCounts = new Map<string, number>();
  const crossKey = (item: CatalogEntry) => JSON.stringify([normalizeCatalogName(item.world ?? ""), normalizeCatalogName(item.title)]);
  const categories = new Map<string, Set<string>>();
  function remember(item: CatalogEntry) {
    const key = catalogKey(item); if (!compared.has(key)) compared.set(key, item);
    const name = crossKey(item); const kinds = categories.get(name) ?? new Set<string>(); kinds.add(item.kind); categories.set(name, kinds);
  }
  for (const item of existing) { remember(item); const key = catalogKey(item); existingCounts.set(key, (existingCounts.get(key) ?? 0) + 1); }
  return raw.map((value, index) => {
    const result: CatalogImportRow = { line: index + 1, title: "未命名", status: "error", reason: "", supplied: [], warnings: [], headerNotes };
    try {
      if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("条目必须是对象");
      const row = value as Record<string, unknown>;
      if (row._error) throw new Error(String(row._error));
      const external = "名称" in row || "类别" in row;
      const get = (chinese: string, internal: string) => row[external ? chinese : internal];
      const known = new Set([...(external ? ["名称", "类别", "等级", "标签", "说明", "世界"] : ["title", "kind", "rank", "tags", "text", "world"]), "id", "common", "favorite", "createdAt", "updatedAt"]);
      const unknown = Object.keys(row).filter(key => !known.has(key));
      if (unknown.length) result.warnings.push(`忽略字段：${unknown.join("、")}`);
      const title = get("名称", "title");
      if (typeof title !== "string" || !title.trim()) throw new Error("名称必填且必须是字符串");
      result.title = title.trim();
      const kindValue = get("类别", "kind");
      const kind = external ? Object.keys(catalogLabels).find(key => catalogLabels[key as CatalogKind] === kindValue) ?? kindValue : kindValue;
      if (typeof kind !== "string" || !Object.keys(catalogLabels).includes(kind)) throw new Error("类别必须是：技能、法术、专长、物品");
      const rank = get("等级", "rank") === undefined ? "" : get("等级", "rank"), description = get("说明", "text") === undefined ? "" : get("说明", "text");
      if (typeof rank !== "string") throw new Error("等级必须是字符串");
      if (typeof description !== "string") throw new Error("说明必须是字符串");
      let tags = get("标签", "tags") === undefined ? [] : get("标签", "tags");
      if (format !== "json" && typeof tags === "string") tags = tags.trim().split(/(?<=\S)[、,，；;|/](?=\S)/).map(tag => tag.trim()).filter(Boolean);
      if (!Array.isArray(tags) || tags.some(tag => typeof tag !== "string")) throw new Error("标签必须是字符串数组");
      if (tags.length > 50 || tags.some(tag => tag.length > 100)) throw new Error("标签最多 50 个，每个最多 100 字");
      for (const key of ["common", "favorite"]) if (row[key] !== undefined && typeof row[key] !== "boolean") throw new Error(`${key} 必须是布尔值`);
      if (row.id !== undefined && (typeof row.id !== "string" || !row.id.trim())) throw new Error("内部 id 必须是非空字符串");
      for (const key of ["createdAt", "updatedAt"]) if (row[key] !== undefined && (typeof row[key] !== "string" || !Number.isFinite(Date.parse(row[key] as string)))) throw new Error(`${key} 必须是有效的日期字符串`);
      const world = get("世界", "world");
      if (world !== undefined && (typeof world !== "string" || world.length > 200)) throw new Error("世界／作品必须是字符串，最多 200 字");
      const entry: CatalogEntry = { id: typeof row.id === "string" ? row.id : uid(), kind: kind as CatalogKind, title: title.trim(), rank, text: description, tags: [...new Set(tags.map(tag => tag.trim()).filter(Boolean))], common: row.common === true };
      if (typeof world === "string") entry.world = world.trim();
      if (typeof row.favorite === "boolean") entry.favorite = row.favorite;
      if (typeof row.createdAt === "string") entry.createdAt = row.createdAt;
      if (typeof row.updatedAt === "string") entry.updatedAt = row.updatedAt;
      result.supplied = Object.keys(row);
      result.entry = entry;
      const matched = compared.get(catalogKey(entry));
      const matches = matched ? [matched] : [];
      if ((existingCounts.get(catalogKey(entry)) ?? 0) > 1) throw new Error("库内已有多条归一化同名条目，请先整理或更名后再导入，避免覆盖错误对象");
      if ([...(categories.get(crossKey(entry)) ?? [])].some(kind => kind !== entry.kind)) result.warnings.push("同一世界有同名但不同类别的条目，将独立保留，不自动合并");
      if (matches.some(item => item.title !== entry.title || (item.world ?? "") !== (entry.world ?? ""))) result.warnings.push("名称或世界经 NFKC、空格归一后重名；覆盖保留原名称与世界写法");
      if (unknown.length && !rank.trim() && !description.trim() && !entry.tags?.length) result.attention = true;
      result.status = seen.has(catalogKey(entry)) ? "duplicate" : "new";
      result.reason = result.status === "duplicate" ? "库中或本次文件内已有同类同名条目" : "校验通过";
      seen.add(catalogKey(entry));
      remember(entry);
    } catch (error) { result.entry = undefined; result.reason = error instanceof Error ? error.message : String(error); }
    return result;
  });
}

export function applyCatalogImport(existing: CatalogEntry[], rows: CatalogImportRow[], overwrite: Set<number>, now = new Date().toISOString()): CatalogEntry[] {
  const result = existing.map(entry => ({ ...entry }));
  const positions = new Map(result.map((entry, index) => [catalogKey(entry), index]));
  const ids = new Set(result.map(entry => entry.id));
  for (const row of rows) {
    if (!row.entry || row.status === "error" || (row.status === "duplicate" && !overwrite.has(row.line))) continue;
    const item = row.entry, index = positions.get(catalogKey(item)) ?? -1;
    const previous = result[index];
    const id = previous?.id ?? (ids.has(item.id) ? uid() : item.id);
    const saved = { ...previous, ...item, id, createdAt: previous?.createdAt ?? item.createdAt ?? now, updatedAt: item.updatedAt ?? now };
    if (previous) { saved.title = previous.title; saved.world = previous.world; }
    if (previous && !row.supplied.includes("common")) saved.common = previous.common;
    if (index < 0) { positions.set(catalogKey(saved), result.length); result.push(saved); } else result[index] = saved;
    ids.add(id);
  }
  if (result.length > 10000) throw new Error("合并后条目超过 10000 条，请减少导入数量。");
  validateLibrary({ schemaVersion: 2, characters: [], catalog: result });
  return result;
}

export function exportCatalog(entries: CatalogEntry[], format: "json" | "csv"): string {
  if (format === "json") return JSON.stringify({ format: "character-atlas-catalog", schemaVersion: 1, entries }, null, 2);
  const quote = (value: string) => `"${value.replaceAll('"', '""')}"`;
  const withWorld = entries.some(entry => !!entry.world?.trim());
  return "\uFEFF" + [[...columns, ...(withWorld ? ["世界"] : [])], ...entries.map(entry => [entry.title, catalogLabels[entry.kind], entry.rank, (entry.tags ?? []).join("、"), entry.text, ...(withWorld ? [entry.world ?? ""] : [])])].map(row => row.map(quote).join(",")).join("\r\n");
}
