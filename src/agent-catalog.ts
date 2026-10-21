import { catalogLabels } from "./catalog-io";
import { catalogKey, normalizeCatalogName } from "./catalog-key";
import type { CatalogEntry, CatalogKind } from "./model";

/** API field names with their UI labels, for bilingual error messages. */
export const fieldLabels: Record<string, string> = {
  title: "名称", kind: "类别", rank: "等级", tags: "标签", text: "说明", world: "世界", source: "来源", sourceId: "来源编号",
  favorite: "收藏", common: "常用", extra: "附加字段", request_id: "请求编号", dry_run: "预览", format: "格式", overwrite: "覆盖策略",
  overwrite_rows: "覆盖行", filter: "筛选", set: "设置", add_tags: "添加标签", remove_tags: "移除标签", ids: "条目 id", limit: "数量",
  cursor: "游标", q: "关键词", tag: "标签", tag_mode: "标签匹配", scope: "范围", by: "判重方式", all: "全部",
};
export const field = (key: string) => fieldLabels[key] ? `${key}（${fieldLabels[key]}）` : key;
export const fields = (keys: string[]) => keys.map(field).join("、");

export interface CatalogQuery {
  kind?: CatalogKind; world?: string; tags: string[]; tagMode: "any" | "all"; q: string[]; favorite?: boolean; ids?: string[];
}
export class QueryError extends Error {}

/** Reads the shared filter vocabulary from query parameters or a JSON object. Unknown keys are the caller's job. */
export function readQuery(get: (key: string) => unknown): CatalogQuery {
  const text = (key: string) => { const value = get(key); if (value !== undefined && value !== null && typeof value !== "string") throw new QueryError(`${field(key)} 必须是字符串`); return value === null ? undefined : value as string | undefined; };
  const list = (key: string) => { const value = get(key); if (value === undefined || value === null) return undefined; if (Array.isArray(value)) { if (value.some(item => typeof item !== "string")) throw new QueryError(`${field(key)} 必须是字符串数组`); return value as string[]; } if (typeof value !== "string") throw new QueryError(`${field(key)} 必须是字符串或数组`); return value.split(",").map(item => item.trim()).filter(Boolean); };
  const kind = text("kind");
  if (kind && !Object.hasOwn(catalogLabels, kind)) throw new QueryError(`${field("kind")} 必须是 skill/spell/specialty/item`);
  const mode = text("tag_mode") ?? "any";
  if (mode !== "any" && mode !== "all") throw new QueryError(`${field("tag_mode")} 必须是 any 或 all`);
  const favorite = get("favorite");
  if (favorite !== undefined && favorite !== null && !["0", "1", true, false].includes(favorite as string)) throw new QueryError(`${field("favorite")} 必须为 0/1 或布尔值`);
  const ids = list("ids");
  return {
    kind: kind as CatalogKind | undefined, world: text("world"), tags: [...(text("tag") ? [text("tag")!] : []), ...(list("tags") ?? [])], tagMode: mode,
    q: (text("q") ?? "").trim().toLowerCase().split(/\s+/).filter(Boolean),
    favorite: favorite === "1" || favorite === true ? true : undefined, ids,
  };
}
export const queryIsEmpty = (query: CatalogQuery) => !query.kind && query.world === undefined && !query.tags.length && !query.q.length && !query.favorite && !query.ids;

/** Same matching as the catalog page: world is compared NFKC-normalised, keywords are AND over title/world/rank/text/tags. */
export function selectCatalog(catalog: CatalogEntry[], query: CatalogQuery): CatalogEntry[] {
  const ids = query.ids && new Set(query.ids), world = query.world === undefined ? undefined : normalizeCatalogName(query.world);
  return catalog.filter(row => (!ids || ids.has(row.id)) && (!query.kind || row.kind === query.kind)
    && (world === undefined || normalizeCatalogName(row.world ?? "") === world)
    && (!query.tags.length || (query.tagMode === "all" ? query.tags.every(tag => row.tags?.includes(tag)) : query.tags.some(tag => row.tags?.includes(tag))))
    && (!query.favorite || !!row.favorite)
    && query.q.every(token => `${row.title} ${row.world ?? ""} ${row.rank} ${row.text} ${(row.tags ?? []).join(" ")} ${row.source ?? ""} ${row.sourceId ?? ""}`.toLowerCase().includes(token)));
}
/** List rows without text or extra. */
export const lightEntry = (row: CatalogEntry) => ({ id: row.id, kind: row.kind, title: row.title, rank: row.rank, tags: row.tags ?? [], world: row.world ?? "", favorite: !!row.favorite, ...(row.source ? { source: row.source } : {}), ...(row.sourceId ? { sourceId: row.sourceId } : {}), updatedAt: row.updatedAt ?? row.createdAt ?? null });

export function worldCounts(catalog: CatalogEntry[]) {
  const counts = new Map<string, { world: string; count: number }>();
  for (const row of catalog) { const key = normalizeCatalogName(row.world ?? ""), item = counts.get(key) ?? { world: (row.world ?? "").trim(), count: 0 }; item.count++; counts.set(key, item); }
  return Object.fromEntries([...counts.values()].map(item => [item.world, item.count]));
}
export function tagList(catalog: CatalogEntry[]) {
  const counts = new Map<string, number>();
  for (const row of catalog) for (const tag of row.tags ?? []) counts.set(tag, (counts.get(tag) ?? 0) + 1);
  return [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "zh-CN")).map(([tag, count]) => ({ tag, count }));
}
/** by=normalized uses the import dedupe key (world + kind + NFKC name); by=name compares exact world + kind + title. */
export function duplicateGroups(catalog: CatalogEntry[], by: "normalized" | "name") {
  const groups = new Map<string, CatalogEntry[]>();
  for (const row of catalog) { const key = by === "name" ? JSON.stringify([row.world ?? "", row.kind, row.title]) : catalogKey(row); groups.set(key, [...(groups.get(key) ?? []), row]); }
  return [...groups.values()].filter(rows => rows.length > 1).map(rows => ({ kind: rows[0].kind, world: rows[0].world ?? "", title: rows[0].title, ids: rows.map(row => row.id), titles: rows.map(row => row.title) }));
}
