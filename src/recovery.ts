import { migrateLibrary, validateLibrary, type Library } from "./model";

export interface RecoveryProposal { library: Library; changes: string[]; excluded: number }
const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value);
export function inspectRecovery(raw: unknown): RecoveryProposal {
  const value: unknown = typeof raw === "string" ? JSON.parse(raw) : structuredClone(raw);
  if (!object(value) || ![1, 2].includes(Number(value.schemaVersion)) || !Array.isArray(value.characters))
    throw new Error("无法识别资料库结构，请先导出原始资料手动检查。");
  const changes: string[] = [];
  const valid: Library["characters"] = [];
  const ids = new Set<string>();
  let excluded = 0;
  for (const [index, character] of value.characters.entries()) {
    const name = object(character) && typeof character.name === "string" ? character.name : `第 ${index + 1} 个角色`;
    const fixes: string[] = [];
    if (object(character) && Array.isArray(character.versions)) {
      for (const version of character.versions) {
        if (!object(version) || !object(version.profile)) continue;
        const coc = version.profile.coc;
        if (object(coc) && object(coc.state) && coc.state.luck === undefined) {
          coc.state.luck = 50;
          fixes.push(`角色「${name}」/ 版本「${String(version.name)}」/ 表层 coc.state.luck 缺失：拟补为 50`);
        }
      }
    }
    try {
      const candidate = { schemaVersion: value.schemaVersion, characters: [character] };
      validateLibrary(candidate);
      if (ids.has(candidate.characters[0].id)) throw new Error("角色 ID 重复");
      ids.add(candidate.characters[0].id);
      valid.push(candidate.characters[0]); changes.push(...fixes);
    } catch (error) {
      excluded++;
      changes.push(`暂不加载角色「${name}」：${error instanceof Error ? error.message : String(error)}；原件中保留全部内容`);
    }
  }
  if (value.characters.length && !valid.length) throw new Error(`没有可安全加载的角色。${changes.join("；")}`);
  const result = { ...value, schemaVersion: value.schemaVersion as 1 | 2, characters: valid } as Library;
  if (value.catalog !== undefined) {
    const candidate = { ...result, catalog: value.catalog };
    validateLibrary(candidate); // Do not discard a malformed shared catalog silently.
    result.catalog = candidate.catalog;
  }
  return { library: migrateLibrary(result), changes, excluded };
}
