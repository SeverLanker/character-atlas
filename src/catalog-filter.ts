import { normalizeCatalogName } from "./catalog-key";
import type { CatalogEntry, CatalogKind } from "./model";

export type TagMode = "any" | "all";
export type CatalogSort = "original" | "name" | "favorite";
export interface CatalogFilter {
  kind: CatalogKind;
  query: string;
  /** "all" or `world:<normalized name>` ("world:" = 全库通用). */
  world: string;
  tags: string[];
  tagMode: TagMode;
  favorite: boolean;
  sort: CatalogSort;
}
export const emptyFilter = (kind: CatalogKind): CatalogFilter => ({ kind, query: "", world: "all", tags: [], tagMode: "any", favorite: false, sort: "original" });
/** True when anything beyond the category is narrowing the list (drives 清除筛选). */
export const isFiltered = (filter: CatalogFilter) => !!filter.query.trim() || filter.world !== "all" || filter.tags.length > 0 || filter.favorite;

const inWorld = (entry: CatalogEntry, world: string) => world === "all" || `world:${normalizeCatalogName(entry.world ?? "")}` === world;
/** Entries in the current category and world; tag counts and quick tags are computed over this scope. */
export function scopeEntries(entries: CatalogEntry[], kind: CatalogKind, world: string): CatalogEntry[] {
  return entries.filter(entry => entry.kind === kind && inWorld(entry, world));
}
export function matchesTags(entry: CatalogEntry, tags: string[], mode: TagMode): boolean {
  if (!tags.length) return true;
  const own = new Set(entry.tags ?? []);
  return mode === "all" ? tags.every(tag => own.has(tag)) : tags.some(tag => own.has(tag));
}
export function filterCatalog(entries: CatalogEntry[], filter: CatalogFilter): CatalogEntry[] {
  const tokens = filter.query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
  const rows = scopeEntries(entries, filter.kind, filter.world).filter(entry =>
    matchesTags(entry, filter.tags, filter.tagMode) && (!filter.favorite || entry.favorite) &&
    tokens.every(token => `${entry.title} ${entry.world ?? ""} ${entry.text} ${entry.rank} ${(entry.tags ?? []).join(" ")}`.toLocaleLowerCase().includes(token)));
  if (filter.sort === "name") return [...rows].sort((a, b) => a.title.localeCompare(b.title, "zh-CN"));
  if (filter.sort === "favorite") return [...rows].sort((a, b) => Number(!!b.favorite) - Number(!!a.favorite));
  return rows;
}
export interface TagCount { tag: string; count: number }
/** Per-tag entry counts within the scope, most used first, then by name. */
export function tagCounts(scope: CatalogEntry[]): TagCount[] {
  const counts = new Map<string, number>();
  for (const entry of scope) for (const tag of new Set(entry.tags ?? [])) if (tag.trim()) counts.set(tag, (counts.get(tag) ?? 0) + 1);
  return [...counts].map(([tag, count]) => ({ tag, count })).sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag, "zh-CN"));
}
/** Pinned tags present in the scope first (in pin order), then the most used tags, `limit` in total. */
export function quickTags(counts: TagCount[], pinned: string[], limit = 8): (TagCount & { pinned: boolean })[] {
  const byTag = new Map(counts.map(row => [row.tag, row]));
  const pins = pinned.filter(tag => byTag.has(tag)).map(tag => ({ ...byTag.get(tag)!, pinned: true }));
  const rest = counts.filter(row => !pinned.includes(row.tag)).map(row => ({ ...row, pinned: false }));
  return [...pins, ...rest].slice(0, Math.max(limit, pins.length));
}
export function toggle<T>(list: T[], value: T): T[] { return list.includes(value) ? list.filter(item => item !== value) : [...list, value]; }

export const PAGE_SIZES = [20, 50, 100] as const;
export interface Page { page: number; pages: number; start: number; end: number; total: number }
/** Clamps `page` into range, so deletes or imports never leave the view on an empty page. */
export function paginate(total: number, page: number, size: number): Page {
  const pages = Math.max(1, Math.ceil(total / size));
  const current = Math.min(Math.max(1, Math.trunc(page) || 1), pages);
  const start = total ? (current - 1) * size : 0;
  return { page: current, pages, start, end: Math.min(total, start + size), total };
}
/** Page buttons: first, last, current ±1, with "…" gaps. */
export function pageItems(page: number, pages: number): (number | "…")[] {
  const wanted = new Set([1, pages, page - 1, page, page + 1].filter(n => n >= 1 && n <= pages));
  const sorted = [...wanted].sort((a, b) => a - b), items: (number | "…")[] = [];
  sorted.forEach((n, i) => { if (i && n - sorted[i - 1] > 1) items.push("…"); items.push(n); });
  return items;
}

export interface CatalogPrefs { pageSize: number; pinned: string[] }
const PREF_KEY = "atlas.catalog.prefs";
/** Local UI preferences only; never part of the library or backups. */
export function readCatalogPrefs(storage: Pick<Storage, "getItem"> | undefined = globalThis.localStorage): CatalogPrefs {
  try {
    const value = JSON.parse(storage?.getItem(PREF_KEY) ?? "null");
    const pageSize = PAGE_SIZES.includes(value?.pageSize) ? value.pageSize : 20;
    const pinned = Array.isArray(value?.pinned) ? value.pinned.filter((tag: unknown) => typeof tag === "string").slice(0, 30) : [];
    return { pageSize, pinned };
  } catch { return { pageSize: 20, pinned: [] }; }
}
export function writeCatalogPrefs(prefs: CatalogPrefs, storage: Pick<Storage, "setItem"> | undefined = globalThis.localStorage) {
  try { storage?.setItem(PREF_KEY, JSON.stringify(prefs)); } catch { /* 偏好写不进去时继续使用。 */ }
}
