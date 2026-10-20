import { validateLibrary, uid, type CatalogEntry, type CatalogKind } from "./model";

export const catalogLabels: Record<CatalogKind, string> = { skill: "技能", spell: "法术", specialty: "专长", item: "物品" };
const columns = ["名称", "类别", "等级", "标签", "说明"];
const maxBytes = 32 * 1024 * 1024;
export const catalogKey = (entry: Pick<CatalogEntry, "kind" | "title">) => `${entry.kind}:${entry.title.trim().toLocaleLowerCase()}`;
export interface CatalogImportRow {
  line: number; title: string; status: "new" | "duplicate" | "error"; reason: string;
  entry?: CatalogEntry; supplied: string[];
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
    const header = rows.shift()?.map(cell => cell.trim()) ?? [];
    if (columns.some(key => !header.includes(key)) || new Set(header).size !== header.length) throw new Error("表头需包含且不能重复：名称、类别、等级、标签、说明。");
    raw = rows.map(cells => cells.length !== header.length ? { _error: `列数 ${cells.length} 与表头 ${header.length} 不符；含逗号或换行的内容需用双引号包围` } : Object.fromEntries(header.map((key, i) => [key, cells[i]])));
  }
  if (raw.length > 10000) throw new Error("单次最多导入 10000 条，请分批导入。");
  const seen = new Set(existing.map(catalogKey));
  return raw.map((value, index) => {
    const result: CatalogImportRow = { line: index + (format === "json" ? 1 : 2), title: "未命名", status: "error", reason: "", supplied: [] };
    try {
      if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("条目必须是对象");
      const row = value as Record<string, unknown>;
      if (row._error) throw new Error(String(row._error));
      const external = "名称" in row || "类别" in row;
      const get = (chinese: string, internal: string) => row[external ? chinese : internal];
      const title = get("名称", "title");
      if (typeof title !== "string" || !title.trim()) throw new Error("名称必填且必须是字符串");
      result.title = title.trim();
      const kindValue = get("类别", "kind");
      const kind = external ? Object.keys(catalogLabels).find(key => catalogLabels[key as CatalogKind] === kindValue) : kindValue;
      if (typeof kind !== "string" || !Object.keys(catalogLabels).includes(kind)) throw new Error("类别必须是：技能、法术、专长、物品");
      const rank = get("等级", "rank") === undefined ? "" : get("等级", "rank"), description = get("说明", "text") === undefined ? "" : get("说明", "text");
      if (typeof rank !== "string") throw new Error("等级必须是字符串");
      if (typeof description !== "string") throw new Error("说明必须是字符串");
      let tags = get("标签", "tags") === undefined ? [] : get("标签", "tags");
      if (format !== "json" && typeof tags === "string") tags = tags.split(/[、,，]/).map(tag => tag.trim()).filter(Boolean);
      if (!Array.isArray(tags) || tags.some(tag => typeof tag !== "string")) throw new Error("标签必须是字符串数组");
      if (tags.length > 50 || tags.some(tag => tag.length > 100)) throw new Error("标签最多 50 个，每个最多 100 字");
      for (const key of ["common", "favorite"]) if (row[key] !== undefined && typeof row[key] !== "boolean") throw new Error(`${key} 必须是布尔值`);
      if (row.id !== undefined && (typeof row.id !== "string" || !row.id.trim())) throw new Error("内部 id 必须是非空字符串");
      for (const key of ["createdAt", "updatedAt"]) if (row[key] !== undefined && (typeof row[key] !== "string" || !Number.isFinite(Date.parse(row[key] as string)))) throw new Error(`${key} 必须是有效的日期字符串`);
      const entry: CatalogEntry = { id: typeof row.id === "string" ? row.id : uid(), kind: kind as CatalogKind, title: title.trim(), rank, text: description, tags: [...new Set(tags.map(tag => tag.trim()).filter(Boolean))], common: row.common === true };
      if (typeof row.favorite === "boolean") entry.favorite = row.favorite;
      if (typeof row.createdAt === "string") entry.createdAt = row.createdAt;
      if (typeof row.updatedAt === "string") entry.updatedAt = row.updatedAt;
      result.supplied = Object.keys(row);
      result.entry = entry;
      result.status = seen.has(catalogKey(entry)) ? "duplicate" : "new";
      result.reason = result.status === "duplicate" ? "库中或本次文件内已有同类同名条目" : "校验通过";
      seen.add(catalogKey(entry));
    } catch (error) { result.reason = error instanceof Error ? error.message : String(error); }
    return result;
  });
}

export function applyCatalogImport(existing: CatalogEntry[], rows: CatalogImportRow[], overwrite: Set<number>, now = new Date().toISOString()): CatalogEntry[] {
  const result = existing.map(entry => ({ ...entry }));
  for (const row of rows) {
    if (!row.entry || row.status === "error" || (row.status === "duplicate" && !overwrite.has(row.line))) continue;
    const item = row.entry, index = result.findIndex(entry => catalogKey(entry) === catalogKey(item));
    const previous = result[index];
    const id = previous?.id ?? (result.some(entry => entry.id === item.id) ? uid() : item.id);
    const saved = { ...previous, ...item, id, createdAt: previous?.createdAt ?? item.createdAt ?? now, updatedAt: item.updatedAt ?? now };
    if (previous && !row.supplied.includes("common")) saved.common = previous.common;
    if (index < 0) result.push(saved); else result[index] = saved;
  }
  if (result.length > 10000) throw new Error("合并后条目超过 10000 条，请减少导入数量。");
  validateLibrary({ schemaVersion: 2, characters: [], catalog: result });
  return result;
}

export function exportCatalog(entries: CatalogEntry[], format: "json" | "csv"): string {
  if (format === "json") return JSON.stringify({ format: "character-atlas-catalog", schemaVersion: 1, entries }, null, 2);
  const quote = (value: string) => `"${value.replaceAll('"', '""')}"`;
  return "\uFEFF" + [columns, ...entries.map(entry => [entry.title, catalogLabels[entry.kind], entry.rank, (entry.tags ?? []).join("、"), entry.text])].map(row => row.map(quote).join(",")).join("\r\n");
}
