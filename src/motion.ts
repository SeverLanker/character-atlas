/**
 * Shared reduce-motion switch. Honours the OS setting now; an in-app setting can
 * stores its preference on this device and uses the same root attribute as CSS.
 */
export function reducedMotion(): boolean {
  if (typeof document !== "undefined" && document.documentElement.dataset.reduceMotion === "true") return true;
  return globalThis.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
}

export const MOTION_STORAGE_KEY = "atlas-reduce-motion";
export function readReduceMotion(): boolean {
  try { return localStorage.getItem(MOTION_STORAGE_KEY) === "1"; }
  catch { return false; }
}
export function applyReduceMotion(value: boolean): void {
  if (value) document.documentElement.dataset.reduceMotion = "true";
  else delete document.documentElement.dataset.reduceMotion;
}
export function saveReduceMotion(value: boolean): boolean {
  applyReduceMotion(value);
  try { localStorage.setItem(MOTION_STORAGE_KEY, value ? "1" : "0"); return true; }
  catch { return false; }
}
