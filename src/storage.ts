import { openDB } from "idb";
import { invoke, isTauri } from "@tauri-apps/api/core";
import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";
import { assetRefs, validateLibrary, migrateLibrary, type Library } from "./model";
import { inspectRecovery } from "./recovery";
import { defaultImportChoice, mergeLibraries, type ImportChoices } from "./merge";
const db = () =>
  openDB("character-atlas", 2, {
    upgrade(database) {
      for (const name of ["library", "assets", "snapshots", "originals", "meta"])
        if (!database.objectStoreNames.contains(name)) database.createObjectStore(name);
    },
  });
export const desktop = isTauri();
export async function lastBackupExport(): Promise<string | null> {
  return desktop ? null : (await (await db()).get("meta", "lastExport") ?? null);
}
export async function recordBackupExport(): Promise<void> {
  if (!desktop) await (await db()).put("meta", new Date().toISOString(), "lastExport");
}
export async function readRawLibrary(): Promise<unknown> {
  return desktop
    ? await invoke<string | null>("load_library")
    : await (await db()).get("library", "current");
}
export async function loadLibrary(): Promise<Library | null> {
  const raw = await readRawLibrary();
  if (raw == null && !desktop) {
    const database = await db();
    if (await database.get("meta", "initialized") || await database.count("snapshots") || await database.count("assets"))
      throw new Error("当前资料缺失，但发现历史使用记录。请使用历史快照恢复；未加载演示资料。");
  }
  if (raw == null) return null;
  const value = typeof raw === "string" ? JSON.parse(raw) : raw;
  return migrateLibrary(value);
}
export interface LibrarySnapshot { id: string; createdAt: string; data: unknown }
export async function listSnapshots(): Promise<LibrarySnapshot[]> {
  if (desktop) return [];
  return (await (await db()).getAll("snapshots") as LibrarySnapshot[]).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}
