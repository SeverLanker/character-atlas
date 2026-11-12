import type { ArchiveRoot, ExternalArchiveRef, Library, Visibility } from "./model.ts";

/** Stable ids for worlds, roots, archive refs and links. Not a filesystem path. */
export function isStableId(value: unknown): value is string {
  return typeof value === "string" && /^[A-Za-z0-9_-]{1,80}$/.test(value);
}

/**
 * Relocatable path inside a user-chosen root.
 * Slashes are separators. Absolute paths, drive letters and `..` are rejected.
 * The library stores this string only; it is not a promise that the file still exists.
 */
export function isSafeRelativePath(value: unknown): value is string {
  if (typeof value !== "string" || value.length < 1 || value.length > 500) return false;
  if (value.includes("\\") || value.includes(":")) return false;
  if ([...value].some((character) => character.charCodeAt(0) < 32)) return false;
  const parts = value.split("/");
  return parts.every((part) => part.length > 0 && part !== "." && part !== "..");
}

export const WEB_ARCHIVE_LIMIT =
  "网页预览不能打开、核对或读取本机文件。这里只保存你写下的标题、根目录名称和相对路径；正文不会复制进资料库，也不会自动同步。要打开原文，请在桌面版重新选择根目录。";

export const DESKTOP_ARCHIVE_LIMIT =
  "桌面版只在你点名的文件上核对和打开原文。绝对路径只留在这台电脑的本机映射里，不写入资料库，也不进入 ZIP。文件移动后不会自动跟上，需要重新选择。";

/** Reading view: keep authored paragraph breaks. Do not inject logs or tables. */
export function readingParagraphs(text: string): string[] {
  return text
    .replace(/\r\n/g, "\n")
    .split(/\n{2,}/)
    .map((part) => part.replace(/^\n+|\n+$/g, ""))
    .filter((part) => part.trim().length > 0);
}

const stamp = () => new Date().toISOString();

export function createArchiveRoot(label: string, id = crypto.randomUUID()): ArchiveRoot {
  const time = stamp();
  return { id, label, createdAt: time, updatedAt: time };
}

export function createArchiveRef(input: {
  title: string;
  rootId: string;
  relativePath: string;
  worldId?: string;
  visibility?: Visibility;
  note?: string;
  id?: string;
}): ExternalArchiveRef {
  const time = stamp();
  const ref: ExternalArchiveRef = {
    id: input.id ?? crypto.randomUUID(),
    title: input.title,
    rootId: input.rootId,
    relativePath: input.relativePath,
    visibility: input.visibility ?? "private",
    note: input.note ?? "",
    createdAt: time,
    updatedAt: time,
  };
  if (input.worldId) ref.worldId = input.worldId;
  return ref;
}

function cloneLibrary(library: Library): Library {
  return structuredClone(library);
}

export function withRoot(library: Library, root: ArchiveRoot): Library {
  if (!isStableId(root.id)) throw new Error("根目录编号无效");
  const label = root.label.trim();
  if (!label || root.label.length > 200) throw new Error("根目录名称无效");
  const next = cloneLibrary(library);
  const roots = next.archiveRoots ?? [];
  if (roots.some((item) => item.id === root.id)) throw new Error("根目录编号重复");
  next.archiveRoots = [...roots, root];
  return next;
}

export function withArchive(library: Library, ref: ExternalArchiveRef): Library {
  if (!isStableId(ref.id) || !isStableId(ref.rootId)) throw new Error("档案引用编号无效");
  if (!isSafeRelativePath(ref.relativePath)) throw new Error("相对路径无效");
  if (!ref.title.trim() || ref.title.length > 300) throw new Error("档案标题无效");
  const next = cloneLibrary(library);
  const rows = next.externalArchives ?? [];
  if (rows.some((item) => item.id === ref.id)) throw new Error("档案引用编号重复");
  next.externalArchives = [...rows, ref];
  return next;
}

/**
 * Drops one archive reference. The root label stays so it can be chosen again.
 * This never deletes, moves, or rewrites the file the reference pointed at.
 */
export function deleteArchiveRef(library: Library, refId: string): Library {
  if (!isStableId(refId)) throw new Error("档案引用编号无效");
  const next = cloneLibrary(library);
  const rows = next.externalArchives ?? [];
  if (!rows.some((ref) => ref.id === refId)) throw new Error("找不到这份档案引用");
  const kept = rows.filter((ref) => ref.id !== refId);
  if (kept.length) next.externalArchives = kept;
  else delete next.externalArchives;
  return next;
}

/** Root ids that archive refs used before and no remaining ref uses. */
export function releasedRootIds(before: Library, after: Library): string[] {
  const still = new Set((after.externalArchives ?? []).map((ref) => ref.rootId));
  const seen = new Set<string>();
  const released: string[] = [];
  for (const ref of before.externalArchives ?? []) {
    if (still.has(ref.rootId) || seen.has(ref.rootId)) continue;
    seen.add(ref.rootId);
    released.push(ref.rootId);
  }
  return released;
}

/** Keep the stable ref id. Update the pointer or its maintenance fields. Does not copy file bytes. */
export function reviseArchive(library: Library, id: string, patch: {
  title?: string;
  rootId?: string;
  relativePath?: string;
  note?: string;
  visibility?: ExternalArchiveRef["visibility"];
  worldId?: string | null;
}): Library {
  const next = cloneLibrary(library);
  const ref = next.externalArchives?.find((item) => item.id === id);
  if (!ref) throw new Error("找不到这份档案引用");
  if (patch.title !== undefined) {
    if (!patch.title.trim() || patch.title.length > 300) throw new Error("档案标题无效");
    ref.title = patch.title;
  }
  if (patch.rootId !== undefined) {
    if (!isStableId(patch.rootId)) throw new Error("根目录编号无效");
    ref.rootId = patch.rootId;
  }
  if (patch.relativePath !== undefined) {
    if (!isSafeRelativePath(patch.relativePath)) throw new Error("相对路径无效");
    ref.relativePath = patch.relativePath;
  }
  if (patch.note !== undefined) {
    if (patch.note.length > 2000) throw new Error("档案附注无效");
    ref.note = patch.note;
  }
  if (patch.visibility) ref.visibility = patch.visibility;
  if (patch.worldId === null) delete ref.worldId;
  else if (patch.worldId) {
    if (!isStableId(patch.worldId)) throw new Error("世界编号无效");
    ref.worldId = patch.worldId;
  }
  ref.updatedAt = stamp();
  return next;
}
