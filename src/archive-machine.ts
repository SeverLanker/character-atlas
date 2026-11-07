import { invoke } from "@tauri-apps/api/core";
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
