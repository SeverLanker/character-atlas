/** App-level 「减少动态效果」 setting; combined with the system prefers-reduced-motion. */
export const MOTION_STORAGE_KEY = "atlas-reduce-motion";
export function readReduceMotion(storage: Pick<Storage, "getItem"> | undefined = globalThis.localStorage): boolean {
  try { return storage?.getItem(MOTION_STORAGE_KEY) === "1"; } catch { return false; }
}
export function writeReduceMotion(value: boolean, storage: Pick<Storage, "setItem"> | undefined = globalThis.localStorage) {
  try { storage?.setItem(MOTION_STORAGE_KEY, value ? "1" : "0"); } catch { /* private mode */ }
}
export function applyReduceMotion(value: boolean, doc: Document = document) {
  if (value) doc.documentElement.dataset.motion = "reduce"; else delete doc.documentElement.dataset.motion;
  doc.dispatchEvent(new Event("atlas-motion-change"));
}
export function motionReduced(doc: Document = document): boolean {
  return doc.documentElement.dataset.motion === "reduce" || (typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches);
}
