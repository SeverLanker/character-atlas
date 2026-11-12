import { invoke } from "@tauri-apps/api/core";
import { releasedRootIds } from "./external-archives";
import type { Library } from "./model";
import { desktop } from "./storage";

export interface PickedPath { absolutePath: string; name: string }
export interface ArchiveProbe { status: "valid" | "missing" | "unreadable" | "unbound"; detail: string }
export interface ArchiveText { text: string; truncated: boolean }
export interface BoundRoot { rootId: string; absolutePath: string }

/** Web preview cannot touch the desktop filesystem. Desktop calls are explicit user actions. */
export function canOpenLocalFiles(): boolean {
  return desktop;
}

export async function pickArchiveFile(): Promise<PickedPath | null> {
  if (!desktop) return null;
  return invoke<PickedPath | null>("archive_pick_file");
}

export async function pickArchiveRoot(): Promise<PickedPath | null> {
  if (!desktop) return null;
  return invoke<PickedPath | null>("archive_pick_root");
}

export async function bindArchiveRoot(rootId: string, absolutePath: string): Promise<void> {
  if (!desktop) return;
  await invoke("archive_bind_root", { rootId, absolutePath });
}

export async function bindArchiveParent(rootId: string, absoluteFile: string): Promise<string> {
  if (!desktop) throw new Error("网页预览不能定位本机文件");
  return invoke<string>("archive_bind_parent", { rootId, absoluteFile });
}

export async function relativeToRoot(rootId: string, absoluteFile: string): Promise<string> {
  if (!desktop) throw new Error("网页预览不能定位本机文件");
  return invoke<string>("archive_relative", { rootId, absoluteFile });
}

export async function probeArchive(rootId: string, relativePath: string): Promise<ArchiveProbe> {
  if (!desktop) return { status: "unbound", detail: "网页预览不能核对本机文件" };
  return invoke<ArchiveProbe>("archive_probe", { rootId, relativePath });
}

export async function readArchive(rootId: string, relativePath: string): Promise<ArchiveText> {
  if (!desktop) throw new Error("网页预览不能读取本机文件");
  return invoke<ArchiveText>("archive_read", { rootId, relativePath });
}

export async function openArchive(rootId: string, relativePath: string): Promise<void> {
  if (!desktop) throw new Error("网页预览不能打开本机文件");
  await invoke("archive_open", { rootId, relativePath });
}

export async function archiveBindings(): Promise<BoundRoot[]> {
  if (!desktop) return [];
  return invoke<BoundRoot[]>("archive_bindings");
}

/** Drop machine paths for roots that no remaining archive ref uses. Does not touch vault files. */
export async function forgetArchiveRoots(rootIds: string[]): Promise<BoundRoot[]> {
  if (!desktop || rootIds.length === 0) return [];
  return invoke<BoundRoot[]>("archive_forget_roots", { rootIds });
}

/** Put previously released machine paths back. Does not read or write the vault. */
export async function restoreArchiveRoots(roots: BoundRoot[]): Promise<void> {
  if (!desktop || roots.length === 0) return;
  await invoke("archive_restore_roots", { roots });
}

const releasedBindings = new Map<string, string>();
let bindingChain: Promise<void> = Promise.resolve();

/**
 * After a library change, release desktop root mappings that no ref still uses,
 * and put them back when undo or redo makes those refs live again.
 * Paths stay in this session map only — not in the library, logs, or backups.
 */
export function syncReleasedArchiveRoots(before: Library, after: Library): Promise<void> {
  if (!canOpenLocalFiles()) return Promise.resolve();
  const job = bindingChain.then(() => applyBindingRelease(before, after));
  bindingChain = job.catch(() => {});
  return job;
}

async function applyBindingRelease(before: Library, after: Library): Promise<void> {
  const unused = releasedRootIds(before, after);
  const usedAfter = new Set((after.externalArchives ?? []).map((ref) => ref.rootId));
  const usedBefore = new Set((before.externalArchives ?? []).map((ref) => ref.rootId));
  if (unused.length) {
    const removed = await forgetArchiveRoots(unused);
    for (const row of removed) releasedBindings.set(row.rootId, row.absolutePath);
  }
  const returning = [...usedAfter].filter((id) => !usedBefore.has(id) && releasedBindings.has(id));
  if (!returning.length) return;
  await restoreArchiveRoots(returning.map((rootId) => ({ rootId, absolutePath: releasedBindings.get(rootId)! })));
  for (const id of returning) releasedBindings.delete(id);
}
