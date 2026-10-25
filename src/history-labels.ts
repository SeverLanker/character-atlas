import type { Library } from "./model";
import type { HistoryState } from "./useLibraryHistory";
export interface OperationInfo { label: string; source: "ui" | "agent"; at: number }
const operations = new WeakMap<Library, OperationInfo>();
/** Session-only metadata; never stored in a character, backup, request body or disk log. */
export function describeChange(before: Library | null, after: Library): string {
  if (!before) return "载入资料";
  const beforeIds = new Set(before.characters.map(c => c.id)), afterIds = new Set(after.characters.map(c => c.id));
  const added = after.characters.filter(c => !beforeIds.has(c.id)).length;
  const removed = before.characters.filter(c => !afterIds.has(c.id)).length;
  if (added || removed) return `角色变动：新增 ${added}、移除 ${removed}`;
  if (before.catalog !== after.catalog) {
    const oldIds = new Set(before.catalog?.map(row => row.id)), nextIds = new Set(after.catalog?.map(row => row.id));
    return `条目库变动：新增 ${[...nextIds].filter(id => !oldIds.has(id)).length}、移除 ${[...oldIds].filter(id => !nextIds.has(id)).length}、更新内容`;
  }
  const changed = after.characters.filter((c, i) => c !== before.characters[i]);
  return changed.length === 1 ? `编辑角色「${changed[0].name}」` : "更新角色资料";
}
export function markOperation(after: Library, before: Library | null, source: OperationInfo["source"], at: number) {
  operations.set(after, { label: describeChange(before, after), source, at });
}
const info = (value: Library, before: Library | null): OperationInfo => operations.get(value) ?? { label: describeChange(before, value), source: "ui", at: 0 };
export function operationHistory(state: HistoryState) {
  const states = [...state.past, ...(state.current ? [state.current] : [])];
  return {
    undo: states.slice(1).map((state, i) => info(state, states[i])).reverse(),
    redo: state.future.map((target, i) => info(target, i ? state.future[i - 1] : state.current)),
  };
}
