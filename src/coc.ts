export const characteristicLabels = {
  STR: "力量",
  CON: "体质",
  SIZ: "体型",
  DEX: "敏捷",
  APP: "外貌",
  INT: "智力",
  POW: "意志",
  EDU: "教育",
} as const;
export type Characteristic = keyof typeof characteristicLabels;
export interface CocSkill {
  selected?: boolean;
  common?: boolean;
  id: string;
  key: string;
  name: string;
  specialization: string;
  base: number | null;
  value: number | null;
  featured: boolean;
  notes: string;
}
export function isSelectedSkill(skill: CocSkill): boolean {
  const defaultSpecialization = ({ brawl: "斗殴", handgun: "手枪", rifle: "步枪 / 霰弹枪" } as Record<string, string>)[skill.key] ?? "";
  return skill.selected ?? (skill.value !== null || skill.base !== null || skill.featured || !!skill.notes || skill.specialization !== defaultSpecialization || !skillCatalog.some((item) => item.key === skill.key));
}
export interface CocSheet {
  characteristics: Record<Characteristic, number>;
  skills: CocSkill[];
  state: { hp: number; mp: number; san: number; luck: number };
  overrides: {
    hp: number | null;
    mp: number | null;
    san: number | null;
    mov: number | null;
    db: string | null;
    build: number | null;
  };
}
export type CocPatch = {
  characteristics?: Partial<CocSheet["characteristics"]>;
  skills?: CocSkill[];
  state?: Partial<CocSheet["state"]>;
  overrides?: Partial<CocSheet["overrides"]>;
};
export const skillCatalog: {
  key: string;
  name: string;
  base: number;
  specialization?: boolean;
  modern?: boolean;
}[] = [
  ["accounting", "会计", 5],
  ["anthropology", "人类学", 1],
  ["appraise", "估价", 5],
  ["archaeology", "考古学", 1],
  ["art", "艺术与手艺", 5, true],
  ["charm", "魅惑", 15],
  ["climb", "攀爬", 20],
  ["computer", "计算机使用", 5, false, true],
  ["credit", "信用评级", 0],
  ["mythos", "克苏鲁神话", 0],
  ["disguise", "乔装", 5],
  ["dodge", "闪避", 0],
  ["drive", "汽车驾驶", 20],
  ["electrical", "电气维修", 10],
  ["electronics", "电子学", 1, false, true],
  ["fastTalk", "话术", 5],
  ["brawl", "格斗", 25, true],
  ["handgun", "射击", 20, true],
  ["rifle", "射击", 25, true],
  ["firstAid", "急救", 30],
  ["history", "历史", 5],
  ["intimidate", "恐吓", 15],
  ["jump", "跳跃", 20],
  ["otherLanguage", "语言", 1, true],
  ["ownLanguage", "母语", 0, true],
  ["law", "法律", 5],
  ["library", "图书馆使用", 20],
  ["listen", "聆听", 20],
  ["locksmith", "锁匠", 1],
  ["mechanical", "机械维修", 10],
  ["medicine", "医学", 1],
  ["natural", "博物学", 10],
  ["navigate", "导航", 10],
  ["occult", "神秘学", 5],
  ["persuade", "说服", 10],
  ["pilot", "驾驶", 1, true],
  ["psychoanalysis", "精神分析", 1],
  ["psychology", "心理学", 10],
  ["ride", "骑术", 5],
  ["science", "科学", 1, true],
  ["sleight", "妙手", 10],
  ["spot", "侦查", 25],
  ["stealth", "潜行", 20],
  ["survival", "生存", 10, true],
  ["swim", "游泳", 20],
  ["throw", "投掷", 20],
  ["track", "追踪", 10],
].map(([key, name, base, specialization, modern]) => ({
  key: String(key),
  name: String(name),
  base: Number(base),
  specialization: Boolean(specialization),
  modern: Boolean(modern),
}));
export function blankCoc(): CocSheet {
  return {
    characteristics: {
      STR: 50,
      CON: 50,
      SIZ: 50,
      DEX: 50,
      APP: 50,
      INT: 50,
      POW: 50,
      EDU: 50,
    },
    skills: skillCatalog.map((s) => ({
      id: crypto.randomUUID(),
      key: s.key,
      name: s.name,
      specialization:
        (
          { brawl: "斗殴", handgun: "手枪", rifle: "步枪 / 霰弹枪" } as Record<
            string,
            string
          >
        )[s.key] ?? "",
      base: null,
      value: null,
      featured: false,
      notes: "",
    })),
    state: { hp: 10, mp: 10, san: 50, luck: 50 },
    overrides: {
      hp: null,
      mp: null,
      san: null,
      mov: null,
      db: null,
      build: null,
    },
  };
}
export function mergeCoc(base: CocSheet, patch?: CocPatch): CocSheet {
  return {
    ...base,
    ...patch,
    characteristics: { ...base.characteristics, ...patch?.characteristics },
    state: { ...base.state, ...patch?.state },
    overrides: { ...base.overrides, ...patch?.overrides },
  };
}
export const thresholds = (value: number) => ({
  hard: Math.floor(value / 2),
  extreme: Math.floor(value / 5),
});
export function skillBase(skill: CocSkill, sheet: CocSheet): number {
  if (skill.base !== null) return skill.base;
  if (skill.key === "dodge") return Math.floor(sheet.characteristics.DEX / 2);
  if (skill.key === "ownLanguage") return sheet.characteristics.EDU;
  return skillCatalog.find((s) => s.key === skill.key)?.base ?? 0;
}
export const skillValue = (skill: CocSkill, sheet: CocSheet) =>
  skill.value ?? skillBase(skill, sheet);
