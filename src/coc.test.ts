import { describe, it, expect } from "vitest";
import {
  blankCoc,
  derivedValues,
  mergeCoc,
  skillBase,
  thresholds,
  validateCoc,
} from "./coc";
import {
  createCharacter,
  defaultVersion,
  duplicateVersion,
  effectiveProfile,
  migrateLibrary,
  validateLibrary,
} from "./model";
describe("CoC7 规则与资料兼容", () => {
  it("困难和极难向下取整，支持超过 100 的特殊角色属性", () => {
    expect(thresholds(57)).toEqual({ hard: 28, extreme: 11 });
    expect(thresholds(1)).toEqual({ hard: 0, extreme: 0 });
    expect(thresholds(150)).toEqual({ hard: 75, extreme: 30 });
    const c = blankCoc();
    c.characteristics.STR = 150;
    expect(() => validateCoc(c)).not.toThrow();
    c.state.hp = NaN;
    expect(() => validateCoc(c)).toThrow();
  });
  it("伤害加值与体格正确跨越所有分段边界", () => {
    for (const [sum, db, build] of [
      [64, "-2", -2],
      [65, "-1", -1],
      [84, "-1", -1],
      [85, "0", 0],
      [124, "0", 0],
      [125, "+1D4", 1],
      [164, "+1D4", 1],
      [165, "+1D6", 2],
      [204, "+1D6", 2],
      [205, "+2D6", 3],
      [284, "+2D6", 3],
      [285, "+3D6", 4],
    ] as const) {
      const c = blankCoc();
      c.characteristics.STR = sum;
      c.characteristics.SIZ = 0;
      expect(derivedValues(c)).toMatchObject({ db, build });
    }
  });
  it("移动率处理相等边界与年龄，手动覆盖优先", () => {
    const c = blankCoc();
    expect(derivedValues(c).mov).toBe(8);
    c.characteristics.STR = 60;
    c.characteristics.DEX = 60;
    expect(derivedValues(c).mov).toBe(9);
    expect(derivedValues(c, "40").mov).toBe(8);
    expect(derivedValues(c, "80").mov).toBe(4);
    c.characteristics.STR = 40;
    c.characteristics.DEX = 40;
    expect(derivedValues(c).mov).toBe(7);
    c.overrides.mov = 12;
    expect(derivedValues(c, "80").mov).toBe(12);
  });
  it("动态基础值与上限计算，不恢复当前数值", () => {
    let c = blankCoc();
    c.state = { hp: 2, mp: 3, san: 30, luck: 55 };
    c = mergeCoc(c, {
      characteristics: { DEX: 71, EDU: 85, CON: 65, SIZ: 66, POW: 75 },
    });
    expect(
      skillBase(
        c.skills.find((s) => s.key === "dodge")!,
        c,
      ),
    ).toBe(35);
    expect(
      skillBase(
        c.skills.find((s) => s.key === "ownLanguage")!,
        c,
      ),
    ).toBe(85);
    c.skills.find((s) => s.key === "mythos")!.value = 25;
    expect(derivedValues(c)).toMatchObject({ hp: 13, mp: 15, san: 74 });
    expect(c.state).toEqual({ hp: 2, mp: 3, san: 30, luck: 55 });
    c.overrides.hp = 99;
    expect(derivedValues(c).hp).toBe(99);
  });
  it("旧档案迁移保留原始能力和关闭的秘密档案，迁移可重复执行", () => {
    const role = createCharacter("旧角色"),
      v = role.versions[0];
    delete v.profile.coc;
    delete v.profile.display;
    delete role.defaultVersionId;
    v.profile.attributes = [
      { id: "old-str", name: "力量", value: 67 },
      { id: "old-magic", name: "魔力", value: 90 },
    ];
    v.profile.skills = [
      { id: "story-skill", title: "灵视", rank: "特殊", text: "保留叙事描述" },
    ];
    v.secret.enabled = false;
    v.secret.overrides = {
      attributes: [{ id: "secret-str", name: "力量", value: 150 }],
      background: "旧秘密",
    };
    const original = { schemaVersion: 1, characters: [role] };
    const before = JSON.stringify(original);
    const migrated = migrateLibrary(original),
      converted = migrated.characters[0];
    expect(JSON.stringify(original)).toBe(before);
    expect(migrated.schemaVersion).toBe(2);
    expect(converted.versions[0].profile.coc!.characteristics.STR).toBe(67);
    expect(converted.versions[0].profile.attributes).toEqual(
      v.profile.attributes,
    );
    expect(converted.versions[0].profile.skills).toEqual(v.profile.skills);
    expect(
      converted.versions[0].secret.overrides.coc!.characteristics!.STR,
    ).toBe(150);
    expect(migrateLibrary(migrated)).toEqual(migrated);
    validateLibrary(migrated);
  });
  it("秘密数值逐项继承，版本复制保持独立快照，默认版本不依赖排序", () => {
    const role = createCharacter("表层"),
      v = role.versions[0];
    v.secret.enabled = true;
    v.secret.overrides.coc = {
      characteristics: { STR: 120 },
      state: { hp: 1 },
    };
    const hidden = effectiveProfile(v, true).coc!;
    expect(hidden.characteristics.STR).toBe(120);
    expect(hidden.characteristics.DEX).toBe(50);
    expect(hidden.state).toMatchObject({ hp: 1, mp: 10, san: 50 });
    const next = duplicateVersion(v, "后期");
    role.versions.push(next);
    role.defaultVersionId = next.id;
    next.profile.coc!.state.hp = 5;
    next.secret.overrides.coc!.characteristics!.STR = 180;
    expect(v.profile.coc!.state.hp).toBe(10);
    expect(v.secret.overrides.coc.characteristics!.STR).toBe(120);
    expect(defaultVersion(role)).toBe(next);
  });
});
