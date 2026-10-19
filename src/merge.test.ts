// @vitest-environment happy-dom
import "fake-indexeddb/auto";
import { openDB } from "idb";
import { beforeEach, expect, it } from "vitest";
import { strToU8, zipSync } from "fflate";
import { createCharacter, duplicateVersion, type Library } from "./model";
import { mergeLibraries } from "./merge";
import { appendLibraryImport, listSnapshots, loadLibrary, parseLibraryImport, putImage, readAsset, saveLibrary } from "./storage";
const fixture = (): Library => ({ schemaVersion: 2, characters: [createCharacter("同名角色")] });
beforeEach(async () => {
  const db = await openDB("character-atlas", 2, { upgrade(database) {
    for (const name of ["library", "assets", "snapshots", "originals", "meta"]) database.createObjectStore(name);
  } });
  for (const name of ["library", "assets", "snapshots", "originals", "meta"]) await db.clear(name);
  db.close();
});
it("ID 冲突默认跳过，同名不同 ID 独立保留；支持显式替换", () => {
  const current = fixture(), incoming = structuredClone(current);
  incoming.characters[0].name = "导入修订";
  incoming.characters.push(createCharacter("同名角色"));
  const merged = mergeLibraries(current, incoming, {});
  expect(merged.characters.map((row) => row.name)).toEqual(["同名角色", "同名角色"]);
  const replaced = mergeLibraries(current, incoming, { [incoming.characters[0].id]: "replace" });
  expect(replaced.characters[0].name).toBe("导入修订");
  expect(current.characters[0].name).toBe("同名角色");
});
it("冲突角色复制时重建各层 ID 并保持正确默认版本，模板冲突保留双方", () => {
  const current = fixture(), incoming = structuredClone(current);
  const role = incoming.characters[0];
  role.versions.push(duplicateVersion(role.versions[0], "后期")); role.defaultVersionId = role.versions[1].id;
  current.catalog = [{ id: "shared", kind: "spell", title: "旧模板", text: "", rank: "", common: false }];
  incoming.catalog = [{ ...current.catalog[0], title: "新模板" }];
  const result = mergeLibraries(current, incoming, { [role.id]: "copy" });
  expect(result.characters[1].id).not.toBe(role.id);
  expect(result.characters[1].versions[1].id).not.toBe(role.versions[1].id);
  expect(result.characters[1].defaultVersionId).toBe(result.characters[1].versions[1].id);
  expect(new Set(result.catalog!.map((row) => row.id)).size).toBe(2);
  expect(result.catalog!.map((row) => row.title)).toEqual(["旧模板", "新模板"]);
});
it("JSON 支持 BOM，外部图片必须使用 ZIP；追加时图片同名不覆盖原图", async () => {
  const current = fixture();
  const ref = await putImage(new File([new Uint8Array([1, 2])], "image.png", { type: "image/png" }));
  current.characters[0].versions[0].profile.portrait = ref;
  await saveLibrary(current);
  const incoming = fixture();
  expect(parseLibraryImport(strToU8("\uFEFF" + JSON.stringify(incoming)), "roles.json").library.characters).toHaveLength(1);
  incoming.characters[0].versions[0].profile.portrait = ref;
  expect(() => parseLibraryImport(strToU8(JSON.stringify(incoming)), "roles.json")).toThrow("外部图片引用");
  const bytes = zipSync({ "library.json": strToU8(JSON.stringify(incoming)), [`assets/${ref}`]: new Uint8Array([9, 8]) });
  const payload = parseLibraryImport(bytes, "roles.zip");
  const result = await appendLibraryImport(current, payload, {});
  const importedRef = result.characters[1].versions[0].profile.portrait;
  expect(importedRef).not.toBe(ref);
  expect(await readAsset(ref)).toEqual(new Uint8Array([1, 2]));
  expect(await readAsset(importedRef)).toEqual(new Uint8Array([9, 8]));
  expect((await loadLibrary())!.characters).toHaveLength(2);
  expect(payload.library.characters[0].versions[0].profile.portrait).toBe(ref);
});
it("预览后当前库变化时中止追加，保留最新资料和快照", async () => {
  const current = fixture(); await saveLibrary(current);
  const changed = structuredClone(current); changed.characters[0].name = "最新资料";
  await saveLibrary(changed);
  const before = await listSnapshots();
  await expect(appendLibraryImport(current, { library: fixture(), assets: {} }, {})).rejects.toThrow("资料库已变化");
  expect((await loadLibrary())!.characters[0].name).toBe("最新资料");
  expect(await listSnapshots()).toEqual(before);
});
