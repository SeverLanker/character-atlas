/**
 * body-validator（SeverLanker/body-validator）角色体型数据。
 * 叙册只保存与显示参数和导出的正 / 背面图，不调用 Godot。
 */
export const BODY_SCHEMA = "bodyval.character/1";
export const bodyTypes = ["adult_female", "adult_male", "teen_female", "teen_male", "child"] as const;
export type BodyType = (typeof bodyTypes)[number];
export const bodyTypeLabels: Record<BodyType, string> = {
  adult_female: "成年女性", adult_male: "成年男性", teen_female: "少女", teen_male: "少年", child: "儿童",
};

export interface BodyProfile {
  /** 固定为 bodyval.character/1；导入 /2、/3 时只保留下列通用字段。 */
  schema: typeof BODY_SCHEMA;
  name: string;
  body_type: BodyType;
  height_cm: number;
  leg_length: number;
  head_scale: number;
  morphs: Record<string, number>;
  notes: string;
  /** 正面图 asset 引用（空字符串表示无图）。 */
  front: string;
  /** 背面图 asset 引用（空字符串表示无图）。 */
  back: string;
}

const isObject = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const finite = (v: unknown, min: number, max: number) => typeof v === "number" && Number.isFinite(v) && v >= min && v <= max;
const refPattern = /^[a-zA-Z0-9_-]+\.(png|jpg|jpeg|webp|gif)$/;
function fail(message: string): never { throw new Error("体型数据无效：" + message); }

/** 校验叙册内保存的 body 字段（严格）。 */
export function validateBody(v: unknown): asserts v is BodyProfile {
  if (!isObject(v)) fail("不是对象");
  if (v.schema !== BODY_SCHEMA) fail("schema 必须为 " + BODY_SCHEMA);
  if (typeof v.name !== "string" || v.name.length > 200) fail("name");
  if (!bodyTypes.includes(v.body_type as BodyType)) fail("body_type");
  if (!finite(v.height_cm, 30, 300)) fail("height_cm 需在 30–300");
  if (!finite(v.leg_length, -1, 1)) fail("leg_length 需在 -1–1");
  if (!finite(v.head_scale, 0.5, 2)) fail("head_scale 需在 0.5–2");
  if (!isObject(v.morphs) || Object.keys(v.morphs).length > 200 ||
    !Object.entries(v.morphs).every(([k, n]) => k.length <= 64 && finite(n, -10, 10))) fail("morphs");
  if (typeof v.notes !== "string" || v.notes.length > 10000) fail("notes");
  for (const key of ["front", "back"] as const) {
    const ref = v[key];
    if (typeof ref !== "string" || (ref !== "" && !refPattern.test(ref))) fail(key + " 图片引用");
  }
}

/**
 * 解析 body-validator 导出的角色 JSON（bodyval.character/1–/3）。
 * 只取通用字段，其余（发型、服装、眉毛等）忽略。返回 front/back 为空的 BodyProfile。
 */
export function parseBodyValidatorJson(text: string): BodyProfile {
  let raw: unknown;
  try { raw = JSON.parse(text.replace(/^\uFEFF/, "")); } catch { fail("不是合法 JSON"); }
  if (!isObject(raw)) fail("不是对象");
  if (typeof raw.schema !== "string" || !/^bodyval\.character\/[1-3]$/.test(raw.schema)) fail("不是 bodyval.character/1–3 文件");
  const morphs: Record<string, number> = {};
  if (raw.morphs !== undefined) {
    if (!isObject(raw.morphs)) fail("morphs");
    for (const [k, n] of Object.entries(raw.morphs)) if (typeof n === "number") morphs[k] = n;
  }
  const body = {
    schema: BODY_SCHEMA,
    name: typeof raw.name === "string" ? raw.name : "",
    body_type: raw.body_type,
    height_cm: raw.height_cm,
    leg_length: raw.leg_length ?? 0,
    head_scale: raw.head_scale ?? 1,
    morphs,
    notes: typeof raw.notes === "string" ? raw.notes : "",
    front: "",
    back: "",
  };
  validateBody(body);
  return body;
}

// ---------- 部位热区 ----------

export interface BodyRegion {
  /** 写入 / 匹配 condition.area 的规范部位名。 */
  area: string;
  /** 归一化矩形（0–1，相对于整张图；x 为观看者视角，左侧 = 角色右侧）。 */
  x: number; y: number; w: number; h: number;
}

/**
 * 规范部位 → 也视为属于该部位的 condition.area 写法。
 * 旧资料只用「头部 / 躯干 / 左臂 / 右臂 / 左腿 / 右腿」，细分部位会继承粗部位的记录。
 */
