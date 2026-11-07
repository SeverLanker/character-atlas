import type { Character, ExternalArchiveRef, Library, Visibility, World, WorldLink } from "./model.ts";
import { isStableId } from "./external-archives.ts";

const stamp = () => new Date().toISOString();

export function createWorld(name: string, summary = "", visibility: Visibility = "private", id = crypto.randomUUID()): World {
  const time = stamp();
  return { id, name, summary, visibility, links: [], createdAt: time, updatedAt: time };
}

export function worldLabelMap(worlds: World[]): Map<string, string> {
  const keyOf = (world: World) => world.name.trim() || "未命名世界";
  const counts = new Map<string, number>();
  for (const world of worlds) counts.set(keyOf(world), (counts.get(keyOf(world)) ?? 0) + 1);
  const labels = new Map<string, string>();
  for (const world of worlds) {
    const key = keyOf(world);
    labels.set(world.id, (counts.get(key) ?? 0) > 1 ? `${key} · ${world.id.slice(0, 8)}` : key);
  }
  return labels;
}

export function withWorld(library: Library, world: World): Library {
  if (!isStableId(world.id)) throw new Error("世界编号无效");
  if (world.name.length > 200) throw new Error("世界名称无效");
  const next = structuredClone(library);
  const worlds = next.worlds ?? [];
  if (worlds.some((item) => item.id === world.id)) throw new Error("世界编号重复");
  next.worlds = [...worlds, world];
  return next;
}

/** Sets or clears the explicit world link. Does not read or write `collection`. */
export function assignCharacterWorld(library: Library, characterId: string, worldId: string | null): Library {
  if (worldId !== null && !isStableId(worldId)) throw new Error("世界编号无效");
  const next = structuredClone(library);
  const character = next.characters.find((item) => item.id === characterId);
  if (!character) throw new Error("找不到角色");
  if (worldId) character.worldId = worldId;
  else delete character.worldId;
  character.updatedAt = stamp();
  return next;
}

export function withWorldLink(library: Library, worldId: string, targetWorldId: string, note = ""): Library {
  if (!isStableId(worldId) || !isStableId(targetWorldId)) throw new Error("世界编号无效");
  if (worldId === targetWorldId) throw new Error("世界不能引用自己");
  const next = structuredClone(library);
  const world = next.worlds?.find((item) => item.id === worldId);
  if (!world) throw new Error("找不到世界");
  const link: WorldLink = { id: crypto.randomUUID(), targetWorldId, note };
  world.links = [...world.links, link];
  world.updatedAt = stamp();
  return next;
}

export function charactersInWorld(library: Library, worldId: string): Character[] {
  return library.characters.filter((character) => character.worldId === worldId);
}

export function looseCharacters(library: Library): Character[] {
  const ids = new Set((library.worlds ?? []).map((world) => world.id));
  return library.characters.filter((character) => !character.worldId || !ids.has(character.worldId));
}

export function worldMissing(library: Library, character: Character): boolean {
  return !!character.worldId && !(library.worlds ?? []).some((world) => world.id === character.worldId);
}

export function versionSummary(character: Character): string {
  return `${character.versions.length} 个剧情版本：${character.versions.map((version) => version.name).join("、")}`;
}

export type WorldScope = "owner" | "public";

export function worldsInScope(library: Library, scope: WorldScope): World[] {
  const worlds = library.worlds ?? [];
  return scope === "public" ? worlds.filter((world) => world.visibility === "public") : worlds;
}

export function archivesInScope(library: Library, scope: WorldScope, worldId?: string): ExternalArchiveRef[] {
  return (library.externalArchives ?? []).filter((ref) => {
    if (worldId !== undefined && ref.worldId !== worldId) return false;
    return scope === "owner" || ref.visibility === "public";
  });
}

/**
 * Library handed to the Agent backup and any other outward Agent payload that
 * would otherwise serialize the whole database. Public worlds stay. Private
 * worlds, every archive title, every relative path and every root label are removed.
 * Character records, collection strings and secret overlays are unchanged.
 * When there is nothing private to remove, the library is returned unchanged.
 */
export function agentVisibleLibrary(library: Library): Library {
  const hasArchive = (library.externalArchives?.length ?? 0) > 0 || (library.archiveRoots?.length ?? 0) > 0;
  const hasPrivateWorld = (library.worlds ?? []).some((world) => world.visibility !== "public");
  if (!hasArchive && !hasPrivateWorld) return library;
  const clone = structuredClone(library);
  if (clone.worlds) {
    const publics = clone.worlds.filter((world) => world.visibility === "public");
    const ids = new Set(publics.map((world) => world.id));
    clone.worlds = publics.map((world) => ({ ...world, links: world.links.filter((link) => ids.has(link.targetWorldId)) }));
  }
  delete clone.archiveRoots;
  delete clone.externalArchives;
  for (const character of clone.characters) {
    if (character.worldId && !(clone.worlds ?? []).some((world) => world.id === character.worldId)) delete character.worldId;
  }
  return clone;
}
