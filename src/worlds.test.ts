import { expect, it } from "vitest";
import { moveToCollection } from "./batch";
import { isSafeRelativePath, readingParagraphs, reviseArchive, createArchiveRef, createArchiveRoot, withArchive, withRoot } from "./external-archives";
import { describeChange } from "./history-labels";
import { mergeLibraries } from "./merge";
import { createCharacter, duplicateVersion, migrateLibrary, validateLibrary } from "./model";
import { assignCharacterWorld, charactersInWorld, createWorld, looseCharacters, versionSummary, withWorld, withWorldLink, worldMissing } from "./worlds";

it("旧库升级保留分组原文，不把同名 collection 收成世界", () => {
  const first = createCharacter("甲", "雾港");
  const second = createCharacter("乙", "雾港");
  const raw = { schemaVersion: 1 as const, characters: [first, second] };
  const migrated = migrateLibrary(raw);
  expect(migrated.schemaVersion).toBe(2);
  expect(migrated.worlds).toBeUndefined();
  expect(migrated.archiveRoots).toBeUndefined();
  expect(migrated.externalArchives).toBeUndefined();
  expect(migrated.characters.map((character) => character.collection)).toEqual(["雾港", "雾港"]);
  expect(migrated.characters.every((character) => character.worldId === undefined)).toBe(true);
  expect(raw.characters[0].collection).toBe("雾港");
});

it("同名世界不合并，空世界保留，分组改名不改世界，跨世界引用不吞并", () => {
  const role = createCharacter("甲", "  分组甲  ");
  role.versions.push(duplicateVersion(role.versions[0], "第二章"));
  let library = migrateLibrary({ schemaVersion: 2, characters: [role, createCharacter("乙", "")] });
  const first = createWorld("同名", "第一段简介。\n\n第二段简介。");
  const second = createWorld("同名");
  library = withWorld(withWorld(library, first), second);
  expect(library.worlds).toHaveLength(2);
  expect(new Set(library.worlds!.map((world) => world.id)).size).toBe(2);
  expect(charactersInWorld(library, first.id)).toEqual([]);
  library = assignCharacterWorld(library, role.id, second.id);
  expect(library.characters[0].collection).toBe("  分组甲  ");
  expect(library.characters[0].worldId).toBe(second.id);
  library = moveToCollection(library, [role.id], "新分组");
  expect(library.characters[0].collection).toBe("新分组");
  expect(library.characters[0].worldId).toBe(second.id);
  expect(versionSummary(library.characters[0])).toBe("2 个剧情版本：初始设定、第二章");
  library = withWorldLink(library, first.id, second.id, "只是引用");
  expect(library.worlds![0].name).toBe("同名");
  expect(library.worlds![1].name).toBe("同名");
  expect(library.worlds![0].links[0].targetWorldId).toBe(second.id);
  const dangling = createCharacter("丙", "雾港");
  dangling.worldId = "missing-id";
  const holding = migrateLibrary({ schemaVersion: 2, characters: [dangling] });
  expect(worldMissing(holding, holding.characters[0])).toBe(true);
  expect(looseCharacters(holding).map((character) => character.name)).toEqual(["丙"]);
  expect(() => validateLibrary(holding)).not.toThrow();
});

it("追加导入按 id 保留双方同名世界，不覆盖已有世界，分组原文不动", () => {
  const kept = createWorld("甲名");
  let current = withWorld(migrateLibrary({ schemaVersion: 2, characters: [createCharacter("甲", "甲组")] }), kept);
  const incomingWorld = createWorld("甲名");
  const incomingCharacter = createCharacter("乙", "  乙组  ");
  incomingCharacter.worldId = incomingWorld.id;
  const incoming = withWorld(migrateLibrary({ schemaVersion: 2, characters: [incomingCharacter] }), incomingWorld);
  const merged = mergeLibraries(current, incoming, {});
  expect(merged.worlds?.filter((world) => world.name === "甲名")).toHaveLength(2);
  expect(merged.characters.find((character) => character.name === "甲")!.collection).toBe("甲组");
  expect(merged.characters.find((character) => character.name === "乙")!.collection).toBe("  乙组  ");
  expect(merged.characters.find((character) => character.name === "乙")!.worldId).toBe(incomingWorld.id);
  const renamed = { ...kept, name: "被拒绝的新名字" };
  const again = migrateLibrary({ schemaVersion: 2, characters: [] });
  again.worlds = [renamed];
  current = merged;
  const keptName = mergeLibraries(current, again, {}).worlds?.find((world) => world.id === kept.id)?.name;
  expect(keptName).toBe("甲名");
});

it("相对路径拒绝绝对路径和越界，重定位保持引用 id，正文不进资料", () => {
  expect(isSafeRelativePath("notes/角色.md")).toBe(true);
  for (const value of ["../secret.md", "/etc/passwd", "C:/note.md", "foo/../../x.md", "foo//x.md", "foo\\x.md", ""]) {
    expect(isSafeRelativePath(value)).toBe(false);
  }
  const root = createArchiveRoot("合成库");
  const ref = createArchiveRef({ title: "札记", rootId: root.id, relativePath: "notes/a.md", note: "只是维护" });
  let library = withArchive(withRoot(migrateLibrary({ schemaVersion: 2, characters: [] }), root), ref);
  library = reviseArchive(library, ref.id, { relativePath: "moved/b.md" });
  expect(library.externalArchives![0].id).toBe(ref.id);
  expect(library.externalArchives![0].relativePath).toBe("moved/b.md");
  expect(library.externalArchives![0]).not.toHaveProperty("text");
  expect(readingParagraphs("第一段还保持换行。\n仍是同一段。\n\n第二段。")).toEqual(["第一段还保持换行。\n仍是同一段。", "第二段。"]);
  const before = migrateLibrary({ schemaVersion: 2, characters: [createCharacter("甲")] });
  const after = { ...before, worlds: [createWorld("私有世界秘名")], archiveRoots: [root], externalArchives: [ref] };
  expect(describeChange(before, after)).toBe("世界与外部档案引用变动");
  expect(describeChange(before, after)).not.toContain("私有世界秘名");
  expect(describeChange(before, after)).not.toContain("notes/a.md");
});