export async function preserveOriginal(raw: unknown): Promise<void> {
  if (raw === undefined || raw === null) return;
  const text = typeof raw === "string" ? raw : JSON.stringify(raw, null, 2);
  if (desktop) {
    const saved = await downloadBytes(zipSync({ "library.original.json": strToU8(text) }), `叙册修复前原件-${Date.now()}.zip`);
    if (!saved) throw new Error("已取消保存原件，未应用修复");
    return;
  }
  const database = await db();
  await database.put("originals", { data: raw, createdAt: new Date().toISOString() }, crypto.randomUUID());
}
export async function exportRecoveryOriginals(): Promise<Uint8Array> {
  if (desktop) throw new Error("桌面修复原件通过文件保存");
  const rows = await (await db()).getAll("originals");
  if (!rows.length) throw new Error("尚无已保留的修复原件");
  return zipSync(Object.fromEntries(rows.map((row, i) => [`original-${i + 1}.json`, strToU8(typeof row.data === "string" ? row.data : JSON.stringify(row.data, null, 2))])));
}
export async function snapshotLibrary(snapshot: LibrarySnapshot): Promise<Library> {
  const lib = migrateLibrary(typeof snapshot.data === "string" ? JSON.parse(snapshot.data) : snapshot.data);
  for (const ref of assetRefs(lib)) await readAsset(ref);
  return lib;
}
export async function saveLibrary(library: Library, forceSnapshot = false, expectedCurrent?: Library): Promise<void> {
  validateLibrary(library);
  if (desktop) {
    if (expectedCurrent && JSON.stringify(await loadLibrary()) !== JSON.stringify(expectedCurrent)) throw new Error("资料库已变化，请重新预览导入");
    await invoke("save_library", { data: JSON.stringify(library) });
  }
  else {
    const database = await db();
    const tx = database.transaction(["library", "snapshots", "meta"], "readwrite");
    void tx.done.catch(() => {});
    try {
    const previous = await tx.objectStore("library").get("current");
    if (expectedCurrent && JSON.stringify(migrateLibrary(typeof previous === "string" ? JSON.parse(previous) : previous)) !== JSON.stringify(expectedCurrent))
      throw new Error("资料库已变化，请重新预览导入");
    const last = await tx.objectStore("meta").get("lastSnapshot") as number | undefined;
    const time = Date.now();
    if ((!last || forceSnapshot || time - last >= 30 * 60 * 1000) && (!last || JSON.stringify(previous) !== JSON.stringify(library))) {
      const snapshot: LibrarySnapshot = { id: crypto.randomUUID(), createdAt: new Date(time).toISOString(), data: previous ?? library };
      await tx.objectStore("snapshots").put(snapshot, snapshot.id);
      await tx.objectStore("meta").put(time, "lastSnapshot");
      const rows = await tx.objectStore("snapshots").getAll() as LibrarySnapshot[];
      for (const row of rows.sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(10))
        await tx.objectStore("snapshots").delete(row.id);
    }
    await tx.objectStore("library").put(library, "current");
    await tx.objectStore("meta").put(true, "initialized");
    await tx.done;
    } catch (error) {
      try { tx.abort(); } catch { /* Already aborted or completed. */ }
      await tx.done.catch(() => {});
      throw error;
    }
  }
}
function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000)
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}
function fromBase64(value: string): Uint8Array {
  return Uint8Array.from(atob(value), (c) => c.charCodeAt(0));
}
const mimeTypes: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
};
export async function putImage(file: File): Promise<string> {
  const ext = mimeTypes[file.type];
  if (!ext) throw new Error("请选择 PNG、JPEG、WebP 或 GIF 图片。");
  if (file.size > 12 * 1024 * 1024) throw new Error("单张图片请小于 12 MB。");
  const ref = crypto.randomUUID() + "." + ext;
  await writeAsset(ref, new Uint8Array(await file.arrayBuffer()));
  return ref;
}
function validRef(ref: string) {
  if (!/^[a-zA-Z0-9_-]+\.(png|jpg|jpeg|webp|gif)$/.test(ref))
    throw new Error("图片引用无效");
}
async function writeAsset(ref: string, bytes: Uint8Array): Promise<void> {
  validRef(ref);
  if (desktop)
    await invoke("write_asset", { name: ref, data: toBase64(bytes) });
  else await (await db()).put("assets", bytes, ref);
}
export async function readAsset(ref: string): Promise<Uint8Array> {
  validRef(ref);
  const result = desktop
    ? fromBase64(await invoke<string>("read_asset", { name: ref }))
    : await (await db()).get("assets", ref);
  if (!result) throw new Error("图片文件缺失：" + ref);
  return result;
}
const urls = new Map<string, Promise<string>>();
export function imageUrl(ref: string): Promise<string> {
  if (!ref || ref.startsWith("builtin:")) return Promise.resolve("");
  if (!urls.has(ref))
    urls.set(
      ref,
      readAsset(ref)
        .then((bytes) =>
          URL.createObjectURL(
            new Blob([new Uint8Array(bytes)], {
              type:
                "image/" +
                (ref.endsWith(".jpg") ? "jpeg" : ref.split(".").pop()),
            }),
          ),
        )
        .catch((error) => {
          urls.delete(ref);
          throw error;
        }),
    );
  return urls.get(ref)!;
}
export async function exportBackup(library: Library): Promise<Uint8Array> {
  const files: Record<string, Uint8Array> = {
    "library.json": strToU8(JSON.stringify(library, null, 2)),
    "README.txt": strToU8(
      `叙册完整备份\n资料格式 schemaVersion: ${library.schemaVersion}\nlibrary.json: 角色、剧情版本、明档、秘密档案和共享 catalog 条目库。\nassets/: 图片字节；JSON 中的图片字段引用此目录下的文件名。builtin:0–2 为应用内置图片。\n可在“恢复备份”中替换整库，或在“追加导入角色”中选择冲突处理后合并。\n秘密档案不是加密，备份包含秘密内容。\n完整字段类型、必填性与枚举见源码仓库 SCHEMA.md。`,
    ),
  };
  for (const ref of assetRefs(library))
    files["assets/" + ref] = await readAsset(ref);
  return zipSync(files, { level: 6 });
}
export function parseBackup(bytes: Uint8Array): {
  library: Library;
  assets: Record<string, Uint8Array>;
} {
  const files = unpackBackup(bytes);
  const value = JSON.parse(strFromU8(files["library.json"]));
  validateLibrary(value);
  const assets: Record<string, Uint8Array> = {};
  for (const ref of assetRefs(value)) {
    const data = files["assets/" + ref];
    if (!data) throw new Error("备份缺少图片：" + ref);
    if (data.length > 12 * 1024 * 1024)
      throw new Error("备份中的图片超过 12 MB");
    assets[ref] = data;
  }
  return { library: migrateLibrary(value), assets };
}
export function prepareBackupRecovery(bytes: Uint8Array) {
  const files = unpackBackup(bytes);
  const raw = strFromU8(files["library.json"]);
  const proposal = inspectRecovery(raw);
  if (!proposal.changes.length) throw new Error("未发现可安全自动修复的字段，请检查原始错误。");
  files["library.json"] = strToU8(JSON.stringify(proposal.library));
  const repairedBytes = zipSync(files, { level: 6 });
  const parsed = parseBackup(repairedBytes); // Includes referenced image and size checks.
  return { ...proposal, ...parsed, raw, repairedBytes };
}
function unpackBackup(bytes: Uint8Array) {
  if (bytes.length > 256 * 1024 * 1024)
    throw new Error("备份文件超过 256 MB，请拆分资料库。");
  let expanded = 0;
  const files = unzipSync(bytes, {
    filter(file) {
      expanded += file.originalSize;
      if (expanded > 512 * 1024 * 1024) throw new Error("备份解压后过大");
      return (
        file.name === "library.json" ||
        /^assets\/[a-zA-Z0-9_-]+\.(png|jpg|jpeg|webp|gif)$/.test(file.name)
      );
    },
  });
  if (!files["library.json"])
    throw new Error("没有找到 library.json，请选择叙册导出的 ZIP 备份。");
  return files;
}
async function copyIncomingAssets(library: Library, assets: Record<string, Uint8Array>) {
  // Remap incoming assets so restoring a backup never mutates existing images before the library commit.
  const map = new Map<string, string>();
  const needed = new Set(assetRefs(library));
  for (const [ref, data] of Object.entries(assets)) {
    if (!needed.has(ref)) continue;
    const newRef = crypto.randomUUID() + "." + ref.split(".").pop();
    await writeAsset(newRef, data);
    map.set(ref, newRef);
  }
  for (const c of library.characters)
    for (const v of c.versions)
      for (const profile of [v.profile, v.secret.overrides]) {
        if (profile.portrait && map.has(profile.portrait))
          profile.portrait = map.get(profile.portrait)!;
        for (const i of profile.items ?? [])
          if (map.has(i.image)) i.image = map.get(i.image)!;
        for (const i of profile.gallery ?? [])
          if (map.has(i.image)) i.image = map.get(i.image)!;
        if (profile.body) {
          if (map.has(profile.body.front)) profile.body.front = map.get(profile.body.front)!;
          if (map.has(profile.body.back)) profile.body.back = map.get(profile.body.back)!;
        }
      }
}
export async function restoreBackup(bytes: Uint8Array): Promise<Library> {
  const { library, assets } = parseBackup(bytes);
  await copyIncomingAssets(library, assets);
  await saveLibrary(library, true);
  return library;
}
export interface LibraryImport { library: Library; assets: Record<string, Uint8Array> }
export function parseLibraryImport(bytes: Uint8Array, filename: string): LibraryImport {
  if (filename.toLowerCase().endsWith(".zip")) return parseBackup(bytes);
  if (bytes.length > 32 * 1024 * 1024) throw new Error("JSON 文件超过 32 MB，请使用 ZIP");
  const library = migrateLibrary(JSON.parse(strFromU8(bytes).replace(/^\uFEFF/, "")));
  if (assetRefs(library).length) throw new Error("JSON 含有外部图片引用，请改用包含 assets 的完整 ZIP");
  return { library, assets: {} };
}
export async function appendLibraryImport(current: Library, payload: LibraryImport, choices: ImportChoices): Promise<Library> {
  mergeLibraries(current, payload.library, choices); // Validate the proposed size/structure before writing images.
  if (JSON.stringify(await loadLibrary()) !== JSON.stringify(current)) throw new Error("资料库已变化，请重新预览导入");
  const incoming = structuredClone(payload.library);
  incoming.characters = incoming.characters.filter((character) => (choices[character.id] ?? defaultImportChoice(current, character)) !== "skip");
  await copyIncomingAssets(incoming, payload.assets);
  const result = mergeLibraries(current, incoming, choices);
  await saveLibrary(result, true, current);
  return result;
}
export async function downloadBytes(
  bytes: Uint8Array,
  name: string,
): Promise<boolean> {
  if (desktop) {
    const { save } = await import("@tauri-apps/plugin-dialog");
    const path = await save({
      defaultPath: name,
      filters: [{ name: "叙册备份", extensions: ["zip"] }],
    });
    if (path) await invoke("write_backup", { path, data: toBase64(bytes) });
    return Boolean(path);
  }
  const url = URL.createObjectURL(
    new Blob([new Uint8Array(bytes)], { type: "application/zip" }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
  return true;
}
/** 导出文件（Markdown / ZIP）。桌面经保存对话框写入，Rust 侧限制扩展名与体积；网页触发下载。 */
export async function downloadExport(bytes: Uint8Array, name: string, kind: "md" | "zip"): Promise<boolean> {
  if (desktop) {
    const { save } = await import("@tauri-apps/plugin-dialog");
    const path = await save({
      defaultPath: name,
      filters: [kind === "md" ? { name: "Markdown", extensions: ["md"] } : { name: "Markdown 压缩包", extensions: ["zip"] }],
    });
    if (path) await invoke("write_export", { path, data: toBase64(bytes) });
    return Boolean(path);
  }
  const url = URL.createObjectURL(new Blob([new Uint8Array(bytes)], { type: kind === "md" ? "text/markdown;charset=utf-8" : "application/zip" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
  return true;
}
export async function libraryLocation(): Promise<string> {
  return desktop ? invoke("library_location") : `当前浏览器 · ${window.location.origin} · IndexedDB`;
}
export async function openFolder(): Promise<void> {
  if (desktop) await invoke("open_library_folder");
}
export async function relocateLibrary(): Promise<string | null> {
  if (!desktop) return null;
  const { open } = await import("@tauri-apps/plugin-dialog");
  const folder = await open({
    directory: true,
    multiple: false,
    title: "选择用于存放资料库的空文件夹",
  });
  if (!folder) return null;
  return invoke("relocate_library", { destination: folder });
}
