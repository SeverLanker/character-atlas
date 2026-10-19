// @ts-nocheck -- 原 tests/domain.test.mjs 为无类型脚本，迁移时保持原断言不变。
import { test } from "vitest";
import assert from "node:assert/strict";
import {
  createCharacter,
  duplicateVersion,
  effectiveProfile,
  assetRefs,
  validateLibrary,
} from "./model.ts";
import { seedLibrary } from "./seed.ts";

test("演示资料与新建角色都符合资料库结构", () => {
  validateLibrary(seedLibrary());
  const character = createCharacter("新角色");
  assert.equal(character.versions.length, 1);
  assert.equal(character.versions[0].profile.basics.name, "新角色");
  assert.equal(character.versions[0].secret.enabled, false);
  validateLibrary({ schemaVersion: 1, characters: [character] });
});
test("剧情版本是独立快照，包括深层条目、技能、图片与秘密身份", () => {
  const original = seedLibrary().characters[0].versions[0];
  const copy = duplicateVersion(original, "故事后期");
  assert.notEqual(original.id, copy.id);
  copy.profile.basics.name = "另一个名字";
  copy.profile.events[0].text = "改变后的经历";
  copy.profile.attributes[0].value = 99;
  copy.profile.gallery[0].caption = "新的图注";
  copy.secret.overrides.basics.name = "新的真名";
  copy.secret.overrides.conditions[0].text = "新的伤势";
  assert.equal(original.profile.basics.name, "林弥");
  assert.notEqual(original.profile.events[0].text, "改变后的经历");
  assert.notEqual(original.profile.attributes[0].value, 99);
  assert.notEqual(original.profile.gallery[0].caption, "新的图注");
  assert.notEqual(original.secret.overrides.basics.name, "新的真名");
  assert.notEqual(original.secret.overrides.conditions[0].text, "新的伤势");
});
test("秘密身份逐字段沿用基础信息，允许明确留空与清空列表", () => {
  const v = createCharacter("表层姓名").versions[0];
  v.profile.basics.age = "24";
  v.profile.background = "表层经历";
  v.secret.enabled = true;
  v.secret.overrides = {
    basics: { name: "真实姓名" },
    background: "",
    attributes: [],
  };
  const hidden = effectiveProfile(v, true);
  assert.equal(hidden.basics.name, "真实姓名");
  assert.equal(hidden.basics.age, "24");
  assert.equal(hidden.background, "");
  assert.deepEqual(hidden.attributes, []);
  assert.equal(effectiveProfile(v, false).basics.name, "表层姓名");
  delete v.secret.overrides.basics.name;
  assert.equal(effectiveProfile(v, true).basics.name, "表层姓名");
});
test("关闭秘密身份保留资料，再次启用后恢复", () => {
  const v = seedLibrary().characters[0].versions[0];
  const name = effectiveProfile(v, true).basics.name;
  v.secret.enabled = false;
  assert.equal(effectiveProfile(v, true).basics.name, "林弥");
  assert.ok(v.secret.overrides.basics.name);
  v.secret.enabled = true;
  assert.equal(effectiveProfile(v, true).basics.name, name);
});
test("备份收集所有剧情版本和已关闭秘密身份里的图片，并去重", () => {
  const lib = { schemaVersion: 1, characters: [createCharacter("测试")] };
  const v = lib.characters[0].versions[0];
  v.profile.portrait = "photo-a.png";
  v.profile.gallery = [
    { id: "1", image: "photo-a.png", caption: "" },
    { id: "2", image: "builtin:0", caption: "" },
  ];
  v.secret.enabled = false;
  v.secret.overrides = {
    portrait: "secret-b.jpg",
    items: [{ id: "3", title: "", text: "", image: "item-c.webp" }],
  };
  const copy = duplicateVersion(v, "另一阶段");
  copy.profile.portrait = "later-d.png";
  lib.characters[0].versions.push(copy);
  assert.deepEqual(
    new Set(assetRefs(lib)),
    new Set(["photo-a.png", "secret-b.jpg", "item-c.webp", "later-d.png"]),
  );
});
test("恢复备份前拒绝重复编号、无版本角色、越界属性和路径穿越", () => {
  const malformed = [
    (lib) => (lib.schemaVersion = 99),
    (lib) => lib.characters.push(structuredClone(lib.characters[0])),
    (lib) => (lib.characters[0].versions = []),
    (lib) =>
      lib.characters[0].versions.push(
        structuredClone(lib.characters[0].versions[0]),
      ),
    (lib) => (lib.characters[0].versions[0].profile.attributes[0].value = -1),
    (lib) =>
      (lib.characters[0].versions[0].profile.portrait = "../private.png"),
    (lib) => (lib.characters[0].versions[0].secret.theme = "unknown"),
    (lib) => (lib.characters[0].versions[0].secret.overrides.basics.age = 23),
    (lib) =>
      (lib.characters[0].versions[0].profile.conditions[0].severity =
        "unknown"),
    (lib) => (lib.characters[0].versions[0].profile.basics = null),
  ];
  for (const mutate of malformed) {
    const lib = seedLibrary();
    mutate(lib);
    assert.throws(() => validateLibrary(lib), /备份格式错误/);
  }
});
