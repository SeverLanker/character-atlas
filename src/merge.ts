import { uid, validateLibrary, type Character, type Library } from "./model.ts";

export type ImportChoice = "skip" | "replace" | "copy";
export type ImportChoices = Record<string, ImportChoice>;
export function defaultImportChoice(current: Library, character: Character): ImportChoice {
  return current.characters.some((row) => row.id === character.id) ? "skip" : "copy";
}
function freshCharacter(source: Character): Character {
  const clone = structuredClone(source);
  clone.id = uid();
  const defaultIndex = source.versions.findIndex((version) => version.id === source.defaultVersionId);
  function freshIds(value: unknown) {
    if (!value || typeof value !== "object") return;
    for (const [key, child] of Object.entries(value)) {
      if (key === "id") (value as Record<string, unknown>)[key] = uid();
      else freshIds(child);
    }
  }
  freshIds(clone.versions);
  clone.defaultVersionId = clone.versions[Math.max(0, defaultIndex)].id;
  return clone;
}
export function mergeLibraries(current: Library, incoming: Library, choices: ImportChoices): Library {
  validateLibrary(current); validateLibrary(incoming);
  const result = structuredClone(current);
  result.schemaVersion = 2;
  const prepared = new Map<string, Character>();
  for (const character of incoming.characters) {
    const choice = choices[character.id] ?? defaultImportChoice(current, character);
    if (choice !== 'skip') prepared.set(character.id, choice === 'copy' && current.characters.some(c => c.id === character.id) ? freshCharacter(character) : structuredClone(character));
  }
  for (const clone of prepared.values()) {
    for (const version of clone.versions) {
      for (const profile of [version.profile, version.secret.overrides]) {
        for (const relation of profile.relationships ?? []) {
          if (relation.targetCharacterId && prepared.has(relation.targetCharacterId)) relation.targetCharacterId = prepared.get(relation.targetCharacterId)!.id;
        }
      }
    }
  }
  for (const character of incoming.characters) {
    const choice = choices[character.id] ?? defaultImportChoice(current, character);
    if (choice === "skip") continue;
    const index = result.characters.findIndex((row) => row.id === character.id);
    if (choice === "replace" && index >= 0) result.characters[index] = prepared.get(character.id)!;
    else result.characters.push(prepared.get(character.id)!);
  }
  if (incoming.catalog?.length) {
    result.catalog ??= [];
    for (const entry of incoming.catalog) {
      const previous = result.catalog.find((row) => row.id === entry.id);
      if (previous && Object.keys({ ...previous, ...entry }).every((key) => JSON.stringify((previous as unknown as Record<string, unknown>)[key]) === JSON.stringify((entry as unknown as Record<string, unknown>)[key]))) continue;
      result.catalog.push({ ...entry, id: previous ? uid() : entry.id });
    }
  }
  validateLibrary(result);
  return result;
}
