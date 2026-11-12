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
  const removedIds = (beforeList?: { id: string }[], afterList?: { id: string }[]) => {
    const afterIds = new Set((afterList ?? []).map(item => item.id));
    return (beforeList ?? []).filter(item => !afterIds.has(item.id)).length;
  };
  const removedWorlds = removedIds(before.worlds, after.worlds);
  const removedArchives = removedIds(before.externalArchives, after.externalArchives);
  // Names, titles and paths stay out of the session log.
  if (removedWorlds || removedArchives) {
    if (removedWorlds && removedArchives) return "移除世界与外部档案引用";
    if (removedWorlds) return "移除世界";
    return "移除外部档案引用";
  }
  const changed = after.characters.filter((c, i) => c !== before.characters[i]);
  if (changed.length === 0 && before.characters.length === after.characters.length) {
    const worlds = JSON.stringify(before.worlds ?? []) !== JSON.stringify(after.worlds ?? []);
    const archives = JSON.stringify(before.externalArchives ?? []) !== JSON.stringify(after.externalArchives ?? [])
      || JSON.stringify(before.archiveRoots ?? []) !== JSON.stringify(after.archiveRoots ?? []);
    if (worlds && archives) return "世界与外部档案引用变动";
    if (worlds) return "世界资料变动";
    if (archives) return "外部档案引用变动";
  }
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
