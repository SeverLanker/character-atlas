/**
 * 书架批量操作：选择逻辑与对资料库的纯函数修改。
 *
 * - 选择始终是「当前可见结果」的子集：搜索 / 筛选变化后，看不到的角色自动移出选择，
 *   避免对看不到的角色误删或误改。
 * - 批量修改只改角色级字段（favorite / collection），不碰剧情版本和秘密身份；
 *   结果在返回前用 validateLibrary 校验，再交给 App 的 setLibrary（一次 checkpoint = 撤销栈一步）。
 * - 删除沿用单个删除的规则：只移除角色本身，其他角色里指向它的关系条目保留（变成未关联）。
 */
import { validateLibrary, type Character, type Library } from "./model";

export interface Selection {
  ids: string[];
  /** Shift 连选的起点 */
  anchor: string | null;
}

export const emptySelection: Selection = { ids: [], anchor: null };

/** 切换单个角色（普通点击、Ctrl/Cmd+点击、复选框都用它）。 */
export function toggleSelect(sel: Selection, id: string): Selection {
  const has = sel.ids.includes(id);
  return { ids: has ? sel.ids.filter((x) => x !== id) : [...sel.ids, id], anchor: id };
}

/** Shift+点击：从锚点到当前角色（按可见顺序）全部加入选择。没有锚点时等同单选。 */
export function rangeSelect(sel: Selection, visible: string[], id: string): Selection {
  const from = sel.anchor ? visible.indexOf(sel.anchor) : -1;
  const to = visible.indexOf(id);
  if (to < 0) return sel;
  if (from < 0) return toggleSelect(sel, id);
  const [a, b] = from < to ? [from, to] : [to, from];
  const ids = new Set(sel.ids);
  for (const x of visible.slice(a, b + 1)) ids.add(x);
  return { ids: visible.filter((x) => ids.has(x)), anchor: sel.anchor };
}

/** 全选当前筛选结果。 */
export function selectAll(visible: string[]): Selection {
  return { ids: [...visible], anchor: visible[0] ?? null };
}

/** 让选择与可见结果保持一致：移除看不到的角色，并按可见顺序排列。 */
export function pruneSelection(sel: Selection, visible: string[]): Selection {
  const keep = visible.filter((id) => sel.ids.includes(id));
  const anchor = sel.anchor && visible.includes(sel.anchor) ? sel.anchor : null;
  if (keep.length === sel.ids.length && keep.every((id, i) => id === sel.ids[i]) && anchor === sel.anchor) return sel;
  return { ids: keep, anchor };
}

function commit(library: Library, characters: Character[]): Library {
  const next = { ...library, characters };
  validateLibrary(next);
  return next;
}

export function setFavorite(library: Library, ids: string[], favorite: boolean): Library {
  const set = new Set(ids);
  if (!library.characters.some((c) => set.has(c.id) && c.favorite !== favorite)) return library;
  return commit(library, library.characters.map((c) => (set.has(c.id) ? { ...c, favorite } : c)));
}

export function moveToCollection(library: Library, ids: string[], collection: string): Library {
  const name = collection.trim();
  if (!name) throw new Error("分组名称不能为空");
  if (name.length > 60) throw new Error("分组名称最多 60 个字");
  const set = new Set(ids);
  if (!library.characters.some((c) => set.has(c.id) && c.collection !== name)) return library;
  return commit(library, library.characters.map((c) => (set.has(c.id) ? { ...c, collection: name } : c)));
}

export function deleteCharacters(library: Library, ids: string[]): Library {
  const set = new Set(ids);
  return commit(library, library.characters.filter((c) => !set.has(c.id)));
}

/** 剩余角色中（公开层与秘密层）指向被删角色的关系条目数量。 */
export function countAffectedRelationships(library: Library, ids: string[]): number {
  const set = new Set(ids);
  let count = 0;
  for (const c of library.characters) {
    if (set.has(c.id)) continue;
    for (const v of c.versions)
      for (const list of [v.profile.relationships, v.secret.overrides.relationships])
        for (const r of list ?? []) if (r.targetCharacterId && set.has(r.targetCharacterId)) count++;
  }
  return count;
}

/** 只含所选角色的资料库（导出用，按资料库原顺序）。共享条目库 catalog 原样保留。 */
export function subsetLibrary(library: Library, ids: string[]): Library {
  const set = new Set(ids);
  return { ...library, characters: library.characters.filter((c) => set.has(c.id)) };
}
