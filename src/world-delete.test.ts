// @vitest-environment happy-dom
import "fake-indexeddb/auto";
import { strFromU8, unzipSync } from "fflate";
import { expect, it } from "vitest";
import { createArchiveRef, createArchiveRoot, deleteArchiveRef, releasedRootIds, withArchive, withRoot } from "./external-archives";
import { characterToMarkdown } from "./export/markdown";
import { buildRelationshipGraph } from "./graph";
import { describeChange } from "./history-labels";
import { createCharacter, migrateLibrary, validateLibrary } from "./model";
import { buildSearchIndex } from "./search";
import { exportBackup, loadLibrary, restoreBackup, saveLibrary } from "./storage";
import { assignCharacterWorld, createWorld, deleteWorld, withWorld, withWorldLink } from "./worlds";

const secretName = "秘名世界";
const secretPath = "vault/only-private.md";
const secretTitle = "私有札记";
const secretNote = "路径附注不要出现";

function sample() {
  const role = createCharacter("甲", "雾港");
  const other = createCharacter("乙", "雾港");
  let library = migrateLibrary({ schemaVersion: 2, characters: [role, other] });
  const hidden = createWorld(secretName, "秘密简介不该出现", "private");
  const shown = createWorld("公开港", "公开简介", "public");
  library = withWorld(withWorld(library, hidden), shown);
  library = withWorldLink(library, shown.id, hidden.id, "跨世界附注");
  library = withWorldLink(library, hidden.id, shown.id, "反向附注");
  library = assignCharacterWorld(library, role.id, hidden.id);
  const root = createArchiveRoot("合成库");
  const spare = createArchiveRoot("另一库");
  const ref = createArchiveRef({
    title: secretTitle, rootId: root.id, relativePath: secretPath, worldId: hidden.id, visibility: "private", note: secretNote,
  });
  const shared = createArchiveRef({
    title: "仍在使用", rootId: root.id, relativePath: "notes/keep.md", visibility: "private", note: "",
  });
  const alone = createArchiveRef({
    title: "单独引用", rootId: spare.id, relativePath: "notes/alone.md", visibility: "public", note: "",
  });
  library = withArchive(withArchive(withArchive(withRoot(withRoot(library, root), spare), ref), shared), alone);
  return { library, role, hidden, shown, root, spare, ref, shared, alone };
}

it("删除世界卸下归属，不删角色、不改分组、不删档案引用", () => {
  const { library, role, hidden, shown, ref } = sample();
  const removed = deleteWorld(library, hidden.id);
  expect(() => validateLibrary(removed)).not.toThrow();
  expect(removed.characters).toHaveLength(2);
  expect(removed.characters.find((character) => character.id === role.id)).toMatchObject({ collection: "雾港" });
  expect(removed.characters.find((character) => character.id === role.id)?.worldId).toBeUndefined();
  expect(removed.worlds?.some((world) => world.id === hidden.id)).toBe(false);
  expect(removed.worlds?.find((world) => world.id === shown.id)?.links ?? []).toEqual([]);
  expect(removed.externalArchives).toHaveLength(3);
  const detached = removed.externalArchives!.find((item) => item.id === ref.id)!;
  expect(detached.worldId).toBeUndefined();
  expect(detached.relativePath).toBe(secretPath);
  expect(detached.title).toBe(secretTitle);
  expect(removed.archiveRoots).toHaveLength(2);
  expect(describeChange(library, removed)).toBe("移除世界");
  const dumped = [
    describeChange(library, removed),
    JSON.stringify(buildSearchIndex(removed, true)),
    characterToMarkdown(removed.characters[0], removed, { includeSecret: true }),
    JSON.stringify(buildRelationshipGraph(removed)),
  ].join("\n");
  for (const secret of [secretName, secretPath, secretTitle, secretNote, "秘密简介不该出现", "跨世界附注"]) {
    expect(dumped).not.toContain(secret);
  }
  expect(dumped).toContain("雾港");
  expect(removed.worlds?.some((world) => world.name === "公开港")).toBe(true);
});

it("删除档案引用只去掉引用，并标出不再使用的根", () => {
  const { library, ref, spare, alone, shared, root } = sample();
  const one = deleteArchiveRef(library, alone.id);
  expect(one.externalArchives?.some((item) => item.id === alone.id)).toBe(false);
  expect(one.externalArchives?.some((item) => item.id === shared.id)).toBe(true);
  expect(one.archiveRoots?.map((item) => item.id)).toEqual(library.archiveRoots?.map((item) => item.id));
  expect(releasedRootIds(library, one)).toEqual([spare.id]);
  expect(one).not.toHaveProperty("text");
  expect(describeChange(library, one)).toBe("移除外部档案引用");
  expect(describeChange(library, one)).not.toContain("notes/alone.md");
  expect(describeChange(library, one)).not.toContain("单独引用");
  const kept = deleteArchiveRef(library, ref.id);
  expect(releasedRootIds(library, kept)).toEqual([]);
  expect(kept.externalArchives?.some((item) => item.rootId === root.id)).toBe(true);
  expect(JSON.stringify(kept)).not.toContain(secretPath);
});

it("旧库升级后删除，完整 ZIP 能把分组和引用恢复回来", async () => {
  const role = createCharacter("留存", "  雾港  ");
  await saveLibrary({ schemaVersion: 1, characters: [role] });
  const loaded = (await loadLibrary())!;
  expect(loaded.worlds).toBeUndefined();
  expect(loaded.characters[0].collection).toBe("  雾港  ");
  const { library } = sample();
  library.characters[0].collection = "  雾港  ";
  const machineOnly = "MACHINE-ABSOLUTE-/tmp/not-in-the-zip";
  await saveLibrary(library);
  const backup = await exportBackup(library);
  const packed = strFromU8(unzipSync(backup)["library.json"]);
  expect(packed).toContain(secretPath);
  expect(packed).toContain("  雾港  ");
  expect(packed).not.toContain(machineOnly);
  expect(packed).not.toContain("absolutePath");

  const withoutWorld = deleteWorld(library, library.worlds!.find((world) => world.name === secretName)!.id);
  const withoutRef = deleteArchiveRef(withoutWorld, withoutWorld.externalArchives!.find((item) => item.title === secretTitle)!.id);
  await saveLibrary(withoutRef);
  const stored = (await loadLibrary())!;
  expect(stored.characters[0].collection).toBe("  雾港  ");
  expect(stored.characters[0].worldId).toBeUndefined();
  expect(stored.worlds?.some((world) => world.name === secretName)).toBe(false);
  expect(stored.externalArchives?.some((item) => item.relativePath === secretPath)).toBe(false);
  expect(stored.characters).toHaveLength(library.characters.length);

  const restored = await restoreBackup(backup);
  expect(restored.characters.find((character) => character.name === "甲")?.collection).toBe("  雾港  ");
  expect(restored.characters.find((character) => character.name === "甲")?.worldId).toBeTruthy();
  expect(restored.worlds?.some((world) => world.name === secretName)).toBe(true);
  expect(restored.externalArchives?.some((item) => item.relativePath === secretPath)).toBe(true);
  expect(JSON.stringify(restored)).not.toContain(machineOnly);
});
