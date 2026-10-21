import type { CatalogEntry } from "./model";

/** Only comparison changes: never rewrite the displayed title or world. */
export const normalizeCatalogName = (value: string) => value.normalize("NFKC").trim().replace(/\s+/g, " ").replace(/\s*([()])\s*/g, "$1").toLowerCase();
export const catalogKey = (entry: Pick<CatalogEntry, "kind" | "title" | "world">) => JSON.stringify([normalizeCatalogName(entry.world ?? ""), entry.kind, normalizeCatalogName(entry.title)]);
