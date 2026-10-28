// @vitest-environment happy-dom
import "fake-indexeddb/auto";
import { describe, expect, it } from "vitest";
import { strToU8, zipSync, unzipSync, strFromU8 } from "fflate";
import {
  createDocument,
  documentTemplates,
  profileDocuments,
  type DocumentType,
} from "./documents";
import {
  assetRefs,
  createCharacter,
  duplicateVersion,
  effectiveProfile,
  migrateLibrary,
  validateLibrary,
  type Library,
} from "./model";
import {
  copyIncomingAssets,
  exportBackup,
  parseBackup,
  readAsset,
} from "./storage";
import { characterToMarkdown, libraryToMarkdownZip } from "./export/markdown";
import { buildSearchIndex } from "./search";
import { mergeLibraries } from "./merge";

function sample() {
  const character = createCharacter("学生甲");
  const version = character.versions[0];
  Object.assign(version.profile.basics, {
    code: "PUBLIC-ID",
    residence: "公开地址",
    gender: "女",
  });
  version.profile.documents = [
    createDocument("identity", version.profile),
    createDocument("driver", version.profile),
  ];
  version.secret.enabled = true;
  version.secret.overrides.documents = [
    createDocument("police", version.profile),
  ];
  version.secret.overrides.documents[0].fields.number = "SECRET-BADGE";
  const library: Library = { schemaVersion: 2, characters: [character] };
  return { character, version, library };
}

it("旧库无需迁移写入证件，空列表明确保持空，初始化不复制隐藏资料或混用证件号码", () => {
  const character = createCharacter("旧角色");
  character.versions[0].profile.basics.code = "身份号码";
  character.versions[0].profile.display!.hiddenBasics = ["name"];
  const library = migrateLibrary({ schemaVersion: 1, characters: [character] });
  const profile = library.characters[0].versions[0].profile;
  expect(profile.documents).toBeUndefined();
  expect(profileDocuments(profile)[0].fields.holder).toBeUndefined();
  expect(profileDocuments(profile)[0].fields.number).toBe("身份号码");
  for (const type of Object.keys(documentTemplates) as DocumentType[]) {
    if (type !== "identity")
      expect(createDocument(type, profile).fields.number).toBeUndefined();
  }
  profile.documents = [];
  expect(profileDocuments(profile)).toEqual([]);
});

it("多张同类证件、公开秘密覆盖与复制剧情版本互相独立", () => {
  const { version, library } = sample();
  const copy = createDocument("identity", version.profile);
  version.profile.documents!.push(copy);
  validateLibrary(library);
  const next = duplicateVersion(version, "下一阶段");
  next.profile.documents![0].fields.holder = "伪装姓名";
  next.secret.overrides.documents![0].fields.number = "后期警号";
  expect(version.profile.documents![0].fields.holder).toBe("学生甲");
  expect(effectiveProfile(version, true).documents![0].fields.number).toBe(
    "SECRET-BADGE",
  );
  version.secret.overrides.documents = [];
  expect(profileDocuments(effectiveProfile(version, true))).toEqual([]);
  delete version.secret.overrides.documents;
  expect(profileDocuments(effectiveProfile(version, true))).toEqual(
    version.profile.documents,
  );
  const merged = mergeLibraries(library, library, {
    [library.characters[0].id]: "copy",
  });
  expect(merged.characters[1].versions[0].profile.documents![0].id).not.toBe(
    version.profile.documents![0].id,
  );
});

describe("导入证件校验", () => {
  it.each([
    ["重复编号", (docs: unknown[]) => docs.push(structuredClone(docs[0]))],
    [
      "未知类型",
      (docs: unknown[]) => Object.assign(docs[0]!, { type: "constructor" }),
    ],
    [
      "非法照片",
      (docs: unknown[]) =>
        Object.assign(docs[0]!, { portrait: "../secret.png" }),
    ],
    [
      "非法字段",
      (docs: unknown[]) => Object.assign(docs[0]!, { fields: { number: 23 } }),
    ],
    [
      "未知字段",
      (docs: unknown[]) =>
        Object.assign(docs[0]!, { fields: { arbitrary: "text" } }),
    ],
  ])("拒绝%s且提供角色与身份上下文", (_, mutate) => {
    const { library, version } = sample();
    mutate(version.secret.overrides.documents!);
    expect(() => validateLibrary(library)).toThrow(
      /学生甲.*秘密档案.*证件资料无效/,
    );
  });
});

it("证件独立照片进入完整备份，恢复换名后图片内容一致，缺图不能静默丢弃", async () => {
  const { library, version } = sample();
  version.profile.documents![0].portrait = "public-doc.png";
  version.secret.overrides.documents![0].portrait = "secret-doc.png";
  const assets = {
    "public-doc.png": new Uint8Array([1, 2, 3]),
    "secret-doc.png": new Uint8Array([4, 5, 6]),
  };
  const missing = zipSync({ "library.json": strToU8(JSON.stringify(library)) });
  expect(() => parseBackup(missing)).toThrow("备份缺少图片");
  await copyIncomingAssets(library, assets);
  const refs = assetRefs(library);
  expect(refs).toHaveLength(2);
  expect(refs).not.toContain("public-doc.png");
  expect(await readAsset(version.profile.documents![0].portrait)).toEqual(
    assets["public-doc.png"],
  );
  const parsed = parseBackup(await exportBackup(library));
  expect(parsed.library).toEqual(migrateLibrary(library));
  expect(
    parsed.assets[version.secret.overrides.documents![0].portrait],
  ).toEqual(assets["secret-doc.png"]);
});

it("公开 Markdown / 检索排除秘密证件文字和照片，显式包含后才导出", async () => {
  const { character, library, version } = sample();
  version.profile.documents![0].fields.number = "VISIBLE-ID";
  version.secret.overrides.documents![0].portrait = "secret-doc.png";
  const normal = characterToMarkdown(character, library, {});
  expect(normal).toContain("VISIBLE-ID");
  expect(normal).not.toContain("SECRET-BADGE");
  expect(
    buildSearchIndex(library).some((doc) => doc.text.includes("SECRET-BADGE")),
  ).toBe(false);
  expect(
    buildSearchIndex(library, true).some(
      (doc) => doc.hidden && doc.text.includes("SECRET-BADGE"),
    ),
  ).toBe(true);
  const readAsset = async () => new Uint8Array([1, 2]);
  const publicZip = unzipSync(
    await libraryToMarkdownZip(library, { readAsset }),
  );
  expect(publicZip["assets/secret-doc.png"]).toBeUndefined();
  const allZip = unzipSync(
    await libraryToMarkdownZip(library, { readAsset, includeSecret: true }),
  );
  expect(allZip["assets/secret-doc.png"]).toBeTruthy();
  expect(
    Object.values(allZip).some((bytes) =>
      strFromU8(bytes).includes("SECRET-BADGE"),
    ),
  ).toBe(true);
});
