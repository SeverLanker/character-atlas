import { assetRefs, type Library } from "./model";
import { catalogKey } from "./catalog-key";
import type { AssetInfo } from "./storage";
export function inspectLibraryHealth(library: Library, files: AssetInfo[], backupRefs: string[] = []) {
  const existing = new Set(files.map(file => file.name)), refs = new Set(assetRefs(library));
  const protectedRefs = new Set([...refs, ...backupRefs]), ids = new Set(library.characters.map(c => c.id));
  const links: { character: string; version: string; secret: boolean; target: string }[] = [];
  for (const c of library.characters) for (const v of c.versions) for (const [secret, profile] of [[false, v.profile], [true, v.secret.overrides]] as const) {
    for (const row of profile.relationships ?? []) if (row.targetCharacterId && !ids.has(row.targetCharacterId)) links.push({ character: c.name, version: v.name, secret, target: row.targetCharacterId });
  }
  const catalog = new Map<string, { title: string; world: string; ids: string[] }>();
  for (const row of library.catalog ?? []) {
    const key = catalogKey(row), group = catalog.get(key) ?? { title: row.title, world: row.world || "全库通用", ids: [] };
    group.ids.push(row.id); catalog.set(key, group);
  }
  return { missing: [...refs].filter(ref => !existing.has(ref)), unreferenced: files.filter(file => !protectedRefs.has(file.name)), links, duplicates: [...catalog.values()].filter(group => group.ids.length > 1), bytes: files.reduce((n, file) => n + file.bytes, 0) };
}
