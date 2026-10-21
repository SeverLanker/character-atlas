
import { assetRefs, migrateLibrary, type Character, type Library } from "./model";
import { defaultImportChoice, type ImportChoice, type ImportChoices } from "./merge";
import { parseBackup } from "./storage";

export const CHARACTER_JSON_MAX_BYTES = 32 * 1024 * 1024;
export const CHARACTER_ZIP_MAX_BYTES = 48 * 1024 * 1024;
export const CHARACTER_IMPORT_MAX = 2000;

export interface CharacterImportError { index: number; id?: string; name?: string; reason: string }
export interface ParsedCharacters { library: Library; assets: Record<string, Uint8Array>; errors: CharacterImportError[]; total: number }

const label = (value: unknown, key: "id" | "name") => {
  const field = value && typeof value === "object" ? (value as Record<string, unknown>)[key] : undefined;
  return typeof field === "string" ? field.slice(0, 200) : undefined;
};

const fieldTypes: [string, "string" | "boolean", string][] = [
  ["id", "string", "字符串"], ["name", "string", "字符串"], ["collection", "string", "字符串"], ["favorite", "boolean", "true / false"],
  ["accent", "string", "字符串"], ["createdAt", "string", "日期字符串"], ["updatedAt", "string", "日期字符串"],
];
/** Names the first wrong top-level field; nested profile errors come from validateLibrary with their context path. */
function describeFieldError(raw: unknown): string | undefined {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return "角色必须是 JSON 对象";
  const value = raw as Record<string, unknown>;
  for (const [key, type, label] of fieldTypes) if (typeof value[key] !== type) return `字段 ${key} 应为${label}（当前为 ${value[key] === undefined ? "缺失" : JSON.stringify(value[key])?.slice(0, 40)}）`;
  if (!Array.isArray(value.versions) || !value.versions.length) return "字段 versions 至少需要一个版本";
  return undefined;
}
const readable = (error: unknown) => (error instanceof Error ? error.message : String(error)).replace(/^备份格式错误：/, "");

/**
 * Accepts the same character JSON as the UI append-import (a full library, an array of characters,
 * or a single character) and validates each character on its own, so one bad row does not hide the rest.
 * A JSON payload cannot carry images; only builtin portraits are allowed (use a backup ZIP for images).
 */
export function parseCharacterJson(text: string): ParsedCharacters {
  if (new TextEncoder().encode(text).length > CHARACTER_JSON_MAX_BYTES) throw new Error("角色 JSON 超过 32 MB，请使用 ZIP 或分批导入");
  let value: unknown;
  try { value = JSON.parse(text.replace(/^\uFEFF/, "")); } catch { throw new Error("JSON 语法错误，未导入任何内容。"); }
  const list: unknown[] = Array.isArray(value) ? value
    : value && typeof value === "object" && Array.isArray((value as Record<string, unknown>).characters) ? (value as { characters: unknown[] }).characters
    : value && typeof value === "object" && Array.isArray((value as Record<string, unknown>).versions) ? [value]
    : (() => { throw new Error("不是叙册角色数据：需要资料库、角色数组或单个角色对象"); })();
  if (list.length > CHARACTER_IMPORT_MAX) throw new Error(`单次最多导入 ${CHARACTER_IMPORT_MAX} 个角色，请分批导入`);
  const characters: Character[] = [], errors: CharacterImportError[] = [], seen = new Set<string>();
  list.forEach((raw, offset) => {
    const index = offset + 1, id = label(raw, "id"), name = label(raw, "name");
    try {
      if (id && seen.has(id)) throw new Error("角色编号在本次文件中重复");
      const field = describeFieldError(raw);
      if (field) throw new Error(field);
      const single = migrateLibrary({ schemaVersion: 2, characters: [raw] });
      if (assetRefs(single).length) throw new Error("含有外部图片引用；JSON 不能携带图片，请改用包含 assets 的完整 ZIP 备份");
      characters.push(single.characters[0]); seen.add(single.characters[0].id);
    } catch (error) {
      errors.push({ index, id, name, reason: readable(error) });
    }
  });
  return { library: { schemaVersion: 2, characters }, assets: {}, errors, total: list.length };
}

/** Backup ZIP: validated as a whole by the same restore pipeline (image refs, size and ratio limits). */
export function parseCharacterZip(bytes: Uint8Array): ParsedCharacters {
  if (bytes.length > CHARACTER_ZIP_MAX_BYTES) throw new Error("ZIP 超过 48 MB，请分批导入");
  const { library, assets } = parseBackup(bytes);
  if (library.characters.length > CHARACTER_IMPORT_MAX) throw new Error(`单次最多导入 ${CHARACTER_IMPORT_MAX} 个角色，请分批导入`);
  return { library: { schemaVersion: 2, characters: library.characters }, assets, errors: [], total: library.characters.length };
}

export type ConflictStrategy = ImportChoice;
/** Same defaults as the UI: new ids are added; an existing id uses the chosen strategy (default skip). */
export function characterChoices(current: Library, incoming: Library, onConflict: ConflictStrategy): ImportChoices {
  return Object.fromEntries(incoming.characters.map(character => [character.id, defaultImportChoice(current, character) === "skip" ? onConflict : "copy"]));
}
export function decodeBase64(value: string): Uint8Array {
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(value)) throw new Error("data_base64 不是有效的 Base64");
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

