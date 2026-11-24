/**
 * 证件外观偏好（仅本机界面设置，不进入资料库）。
 * classic：原有纸质证件；其余为「镂空视频」——视频垫在证件下，用 mix-blend-mode 把大字抠出来。
 */
import { useSyncExternalStore } from "react";

export type DocStyle = "classic" | "ko-hands" | "ko-neon" | "ko-stage";
export const DOC_STYLE_KEY = "atlas-doc-style";
export const docStyleOptions: { value: DocStyle; label: string }[] = [
  { value: "ko-hands", label: "镂空视频 · 掌声" },
  { value: "ko-neon", label: "镂空视频 · 霓虹" },
  { value: "ko-stage", label: "镂空视频 · 舞台" },
  { value: "classic", label: "经典纸质证件" },
];
const valid = (v: unknown): v is DocStyle => docStyleOptions.some((o) => o.value === v);

let current: DocStyle | null = null;
const listeners = new Set<() => void>();

export function readDocStyle(): DocStyle {
  if (current) return current;
  let stored: string | null = null;
  try { stored = localStorage.getItem(DOC_STYLE_KEY); } catch { /* storage unavailable */ }
  current = valid(stored) ? stored : "ko-hands";
  return current;
}
export function saveDocStyle(value: DocStyle): boolean {
  current = value;
  listeners.forEach((fn) => fn());
  try { localStorage.setItem(DOC_STYLE_KEY, value); return true; } catch { return false; }
}
export function useDocStyle(): DocStyle {
  return useSyncExternalStore(
    (fn) => { listeners.add(fn); return () => { listeners.delete(fn); }; },
    readDocStyle,
    () => "classic" as DocStyle,
  );
}
export const koVideoSrc = (style: DocStyle) => `/video/${style.replace("ko-", "ko-")}.mp4`;

/** Rough text width in em: CJK glyphs are ~1em, Latin ~0.6em. Used to fit the knockout word. */
export function wordWidthEm(text: string): number {
  let w = 0;
  for (const ch of text) w += /[\u2e80-\u9fff\uff00-\uffef]/.test(ch) ? 1 : 0.62;
  return Math.max(w, 1.5);
}
