import {
  blankCoc,
  mergeCoc,
  validateCoc,
  type CocSheet,
  type CocPatch,
} from "./coc.ts";
import { validateBody, type BodyProfile } from "./body.ts";
export type Page = "archive" | "skills" | "collection" | "status";
export type Theme = "prison" | "noir" | "clinical";
export interface Basics {
  name: string;
  alias: string;
  age: string;
  gender: string;
  species: string;
  occupation: string;
  affiliation: string;
  height: string;
  weight: string;
  blood: string;
  birthday: string;
  birthplace: string;
  residence?: string;
  measurements?: string;
  code: string;
}
export interface Entry {
  id: string;
  title: string;
  text: string;
}
export interface Relationship extends Entry {
  targetCharacterId?: string;
}
export interface Attribute {
  id: string;
  name: string;
  value: number;
}
export interface Skill extends Entry {
  rank: string;
  kind?: "skill" | "spell" | "specialty";
  common?: boolean;
  featured?: boolean;
}
export function isProminentAbility(skill: Skill): boolean {
  if (skill.featured) return true;
  if (skill.common) return false;
  const rank = skill.rank.trim();
  if (/^(入门|初学|初级|基础|普通|低级|新手)(?:级|阶段)?$/.test(rank)) return false;
  const level = rank.match(/^(?:lv\.?\s*|等级\s*)?(\d+)(?:级)?$/i);
  return !level || Number(level[1]) > 2;
}
export type CatalogKind = "skill" | "spell" | "specialty" | "item";
export interface CatalogEntry extends Entry {
  createdAt?: string;
  updatedAt?: string;
  tags?: string[];
  favorite?: boolean;
  kind: CatalogKind;
  rank: string;
  common: boolean;
}
export interface Item extends Entry {
  image: string;
}
export interface Photo {
  id: string;
  image: string;
  caption: string;
}
export interface Condition extends Entry {
  area: string;
  severity: "stable" | "notice" | "danger";
}
export interface Profile {
  basics: Basics;
  portrait: string;
  quote: string;
  summary: string;
  personality: string;
  appearance: string;
  background: string;
  events: Entry[];
  relationships: Relationship[];
  customFields: Entry[];
  attributes: Attribute[];
  skills: Skill[];
  items: Item[];
  gallery: Photo[];
  conditions: Condition[];
  statusNote: string;
  coc?: CocSheet;
  display?: { hideEmpty: boolean; hiddenBasics: (keyof Basics)[] };
  /** 可选 body-validator 体型数据与正 / 背面图（secret 中整体覆盖）。 */
  body?: BodyProfile;
}
export type Overrides = Omit<Partial<Profile>, "basics" | "coc"> & {
  basics?: Partial<Basics>;
  coc?: CocPatch;
};
export interface Secret {
  enabled: boolean;
  label: string;
  trigger: "portrait" | "name" | "emblem";
  theme: Theme;
  overrides: Overrides;
}
export interface Version {
  id: string;
  name: string;
  date: string;
  note: string;
  profile: Profile;
  secret: Secret;
  createdAt: string;
  updatedAt: string;
}
export interface Character {
  id: string;
  name: string;
  collection: string;
  favorite: boolean;
  accent: string;
  versions: Version[];
  defaultVersionId?: string;
  createdAt: string;
  updatedAt: string;
}
export interface Library {
  catalog?: CatalogEntry[];
  schemaVersion: 1 | 2;
  characters: Character[];
}
export const uid = () => crypto.randomUUID();
export const now = () => new Date().toISOString();
export const basicLabels: Record<keyof Basics, string> = {
  name: "姓名",
  alias: "别名",
  age: "年龄",
  gender: "性别",
  species: "族裔",
  occupation: "身份 / 职业",
  affiliation: "所属",
  height: "身高",
  weight: "体重",
  blood: "血型",
  birthday: "生日",
  birthplace: "出生地",
  residence: "居住地",
  measurements: "三围",
  code: "身份编号",
};
export const pageMeta: { id: Page; name: string; en: string }[] = [
  { id: "archive", name: "详细档案", en: "DOSSIER" },
  { id: "skills", name: "属性与技能", en: "ABILITIES" },
  { id: "collection", name: "收藏与影像", en: "COLLECTION" },
  { id: "status", name: "身体状态", en: "CONDITION" },
];
export function effectiveProfile(version: Version, hidden: boolean): Profile {
  if (!hidden || !version.secret.enabled) return version.profile;
  const { basics, coc, ...rest } = version.secret.overrides;
  return {
    ...version.profile,
    ...rest,
    basics: { ...version.profile.basics, ...basics },
    coc: mergeCoc(version.profile.coc ?? blankCoc(), coc),
  };
}
export function blankProfile(name = "未命名角色"): Profile {
  return {
    basics: {
      name,
      alias: "",
      age: "",
      gender: "",
      species: "",
      occupation: "",
      affiliation: "",
      height: "",
      weight: "",
      blood: "",
      birthday: "",
      birthplace: "",
      residence: "",
      measurements: "",
      code: "OC-" + Math.floor(100 + Math.random() * 900),
    },
    portrait: "",
    quote: "",
    summary: "",
    personality: "",
    appearance: "",
    background: "",
    events: [],
    relationships: [],
    customFields: [],
    attributes: [],
    coc: blankCoc(),
    display: { hideEmpty: true, hiddenBasics: [] },
    skills: [],
    items: [],
    gallery: [],
    conditions: [],
    statusNote: "",
  };
}
export function createCharacter(
  name: string,
  collection = "未分类",
): Character {
  const time = now();
  const initialId = uid();
  return {
    id: uid(),
    name,
    defaultVersionId: initialId,
    collection,
    favorite: false,
    accent: "#53695c",
    createdAt: time,
    updatedAt: time,
    versions: [
      {
        id: initialId,
        name: "初始设定",
        date: "",
        note: "",
        profile: blankProfile(name),
        secret: {
          enabled: false,
          label: "隐藏档案",
          trigger: "portrait",
          theme: "prison",
          overrides: {},
        },
        createdAt: time,
        updatedAt: time,
      },
    ],
  };
}
export function duplicateVersion(version: Version, name: string): Version {
  const clone = structuredClone(version);
  const time = now();
  return { ...clone, id: uid(), name, createdAt: time, updatedAt: time };
}
export function assetRefs(library: Library): string[] {
  const refs = new Set<string>();
  for (const c of library.characters)
    for (const v of c.versions)
      for (const p of [v.profile, v.secret.overrides]) {
        for (const ref of [
          p.portrait,
          ...(p.items ?? []).map((i) => i.image),
          ...(p.gallery ?? []).map((i) => i.image),
          p.body?.front,
          p.body?.back,
        ])
          if (ref && !ref.startsWith("builtin:")) refs.add(ref);
      }
  return [...refs];
}
const isObject = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === "object" && !Array.isArray(v);
function check(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error("备份格式错误：" + message);
}
function validatePartialProfile(v: unknown, partial = false): void {
  check(isObject(v), "档案内容无效");
  const strings = [
    "portrait",
    "quote",
    "summary",
    "personality",
    "appearance",
    "background",
    "statusNote",
  ];
  if (!partial || v.basics !== undefined) {
    check(isObject(v.basics), "身份信息缺失");
    for (const key of Object.keys(basicLabels))
      if ((!partial || v.basics[key] !== undefined) && !(["residence", "measurements"].includes(key) && v.basics[key] === undefined))
        check(typeof v.basics[key] === "string", "身份字段无效");
  }
  for (const k of strings)
    if (!partial || v[k] !== undefined)
      check(typeof v[k] === "string", "文字字段无效");
  for (const k of [
    "events",
    "relationships",
    "customFields",
    "attributes",
    "skills",
    "items",
    "gallery",
    "conditions",
  ]) {
    if (partial && v[k] === undefined) continue;
    check(Array.isArray(v[k]), "列表字段无效");
    for (const entry of v[k]) {
      check(isObject(entry) && typeof entry.id === "string", "列表条目无效");
      if (k === "attributes") {
        check(
          typeof entry.name === "string" &&
            typeof entry.value === "number" &&
            Number.isFinite(entry.value) &&
            entry.value >= 0 &&
            entry.value <= 9999,
          "属性数值无效",
        );
      } else if (k === "gallery") {
        check(
          typeof entry.image === "string" && typeof entry.caption === "string",
          "图片条目无效",
        );
      } else {
        check(
          typeof entry.title === "string" && typeof entry.text === "string",
          "资料条目无效",
        );
        if (k === "skills")
          check(typeof entry.rank === "string", "技能等级无效");
        if (k === "relationships")
          check(entry.targetCharacterId === undefined || typeof entry.targetCharacterId === "string", "关联角色编号无效");
        if (k === "skills") {
          check(entry.kind === undefined || ["skill", "spell", "specialty"].includes(String(entry.kind)), "能力类别无效");
          check(entry.common === undefined || typeof entry.common === "boolean", "通用标记无效");
          check(entry.featured === undefined || typeof entry.featured === "boolean", "重点标记无效");
        }
        if (k === "items")
          check(typeof entry.image === "string", "物品图片无效");
        if (k === "conditions")
          check(
            typeof entry.area === "string" &&
              ["stable", "notice", "danger"].includes(String(entry.severity)),
            "状态无效",
          );
      }
    }
  }
  if (v.coc !== undefined) validateCoc(v.coc, partial);
  if (v.body !== undefined) {
    try { validateBody(v.body); }
    catch (error) { check(false, error instanceof Error ? error.message : String(error)); }
  }
  if (v.display !== undefined) {
    check(
      isObject(v.display) &&
        typeof v.display.hideEmpty === "boolean" &&
        Array.isArray(v.display.hiddenBasics) &&
        v.display.hiddenBasics.every(
          (k) => typeof k === "string" && k in basicLabels,
        ),
      "显示设置无效",
    );
  }
  const refs = [
    v.portrait,
    ...(Array.isArray(v.items)
      ? v.items.map((i: Record<string, unknown>) => i.image)
      : []),
    ...(Array.isArray(v.gallery)
      ? v.gallery.map((i: Record<string, unknown>) => i.image)
      : []),
  ];
  for (const ref of refs)
    if (ref !== undefined)
      check(
        typeof ref === "string" &&
          (!ref ||
            /^builtin:[0-2]$/.test(ref) ||
            /^[a-zA-Z0-9_-]+\.(png|jpg|jpeg|webp|gif)$/.test(ref)),
        "图片引用无效",
      );
}
export function validateLibrary(value: unknown): asserts value is Library {
  check(
    isObject(value) &&
      (value.schemaVersion === 1 || value.schemaVersion === 2) &&
      Array.isArray(value.characters),
    "不是叙册资料库",
  );
  check(value.characters.length <= 10000, "角色数量过多");
  if (value.catalog !== undefined) {
    check(Array.isArray(value.catalog) && value.catalog.length <= 10000, "资料库条目无效");
    const catalogIds = new Set<string>();
    for (const item of value.catalog) {
      check(isObject(item) && typeof item.id === "string" && !catalogIds.has(item.id) &&
        ["skill", "spell", "specialty", "item"].includes(String(item.kind)) &&
        ["title", "text", "rank"].every((key) => typeof item[key] === "string") && typeof item.common === "boolean", "资料库条目无效");
      catalogIds.add(item.id);
      for (const key of ["createdAt", "updatedAt"]) check(item[key] === undefined || (typeof item[key] === "string" && Number.isFinite(Date.parse(item[key]))), "条目时间戳无效");
      check(item.tags === undefined || (Array.isArray(item.tags) && item.tags.length <= 50 && item.tags.every((tag: unknown) => typeof tag === "string" && tag.length <= 100)), "条目标签无效");
      check(item.favorite === undefined || typeof item.favorite === "boolean", "条目收藏标记无效");
    }
  }
  const ids = new Set<string>();
  for (const c of value.characters) {
    check(
      isObject(c) && typeof c.id === "string" && !ids.has(c.id),
      "角色编号无效或重复",
    );
    ids.add(c.id);
    check(
      typeof c.name === "string" &&
        typeof c.collection === "string" &&
        typeof c.favorite === "boolean" &&
        typeof c.accent === "string" &&
        typeof c.createdAt === "string" &&
        typeof c.updatedAt === "string",
      "角色信息无效",
    );
    check(
      Array.isArray(c.versions) && c.versions.length > 0,
      "角色必须有一个版本",
    );
    check(
      c.defaultVersionId === undefined ||
        (typeof c.defaultVersionId === "string" &&
          c.versions.some((v) => v.id === c.defaultVersionId)),
      "默认版本无效",
    );
    const vids = new Set<string>();
    for (const v of c.versions) {
      check(
        isObject(v) && typeof v.id === "string" && !vids.has(v.id),
        "版本编号无效或重复",
      );
      vids.add(v.id);
      for (const k of ["name", "date", "note", "createdAt", "updatedAt"])
        check(typeof v[k] === "string", "版本信息无效");
      const context = `角色「${c.name}」/ 版本「${v.name}」/ `;
      try { validatePartialProfile(v.profile); }
      catch (error) { throw new Error(context + "表层 / " + (error instanceof Error ? error.message : String(error))); }
      check(
        isObject(v.secret) &&
          typeof v.secret.enabled === "boolean" &&
          typeof v.secret.label === "string" &&
          ["portrait", "name", "emblem"].includes(String(v.secret.trigger)) &&
          ["prison", "noir", "clinical"].includes(String(v.secret.theme)),
        "秘密身份配置无效",
      );
      try { validatePartialProfile(v.secret.overrides, true); }
      catch (error) { throw new Error(context + "秘密档案 / " + (error instanceof Error ? error.message : String(error))); }
    }
  }
}

