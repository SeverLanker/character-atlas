/**
 * 应用级外观主题。
 *
 * 只影响叙册自身的界面（背景、侧栏、卡片、字体等）。角色内容层的「秘密身份三主题」
 * （监狱 / 黑档 / 临床）仍由角色数据决定，与应用主题叠加。
 *
 * 偏好只存本机 localStorage，不进入角色资料，也不进入备份。
 * public/theme-boot.js 在页面渲染前用同样的规则设置 data-theme，避免启动闪烁；改规则时两边一起改。
 */
export type AppThemeId = "default" | "night" | "xuan" | "bureau";

export interface AppThemeInfo {
  id: AppThemeId;
  name: string;
  description: string;
  dark: boolean;
  /** 设置里的小预览：背景 / 纸张 / 墨色 / 强调 */
  swatches: [string, string, string, string];
  /** 浏览器 / 系统标题栏颜色 */
  themeColor: string;
}

export const APP_THEMES: AppThemeInfo[] = [
  { id: "default", name: "林间档案", description: "默认：墨绿书脊与暖白纸页", dark: false, swatches: ["#efede6", "#fffdf7", "#293b35", "#284f43"], themeColor: "#f1efe9" },
  { id: "night", name: "夜读", description: "深色低对比，护眼，文字达 WCAG AA", dark: true, swatches: ["#181c1b", "#232927", "#dcd8cc", "#c9ad74"], themeColor: "#181c1b" },
  { id: "xuan", name: "採风宣纸", description: "米白宣纸、朱红印章、宋体标题", dark: false, swatches: ["#f3ede0", "#fbf7ee", "#2b2622", "#a33a2b"], themeColor: "#f3ede0" },
  { id: "bureau", name: "档案局", description: "牛皮纸文件夹与打字机字体，适合 CoC 调查员", dark: false, swatches: ["#d9c9a6", "#f4ecd8", "#2e2a24", "#7a2e1f"], themeColor: "#cdb98f" },
];

export const THEME_STORAGE_KEY = "atlas-app-theme";

export interface ThemePref {
  theme: AppThemeId;
  /** 系统为深色时自动使用「夜读」，浅色时使用 theme（若 theme 本身是夜读则回到默认）。 */
  followSystem: boolean;
}

export const DEFAULT_THEME_PREF: ThemePref = { theme: "default", followSystem: false };

const ids = new Set<string>(APP_THEMES.map((t) => t.id));

export function isThemeId(value: unknown): value is AppThemeId {
  return typeof value === "string" && ids.has(value);
}

/** 读取偏好；坏数据、缺字段或存储不可用时回到默认，不抛错。 */
export function readThemePref(storage: Pick<Storage, "getItem"> | undefined = globalThis.localStorage): ThemePref {
  try {
    const raw = JSON.parse(storage?.getItem(THEME_STORAGE_KEY) ?? "null");
    if (!raw || typeof raw !== "object") return { ...DEFAULT_THEME_PREF };
    return {
      theme: isThemeId(raw.theme) ? raw.theme : "default",
      followSystem: raw.followSystem === true,
    };
  } catch {
    return { ...DEFAULT_THEME_PREF };
  }
}

export function writeThemePref(pref: ThemePref, storage: Pick<Storage, "setItem"> | undefined = globalThis.localStorage) {
  try {
    storage?.setItem(THEME_STORAGE_KEY, JSON.stringify({ theme: pref.theme, followSystem: pref.followSystem }));
  } catch {
    /* 偏好保存失败不影响使用 */
  }
}

export function resolveTheme(pref: ThemePref, systemDark: boolean): AppThemeId {
  if (!pref.followSystem) return pref.theme;
  if (systemDark) return "night";
  return pref.theme === "night" ? "default" : pref.theme;
}

export function systemPrefersDark(): boolean {
  try {
    return globalThis.matchMedia?.("(prefers-color-scheme: dark)").matches ?? false;
  } catch {
    return false;
  }
}

/** 把主题写到 <html data-theme>；默认主题不设属性，保证样式与改造前完全一致。 */
export function applyTheme(id: AppThemeId, doc: Document = document) {
  const root = doc.documentElement;
  if (id === "default") delete root.dataset.theme;
  else root.dataset.theme = id;
  const info = APP_THEMES.find((t) => t.id === id) ?? APP_THEMES[0];
  root.style.colorScheme = info.dark ? "dark" : "";
  doc.querySelector('meta[name="theme-color"]')?.setAttribute("content", info.themeColor);
}
