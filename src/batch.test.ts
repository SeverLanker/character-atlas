import { describe, expect, it } from "vitest";
import { strFromU8, unzipSync } from "fflate";
import { createCharacter, type Library } from "./model";
import {
  countAffectedRelationships, deleteCharacters, emptySelection, moveToCollection, pruneSelection,
  rangeSelect, selectAll, setFavorite, subsetLibrary, toggleSelect,
} from "./batch";
import { libraryToMarkdownZip } from "./export/markdown";
import { exportBackup, parseBackup, parseLibraryImport } from "./storage";

function lib(): Library {
  const [a, b, c, d] = ["甲", "乙", "丙", "丁"].map((n) => createCharacter(n, "旧组"));
  a.versions[0].profile.relationships = [{ id: "r1", title: "友人", text: "", targetCharacterId: b.id }];
  a.versions[0].secret.overrides = { relationships: [{ id: "r2", title: "宿敌", text: "", targetCharacterId: c.id }] };
  d.versions[0].profile.relationships = [{ id: "r3", title: "同事", text: "", targetCharacterId: b.id }];
  a.versions[0].secret.enabled = true;
  a.versions[0].secret.overrides.background = "秘密背景";
  return { schemaVersion: 2, characters: [a, b, c, d] };
}
const ids = (l: Library) => l.characters.map((c) => c.id);

describe("选择逻辑", () => {
  const v = ["a", "b", "c", "d", "e"];
  it("单选切换与锚点", () => {
    let s = toggleSelect(emptySelection, "b");
    expect(s).toEqual({ ids: ["b"], anchor: "b" });
    s = toggleSelect(s, "d");
    expect(s.ids).toEqual(["b", "d"]);
    s = toggleSelect(s, "b");
    expect(s).toEqual({ ids: ["d"], anchor: "b" });
  });
  it("Shift 连选按可见顺序，双向都可", () => {
    expect(rangeSelect(toggleSelect(emptySelection, "b"), v, "d").ids).toEqual(["b", "c", "d"]);
    expect(rangeSelect(toggleSelect(emptySelection, "d"), v, "a").ids).toEqual(["a", "b", "c", "d"]);
    expect(rangeSelect(emptySelection, v, "c").ids).toEqual(["c"]);
    expect(rangeSelect(toggleSelect(emptySelection, "a"), v, "zzz").ids).toEqual(["a"]);
  });
  it("全选当前结果", () => {
    expect(selectAll(v).ids).toEqual(v);
    expect(selectAll([])).toEqual({ ids: [], anchor: null });
  });
  it("筛选变化后移除看不到的角色，锚点失效", () => {
    const s = { ids: ["a", "c", "e"], anchor: "e" };
    expect(pruneSelection(s, ["c", "a"])).toEqual({ ids: ["c", "a"], anchor: null });
    expect(pruneSelection(s, v)).toBe(s);
  });
});

describe("批量修改", () => {
  it("收藏 / 取消收藏只改角色级字段", () => {
    const l = lib();
    const before = JSON.stringify(l.characters[0].versions);
    const next = setFavorite(l, [ids(l)[0], ids(l)[2]], true);
    expect(next.characters.map((c) => c.favorite)).toEqual([true, false, true, false]);
    expect(JSON.stringify(next.characters[0].versions)).toBe(before);
    expect(setFavorite(next, [ids(l)[0]], true)).toBe(next);
    expect(l.characters[0].favorite).toBe(false);
  });
  it("移到分组（含新建），空名称报错", () => {
    const l = lib();
    const next = moveToCollection(l, [ids(l)[1]], "  新组 ");
    expect(next.characters.map((c) => c.collection)).toEqual(["旧组", "新组", "旧组", "旧组"]);
    expect(next.characters[1].versions).toBe(l.characters[1].versions);
    expect(() => moveToCollection(l, [ids(l)[1]], "  ")).toThrow("不能为空");
  });
  it("删除并统计受影响关系（公开层 + 秘密层），关系条目按单个删除规则保留", () => {
    const l = lib();
    const del = [ids(l)[1], ids(l)[2]];
    expect(countAffectedRelationships(l, del)).toBe(3);
    expect(countAffectedRelationships(l, [ids(l)[0]])).toBe(0);
    const next = deleteCharacters(l, del);
    expect(next.characters.map((c) => c.name)).toEqual(["甲", "丁"]);
    expect(next.characters[0].versions[0].profile.relationships[0].targetCharacterId).toBe(ids(l)[1]);
  });
});

describe("导出所选", () => {
  it("Markdown ZIP 只含所选角色，默认不含秘密", async () => {
    const l = lib();
    const files = unzipSync(await libraryToMarkdownZip(subsetLibrary(l, [ids(l)[0], ids(l)[3]]), { readAsset: async () => new Uint8Array() }));
    expect(Object.keys(files).sort()).toEqual(["index.md", "丁.md", "甲.md"]);
    const all = Object.values(files).map((f) => strFromU8(f)).join("\n");
    expect(all).not.toContain("乙.md");
    expect(all).not.toContain("秘密背景");
  });
  it("备份 ZIP 只含所选，可被恢复与追加导入读取", async () => {
    const l = lib();
    const bytes = await exportBackup(subsetLibrary(l, [ids(l)[0]]));
    expect(parseBackup(bytes).library.characters.map((c) => c.name)).toEqual(["甲"]);
    expect(parseLibraryImport(bytes, "a.zip").library.characters).toHaveLength(1);
    expect(parseBackup(bytes).library.characters[0].versions[0].secret.overrides.background).toBe("秘密背景");
  });
});
