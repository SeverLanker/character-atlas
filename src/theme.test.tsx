// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import {
  APP_THEMES, DEFAULT_THEME_PREF, THEME_STORAGE_KEY, applyTheme, readThemePref, resolveTheme, writeThemePref, type ThemePref,
} from "./theme";
import { useAppTheme } from "./hooks/useAppTheme";
import { ThemePicker } from "./components/ThemePicker";

const root = document.documentElement;
function mockSystemDark(dark: boolean) {
  const listeners: Array<() => void> = [];
  const query = { matches: dark, addEventListener: (_: string, fn: () => void) => listeners.push(fn), removeEventListener: () => {} };
  vi.stubGlobal("matchMedia", () => query);
  return { set(next: boolean) { query.matches = next; listeners.forEach((fn) => fn()); } };
}

beforeEach(() => {
  localStorage.clear();
  delete root.dataset.theme;
  root.style.colorScheme = "";
  document.head.innerHTML = '<meta name="theme-color" content="#f1efe9">';
  mockSystemDark(false);
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("主题偏好读写", () => {
  it("没有偏好时为默认主题", () => {
    expect(readThemePref()).toEqual(DEFAULT_THEME_PREF);
  });
  it("坏数据回到默认，不抛错", () => {
    for (const raw of ["{bad json", "null", "42", '"night"', "[]", '{"theme":"neon","followSystem":"yes"}', '{"theme":{"x":1}}']) {
      localStorage.setItem(THEME_STORAGE_KEY, raw);
      expect(readThemePref()).toEqual(DEFAULT_THEME_PREF);
    }
    localStorage.setItem(THEME_STORAGE_KEY, '{"theme":"xuan","followSystem":1}');
    expect(readThemePref()).toEqual({ theme: "xuan", followSystem: false });
  });
  it("存储不可用时读写都不抛错", () => {
    const broken = { getItem: () => { throw new Error("denied"); }, setItem: () => { throw new Error("quota"); } };
    expect(readThemePref(broken)).toEqual(DEFAULT_THEME_PREF);
    expect(() => writeThemePref({ theme: "night", followSystem: true }, broken)).not.toThrow();
  });
  it("写入后可读回，且只保存两个字段", () => {
    writeThemePref({ theme: "bureau", followSystem: true, extra: 1 } as ThemePref);
    expect(JSON.parse(localStorage.getItem(THEME_STORAGE_KEY)!)).toEqual({ theme: "bureau", followSystem: true });
    expect(readThemePref()).toEqual({ theme: "bureau", followSystem: true });
  });
  it("跟随系统：深色用夜读，浅色用所选主题", () => {
    expect(resolveTheme({ theme: "xuan", followSystem: false }, true)).toBe("xuan");
    expect(resolveTheme({ theme: "xuan", followSystem: true }, true)).toBe("night");
    expect(resolveTheme({ theme: "xuan", followSystem: true }, false)).toBe("xuan");
    expect(resolveTheme({ theme: "night", followSystem: true }, false)).toBe("default");
  });
});

describe("应用主题", () => {
  it("默认主题不设置 data-theme，保持原样", () => {
    applyTheme("night");
    applyTheme("default");
    expect(root.hasAttribute("data-theme")).toBe(false);
    expect(root.style.colorScheme).toBe("");
    expect(document.querySelector('meta[name="theme-color"]')!.getAttribute("content")).toBe("#f1efe9");
  });
  it("其他主题写入 data-theme 与标题栏颜色", () => {
    applyTheme("night");
    expect(root.dataset.theme).toBe("night");
    expect(root.style.colorScheme).toBe("dark");
    expect(document.querySelector('meta[name="theme-color"]')!.getAttribute("content")).toBe("#181c1b");
    applyTheme("bureau");
    expect(root.dataset.theme).toBe("bureau");
    expect(root.style.colorScheme).toBe("");
  });

  function Harness() {
    const [pref, setPref] = useAppTheme();
    return <ThemePicker value={pref} onChange={setPref} />;
  }
  it("设置里切换立即生效并保存偏好", () => {
    render(<Harness />);
    expect(root.hasAttribute("data-theme")).toBe(false);
    expect(screen.getByRole("radio", { name: /林间档案/ }).getAttribute("aria-checked")).toBe("true");
    fireEvent.click(screen.getByRole("radio", { name: /採风宣纸/ }));
    expect(root.dataset.theme).toBe("xuan");
    expect(readThemePref()).toEqual({ theme: "xuan", followSystem: false });
    fireEvent.click(screen.getByRole("radio", { name: /林间档案/ }));
    expect(root.hasAttribute("data-theme")).toBe(false);
  });
  it("跟随系统时响应系统深浅色变化", () => {
    const system = mockSystemDark(false);
    render(<Harness />);
    fireEvent.click(screen.getByRole("radio", { name: /档案局/ }));
    fireEvent.click(screen.getByRole("checkbox", { name: /跟随系统/ }));
    expect(root.dataset.theme).toBe("bureau");
    act(() => system.set(true));
    expect(root.dataset.theme).toBe("night");
    act(() => system.set(false));
    expect(root.dataset.theme).toBe("bureau");
  });
});

describe("启动脚本 public/theme-boot.js", () => {
  const boot = readFileSync(join(__dirname, "../public/theme-boot.js"), "utf8");
  const run = () => new Function(boot)();
  it("与 resolveTheme 规则一致，坏数据保持默认", () => {
    const cases: Array<[string | null, boolean]> = [
      [null, false], ["{oops", true], ['{"theme":"night"}', false], ['{"theme":"xuan","followSystem":true}', true],
      ['{"theme":"night","followSystem":true}', false], ['{"theme":"bureau","followSystem":true}', false], ['{"theme":"evil"}', false],
    ];
    for (const [raw, dark] of cases) {
      localStorage.clear();
      if (raw !== null) localStorage.setItem(THEME_STORAGE_KEY, raw);
      delete root.dataset.theme;
      mockSystemDark(dark);
      run();
      const expected = resolveTheme(readThemePref(), dark);
      expect(root.dataset.theme ?? "default").toBe(expected);
    }
  });
  it("index.html 在应用脚本之前同步加载启动脚本（符合 script-src 'self'）", () => {
    const html = readFileSync(join(__dirname, "../index.html"), "utf8");
    expect(html.indexOf('<script src="/theme-boot.js"></script>')).toBeGreaterThan(-1);
    expect(html.indexOf("theme-boot.js")).toBeLessThan(html.indexOf("/src/main.tsx"));
  });
});

describe("主题样式文件", () => {
  const dir = join(__dirname, "styles/themes");
  const core = ["--bg", "--bg-glow", "--paper", "--ink", "--muted", "--line", "--accent", "--shadow-surface"];
  const tokens = readFileSync(join(__dirname, "styles/tokens.css"), "utf8");
  it("默认 token 与改造前的取值一致", () => {
    for (const [k, v] of Object.entries({ "--bg": "#efede6", "--paper": "#fffdf7", "--ink": "#293b35", "--muted": "#68756a", "--line": "#dcded3", "--accent": "#284f43" })) {
      expect(tokens).toContain(`${k}: ${v};`);
    }
  });
  it("每个主题都给出核心 token，且所有规则都限定在自己的 data-theme 下", () => {
    const files = readdirSync(dir).filter((f) => f.endsWith(".css"));
    expect(files.map((f) => f.replace(".css", "")).sort()).toEqual(APP_THEMES.filter((t) => t.id !== "default").map((t) => t.id).sort());
    for (const f of files) {
      const id = f.replace(".css", "");
      const css = readFileSync(join(dir, f), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
      for (const k of core) expect(css, `${f} ${k}`).toMatch(new RegExp(`\\s${k}:`));
      const selectors = [...css.matchAll(/([^{}]+)\{/g)].map((m) => m[1].trim()).filter((s) => !s.startsWith("@"));
      for (const sel of selectors) for (const part of sel.split(",")) expect(part.trim(), f).toMatch(new RegExp(`^(:root)?\\[data-theme="${id}"\\]`));
      expect(css).not.toMatch(/(^|[\s:,])url\((?!"data:)/);
      expect(css).not.toMatch(/@import|@font-face/);
    }
  });
});