export const regionAliases: Record<string, string[]> = {
  头部: ["头部", "头", "面部", "脸"],
  颈部: ["颈部", "颈", "脖子"],
  胸部: ["胸部", "胸", "躯干"],
  腹部: ["腹部", "腹", "腰", "躯干"],
  左臂: ["左臂", "左肩", "左上臂", "左前臂"],
  右臂: ["右臂", "右肩", "右上臂", "右前臂"],
  左手: ["左手", "左腕", "左臂"],
  右手: ["右手", "右腕", "右臂"],
  左腿: ["左腿", "左大腿", "左小腿", "左膝"],
  右腿: ["右腿", "右大腿", "右小腿", "右膝"],
  左脚: ["左脚", "左足", "左踝", "左腿"],
  右脚: ["右脚", "右足", "右踝", "右腿"],
  背部: ["背部", "背", "后背", "躯干"],
};
/** 粗部位 → 细部位，用于点筛选按钮「躯干」时也显示「胸部 / 腹部」记录。 */
const coarseChildren: Record<string, string[]> = {
  躯干: ["胸部", "腹部", "背部", "颈部"],
  左臂: ["左手"], 右臂: ["右手"], 左腿: ["左脚"], 右腿: ["右脚"],
};

/** condition.area 是否属于所选部位（「全身」总是匹配）。 */
export function areaMatches(conditionArea: string, selected: string): boolean {
  const area = conditionArea.trim();
  if (selected === "全部" || area === "全身" || area === selected) return true;
  if (regionAliases[selected]?.includes(area)) return true;
  return (coarseChildren[selected] ?? []).some((child) => regionAliases[child].includes(area));
}
/** 热区是否应显示该条记录的标记（不含「全身」，避免整身高亮）。 */
export function regionHasCondition(region: string, conditionArea: string): boolean {
  const area = conditionArea.trim();
  return area === region || (regionAliases[region] ?? []).includes(area);
}

const headUnits: Record<BodyType, number> = {
  adult_female: 7.3, adult_male: 7.5, teen_female: 6.8, teen_male: 7, child: 5.6,
};
const clamp = (n: number, a: number, b: number) => Math.min(b, Math.max(a, n));

/**
 * 按体型、头身比与腿长生成正面（view="front"）或背面热区。
 * 模型：人物从 y=0.03 站到 y=0.97，头高 = 总高 / 头身数 × head_scale；腿长 ±1 让髋线上下移动约 4%。
 */
export function bodyRegions(body?: Pick<BodyProfile, "body_type" | "head_scale" | "leg_length">, view: "front" | "back" = "front"): BodyRegion[] {
  const type = body?.body_type ?? "adult_female";
  const top = 0.03, bottom = 0.97, total = bottom - top;
  const head = clamp((total / headUnits[type]) * (body?.head_scale ?? 1), 0.08, 0.24);
  const neckEnd = top + head + total * 0.03;
  const hip = clamp(top + total * 0.5 - (body?.leg_length ?? 0) * total * 0.04, neckEnd + 0.15, 0.7);
  const chestEnd = neckEnd + (hip - neckEnd) * 0.5;
  const footStart = bottom - total * 0.05;
  const male = type === "adult_male" || type === "teen_male";
  const shoulder = male ? 0.2 : 0.17; // 半肩宽
  const handTop = hip - 0.02, handEnd = hip + total * 0.1;
  const flip = (r: BodyRegion): BodyRegion => (view === "back" ? { ...r, x: 1 - r.x - r.w } : r);
  // 正面：观看者左侧是角色右侧。
  const regions: BodyRegion[] = [
    { area: "头部", x: 0.5 - head * 0.55, y: top, w: head * 1.1, h: head }, // 1000×1500 画布上约 0.73 的宽高比
    { area: "颈部", x: 0.45, y: top + head, w: 0.1, h: neckEnd - top - head },
    { area: view === "back" ? "背部" : "胸部", x: 0.5 - shoulder + 0.04, y: neckEnd, w: (shoulder - 0.04) * 2, h: chestEnd - neckEnd },
    ...(view === "back" ? [] : [{ area: "腹部", x: 0.5 - shoulder + 0.06, y: chestEnd, w: (shoulder - 0.06) * 2, h: hip - chestEnd }]),
    ...(view === "back" ? [{ area: "背部", x: 0.5 - shoulder + 0.06, y: chestEnd, w: (shoulder - 0.06) * 2, h: hip - chestEnd }] : []),
    { area: "右臂", x: 0.5 - shoulder - 0.06, y: neckEnd, w: 0.1, h: handTop - neckEnd },
    { area: "左臂", x: 0.5 + shoulder - 0.04, y: neckEnd, w: 0.1, h: handTop - neckEnd },
    { area: "右手", x: 0.5 - shoulder - 0.07, y: handTop, w: 0.11, h: handEnd - handTop },
    { area: "左手", x: 0.5 + shoulder - 0.04, y: handTop, w: 0.11, h: handEnd - handTop },
    { area: "右腿", x: 0.5 - 0.12, y: hip, w: 0.115, h: footStart - hip },
    { area: "左腿", x: 0.505, y: hip, w: 0.115, h: footStart - hip },
    { area: "右脚", x: 0.5 - 0.14, y: footStart, w: 0.135, h: bottom - footStart },
    { area: "左脚", x: 0.505, y: footStart, w: 0.135, h: bottom - footStart },
  ];
  return regions.map(flip);
}
/** 细部位名单（用于编辑器建议与筛选按钮）。 */
export const bodyRegionAreas = Object.keys(regionAliases);