export function defaultVersion(character: Character): Version {
  return (
    character.versions.find((v) => v.id === character.defaultVersionId) ??
    character.versions[0]
  );
}
export function migrateLibrary(value: unknown): Library {
  validateLibrary(value);
  const result = structuredClone(value);
  result.schemaVersion = 2;
  const names: Record<string, keyof CocSheet["characteristics"]> = {
    力量: "STR",
    体质: "CON",
    体型: "SIZ",
    敏捷: "DEX",
    外貌: "APP",
    智力: "INT",
    意志: "POW",
    教育: "EDU",
  };
  for (const character of result.characters) {
    character.defaultVersionId ??= character.versions[0].id;
    for (const version of character.versions) {
      version.profile.basics.residence ??= "";
      version.profile.basics.measurements ??= "";
      if (!version.profile.coc) {
        const coc = blankCoc();
        for (const a of version.profile.attributes) {
          const key =
            names[a.name] ??
            (a.name in coc.characteristics
              ? (a.name as keyof typeof coc.characteristics)
              : undefined);
          if (key) coc.characteristics[key] = Math.trunc(a.value);
        }
        coc.state = {
          hp: Math.floor(
            (coc.characteristics.CON + coc.characteristics.SIZ) / 10,
          ),
          mp: Math.floor(coc.characteristics.POW / 5),
          san: coc.characteristics.POW,
          luck: 50,
        };
        version.profile.coc = coc;
        const overrides = version.secret.overrides;
        if (!overrides.coc && overrides.attributes) {
          const characteristics: CocPatch["characteristics"] = {};
          for (const a of overrides.attributes)
            if (names[a.name])
              characteristics[names[a.name]] = Math.trunc(a.value);
          if (Object.keys(characteristics).length)
            overrides.coc = { characteristics };
        }
      }
      version.profile.display ??= { hideEmpty: true, hiddenBasics: [] };
    }
  }
  return result;
}
export function visibleBasic(profile: Profile, key: keyof Basics) {
  return (
    !profile.display?.hiddenBasics.includes(key) &&
    (profile.display?.hideEmpty === false ||
      Boolean(profile.basics[key]?.trim()))
  );
}
