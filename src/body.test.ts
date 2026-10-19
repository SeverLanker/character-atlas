// @vitest-environment happy-dom
import "fake-indexeddb/auto";
import { describe, expect, it } from "vitest";
import aria from "./fixtures/bodyval-aria.json";
import { areaMatches, bodyRegions, parseBodyValidatorJson, regionHasCondition, validateBody, type BodyProfile } from "./body";
import { assetRefs, createCharacter, effectiveProfile, migrateLibrary, validateLibrary, type Library } from "./model";
import { exportBackup, parseBackup, putImage, readAsset, restoreBackup } from "./storage";

const v1 = { schema: "bodyval.character/1", name: "Brick", body_type: "adult_male", height_cm: 168, leg_length: -0.4, head_scale: 1, morphs: { Body_Weight: 0.7 }, hide_hair: true, notes: "壮实" };

describe("body-validator 解析与校验", () => {
  it("解析 /1 文件并只保留通用字段", () => {
    const body = parseBodyValidatorJson(JSON.stringify(v1));
    expect(body).toEqual({ schema: "bodyval.character/1", name: "Brick", body_type: "adult_male", height_cm: 168, leg_length: -0.4, head_scale: 1, morphs: { Body_Weight: 0.7 }, notes: "壮实", front: "", back: "" });
  });
  it("解析 body-validator 仓库里的 /3 样例（Aria），忽略发型 / 服装", () => {
    const body = parseBodyValidatorJson("\uFEFF" + JSON.stringify(aria));
    expect(body.body_type).toBe("adult_female");
    expect(body.height_cm).toBeCloseTo(174.3);
    expect(body).not.toHaveProperty("hair_preset");
  });
  it("拒绝非 bodyval 文件与越界数值", () => {
    expect(() => parseBodyValidatorJson("{}")).toThrow("bodyval.character");
    expect(() => parseBodyValidatorJson("not json")).toThrow("合法 JSON");
    expect(() => parseBodyValidatorJson(JSON.stringify({ ...v1, body_type: "dragon" }))).toThrow("body_type");
    expect(() => parseBodyValidatorJson(JSON.stringify({ ...v1, height_cm: 9999 }))).toThrow("height_cm");
    expect(() => validateBody({ ...parseBodyValidatorJson(JSON.stringify(v1)), front: "../x.png" })).toThrow("front");
  });
});

function libraryWithBody(): { library: Library; body: BodyProfile } {
  const character = createCharacter("体型测试");
  const body = { ...parseBodyValidatorJson(JSON.stringify(v1)), front: "front_1.png", back: "" };
  character.versions[0].profile.body = body;
  return { library: { schemaVersion: 2, characters: [character] }, body };
}

describe("资料库集成", () => {
  it("旧资料无 body 仍有效；body 通过校验、迁移保留并计入图片引用", () => {
    validateLibrary({ schemaVersion: 1, characters: [createCharacter("旧")] });
    const { library, body } = libraryWithBody();
    validateLibrary(library);
    const migrated = migrateLibrary({ ...library, schemaVersion: 1 });
    expect(migrated.characters[0].versions[0].profile.body).toEqual(body);
    expect(assetRefs(library)).toContain("front_1.png");
  });
  it("非法 body 带上下文报错", () => {
    const { library } = libraryWithBody();
    (library.characters[0].versions[0].profile.body as unknown as Record<string, unknown>).height_cm = "高";
    expect(() => validateLibrary(library)).toThrow(/表层.*height_cm/);
  });
  it("秘密档案可整体覆盖体型，未覆盖时沿用表层", () => {
    const { library, body } = libraryWithBody();
    const version = library.characters[0].versions[0];
    version.secret.enabled = true;
    expect(effectiveProfile(version, true).body).toEqual(body);
    version.secret.overrides.body = { ...body, body_type: "child", front: "" };
    validateLibrary(library);
    expect(effectiveProfile(version, true).body?.body_type).toBe("child");
    expect(effectiveProfile(version, false).body?.body_type).toBe("adult_male");
  });
  it("备份 ZIP 往返包含正面图，恢复时重编号", async () => {
    const { library } = libraryWithBody();
    const ref = await putImage(new File([new Uint8Array([9, 8, 7])], "front.png", { type: "image/png" }));
    library.characters[0].versions[0].profile.body!.front = ref;
    const zip = await exportBackup(library);
    expect(parseBackup(zip).assets[ref]).toEqual(new Uint8Array([9, 8, 7]));
    const restored = await restoreBackup(zip);
    const newRef = restored.characters[0].versions[0].profile.body!.front;
    expect(newRef).not.toBe(ref);
    expect(await readAsset(newRef)).toEqual(new Uint8Array([9, 8, 7]));
  });
});

describe("部位热区映射", () => {
  it("正面生成 12 个热区，坐标在 0–1 内，正背面左右镜像", () => {
    for (const type of ["adult_female", "adult_male", "teen_female", "teen_male", "child"] as const) {
      const regions = bodyRegions({ body_type: type, head_scale: 1, leg_length: 0 });
      expect(regions).toHaveLength(12);
      for (const r of regions) {
        expect(r.x).toBeGreaterThanOrEqual(0); expect(r.y).toBeGreaterThanOrEqual(0);
        expect(r.x + r.w).toBeLessThanOrEqual(1); expect(r.y + r.h).toBeLessThanOrEqual(1.0001);
      }
    }
    expect(bodyRegions(undefined, "back").map((r) => r.area)).toContain("背部");
    expect(bodyRegions(undefined, "back").map((r) => r.area)).not.toContain("胸部");
    const front = bodyRegions(undefined, "front").find((r) => r.area === "左手")!;
    const back = bodyRegions(undefined, "back").find((r) => r.area === "左手")!;
    expect(front.x).toBeGreaterThan(0.5);
    expect(back.x + back.w).toBeLessThan(0.5);
  });
  it("儿童与大头比例的头部热区更高", () => {
    const head = (b: Parameters<typeof bodyRegions>[0]) => bodyRegions(b).find((r) => r.area === "头部")!.h;
    expect(head({ body_type: "child", head_scale: 1, leg_length: 0 })).toBeGreaterThan(head({ body_type: "adult_male", head_scale: 1, leg_length: 0 }));
    expect(head({ body_type: "adult_male", head_scale: 1.2, leg_length: 0 })).toBeGreaterThan(head({ body_type: "adult_male", head_scale: 1, leg_length: 0 }));
  });
  it("细部位继承旧粗部位记录，粗部位筛选包含细部位", () => {
    expect(regionHasCondition("胸部", "躯干")).toBe(true);
    expect(regionHasCondition("左手", "左臂")).toBe(true);
    expect(regionHasCondition("左手", "右臂")).toBe(false);
    expect(regionHasCondition("头部", "全身")).toBe(false);
    expect(areaMatches("全身", "左脚")).toBe(true);
    expect(areaMatches("左脚", "左腿")).toBe(true);
    expect(areaMatches("胸部", "躯干")).toBe(true);
    expect(areaMatches("躯干", "胸部")).toBe(true);
    expect(areaMatches("右腿", "左腿")).toBe(false);
  });
});
