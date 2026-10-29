/**
 * Shared reduce-motion switch. Honours the OS setting now; an in-app setting can
 * opt in later by setting `data-reduce-motion="true"` on <html> (CSS uses the same hook).
 */
export function reducedMotion(): boolean {
  if (typeof document !== "undefined" && document.documentElement.dataset.reduceMotion === "true") return true;
  return globalThis.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
}
