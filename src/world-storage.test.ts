// @vitest-environment happy-dom
import "fake-indexeddb/auto";
import { strFromU8, unzipSync } from "fflate";
import { expect, it } from "vitest";
import { createArchiveRef, createArchiveRoot, withArchive, withRoot } from "./external-archives";
import { createCharacter, migrateLibrary, type Library } from "./model";
import { exportBackup, loadLibrary, restoreBackup, saveLibrary } from "./storage";
import { createWorld, withWorld } from "./worlds";

it("网页 IndexedDB 升级、完整 ZIP 恢复和失败回滚都保住分组与引用", async () => {
  const role = createCharacter("留存", "  雾港  ");
  role.versions[0].secret.overrides = { background: "秘密经历" };
  const original = { schemaVersion: 1 as const, characters: [role] };
  await saveLibrary(original);
  const loaded = (await loadLibrary())!;
  expect(loaded.characters[0].collection).toBe("  雾港  ");
  expect(loaded.characters[0].worldId).toBeUndefined();
  expect(loaded.worlds).toBeUndefined();
  expect(loaded.characters[0].versions[0].secret.overrides.background).toBe("秘密经历");

  const world = createWorld("同名");
  const other = createWorld("同名");
  const root = createArchiveRoot("合成库");
  const ref = createArchiveRef({ title: "札记", rootId: root.id, relativePath: "notes/a.md", worldId: world.id, visibility: "private" });
  const library = withArchive(withRoot(withWorld(withWorld(loaded, world), other), root), ref);
  library.characters[0].worldId = world.id;
  const machineOnly = "MACHINE-ABSOLUTE-/tmp/not-in-the-zip";
  await saveLibrary(library);
  const backup = await exportBackup(library);
  const packed = strFromU8(unzipSync(backup)["library.json"]);
  expect(packed).toContain("notes/a.md");
  expect(packed).toContain("  雾港  ");
  expect(packed).not.toContain(machineOnly);
  expect(packed).not.toContain("absolutePath");

  await saveLibrary({ schemaVersion: 2, characters: [createCharacter("临时")] });
  const restored = await restoreBackup(backup);
  expect(restored.worlds).toHaveLength(2);
  expect(new Set(restored.worlds!.map((item) => item.id)).size).toBe(2);
  expect(restored.characters[0].collection).toBe("  雾港  ");
  expect(restored.characters[0].worldId).toBe(world.id);
  expect(restored.externalArchives![0].id).toBe(ref.id);
  expect(restored.externalArchives![0].relativePath).toBe("notes/a.md");
  expect(restored.externalArchives![0]).not.toHaveProperty("text");
  expect(restored.characters[0].versions[0].secret.overrides.background).toBe("秘密经历");

  const bad = structuredClone(restored) as Library;
  bad.externalArchives = [{ ...ref, relativePath: "../secret.md" }];
  await expect(saveLibrary(bad)).rejects.toThrow(/路径/);
  const after = (await loadLibrary())!;
  expect(after.characters[0].collection).toBe("  雾港  ");
  expect(after.externalArchives![0].relativePath).toBe("notes/a.md");
  expect(migrateLibrary({ schemaVersion: 1, characters: [createCharacter("旧")] }).worlds).toBeUndefined();
});