export function derivedValues(sheet: CocSheet, age = "") {
  const { STR, DEX, SIZ, CON, POW } = sheet.characteristics;
  const sum = STR + SIZ;
  const build =
    sum <= 64
      ? -2
      : sum <= 84
        ? -1
        : sum <= 124
          ? 0
          : sum <= 164
            ? 1
            : sum <= 204
              ? 2
              : 3 + Math.floor((sum - 205) / 80);
  const db =
    build < 0
      ? String(build)
      : build === 0
        ? "0"
        : build === 1
          ? "+1D4"
          : `+${build - 1}D6`;
  const years = /^\d+(?:\.\d+)?$/.test(age.trim()) ? Number(age) : 0;
  const penalty =
    years >= 80
      ? 5
      : years >= 70
        ? 4
        : years >= 60
          ? 3
          : years >= 50
            ? 2
            : years >= 40
              ? 1
              : 0;
  const mov = Math.max(
    0,
    (STR < SIZ && DEX < SIZ ? 7 : STR > SIZ && DEX > SIZ ? 9 : 8) - penalty,
  );
  const mythos = sheet.skills.find((s) => s.key === "mythos");
  return {
    hp: sheet.overrides.hp ?? Math.floor((CON + SIZ) / 10),
    mp: sheet.overrides.mp ?? Math.floor(POW / 5),
    san:
      sheet.overrides.san ??
      Math.max(0, 99 - (mythos ? skillValue(mythos, sheet) : 0)),
    mov: sheet.overrides.mov ?? mov,
    db: sheet.overrides.db ?? db,
    build: sheet.overrides.build ?? build,
  };
}
export function validateCoc(value: unknown, partial = false): void {
  const fail = (path = "coc") => {
    throw new Error("备份格式错误：CoC7 数值无效 / " + path);
  };
  if (!value || typeof value !== "object" || Array.isArray(value))
    return fail();
  const c = value as Record<string, unknown>;
  const num = (n: unknown, negative = false) =>
    typeof n === "number" &&
    Number.isInteger(n) &&
    n >= (negative ? -9999 : 0) &&
    n <= 9999;
  for (const [group, keys] of Object.entries({
    characteristics: Object.keys(characteristicLabels),
    state: ["hp", "mp", "san", "luck"],
    overrides: ["hp", "mp", "san", "mov", "db", "build"],
  })) {
    if (partial && c[group] === undefined) continue;
    if (!c[group] || typeof c[group] !== "object" || Array.isArray(c[group]))
      return fail(`coc.${group} 缺失或不是对象`);
    const values = c[group] as Record<string, unknown>;
    for (const key of keys) {
      const n = values[key];
      if (partial && n === undefined) continue;
      if (group === "overrides" && n === null) continue;
      if (group === "overrides" && key === "db") {
        if (typeof n !== "string" || n.length > 80) fail(`coc.${group}.${key} 应为字符串或 null`);
      } else if (!num(n, key === "build")) fail(`coc.${group}.${key} ${n === undefined ? "缺失" : "应为合法整数"}`);
    }
  }
  if (!partial || c.skills !== undefined) {
    if (!Array.isArray(c.skills) || c.skills.length > 2000) return fail();
    const ids = new Set();
    for (const s of c.skills) {
      if (
        !s ||
        typeof s !== "object" ||
        ["id", "key", "name", "specialization", "notes"].some(
          (k) => typeof s[k] !== "string",
        ) ||
        ids.has(s.id) ||
        typeof s.featured !== "boolean" ||
        (s.selected !== undefined && typeof s.selected !== "boolean") ||
        (s.common !== undefined && typeof s.common !== "boolean") ||
        (s.base !== null && !num(s.base)) ||
        (s.value !== null && !num(s.value))
      )
        return fail();
      ids.add(s.id);
    }
  }
}
