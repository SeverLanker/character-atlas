import { openDB } from "idb";
import { invoke, isTauri } from "@tauri-apps/api/core";
import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";
import { assetRefs, validateLibrary, migrateLibrary, type Library } from "./model";
const db = () =>
  openDB("character-atlas", 1, {
    upgrade(database) {
      database.createObjectStore("library");
      database.createObjectStore("assets");
    },
  });
export const desktop = isTauri();
export async function loadLibrary(): Promise<Library | null> {
  const raw = desktop
    ? await invoke<string | null>("load_library")
    : await (await db()).get("library", "current");
  if (!raw) return null;
  const value = typeof raw === "string" ? JSON.parse(raw) : raw;
  return migrateLibrary(value);
}
export async function saveLibrary(library: Library): Promise<void> {
  validateLibrary(library);
  if (desktop) await invoke("save_library", { data: JSON.stringify(library) });
  else await (await db()).put("library", library, "current");
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
      "叙册资料库备份 v1\n请使用叙册的“恢复备份”功能导入此 ZIP。\n包含全部角色、剧情版本、秘密档案与上传图片。",
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
export async function restoreBackup(bytes: Uint8Array): Promise<Library> {
  const { library, assets } = parseBackup(bytes);
  // Remap incoming assets so restoring a backup never mutates existing images before the library commit.
  const map = new Map<string, string>();
  for (const [ref, data] of Object.entries(assets)) {
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
      }
  await saveLibrary(library);
  return library;
}
export async function downloadBytes(
  bytes: Uint8Array,
  name: string,
): Promise<void> {
  if (desktop) {
    const { save } = await import("@tauri-apps/plugin-dialog");
    const path = await save({
      defaultPath: name,
      filters: [{ name: "叙册备份", extensions: ["zip"] }],
    });
    if (path) await invoke("write_backup", { path, data: toBase64(bytes) });
    return;
  }
  const url = URL.createObjectURL(
    new Blob([new Uint8Array(bytes)], { type: "application/zip" }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}
export async function libraryLocation(): Promise<string> {
  return desktop ? invoke("library_location") : "当前浏览器 · 本地资料库";
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
