// @vitest-environment happy-dom
import "fake-indexeddb/auto";
import { openDB } from "idb";
import { expect, it } from "vitest";
import { createCharacter } from "./model";
import { listSnapshots, loadLibrary, readAsset, saveLibrary } from "./storage";

it("旧 IndexedDB 升级保留角色与图片，并建立首份保护快照", async () => {
  const old = await openDB("character-atlas", 1, { upgrade(db) {
    db.createObjectStore("library"); db.createObjectStore("assets");
  } });
  const library = { schemaVersion: 1 as const, characters: [createCharacter("升级前角色")] };
  library.characters[0].versions[0].profile.portrait = "original.png";
  await old.put("library", library, "current");
  await old.put("assets", new Uint8Array([1, 2, 3]), "original.png");
  old.close();
  const loaded = (await loadLibrary())!;
  expect(loaded.characters[0].name).toBe("升级前角色");
  expect(await readAsset("original.png")).toEqual(new Uint8Array([1, 2, 3]));
  await saveLibrary(loaded);
  expect((await listSnapshots())[0].data).toEqual(library);
});
