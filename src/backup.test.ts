import { describe, expect, it } from "vitest";
import { strToU8, zipSync } from "fflate";
import { createCharacter, type Library } from "./model";
import { parseBackup } from "./storage";

function backupLibrary(): Library {
  return { schemaVersion: 1, characters: [createCharacter("备份测试")] };
}
describe("完整资料库备份校验", () => {
  it("读取包含图片的资料库", () => {
    const library = backupLibrary();
    library.characters[0].versions[0].profile.portrait = "photo.png";
    const bytes = zipSync({
      "library.json": strToU8(JSON.stringify(library)),
      "assets/photo.png": new Uint8Array([1, 2, 3]),
    });
    const parsed = parseBackup(bytes);
    expect(parsed.library.characters[0].name).toBe("备份测试");
    expect(parsed.assets["photo.png"]).toEqual(new Uint8Array([1, 2, 3]));
  });
  it("恢复前拒绝缺失图片，包含已关闭的秘密档案图片", () => {
    const library = backupLibrary();
    library.characters[0].versions[0].secret.overrides.portrait = "secret.jpg";
    const bytes = zipSync({ "library.json": strToU8(JSON.stringify(library)) });
    expect(() => parseBackup(bytes)).toThrow("备份缺少图片：secret.jpg");
  });
  it("拒绝不包含资料库的 ZIP", () => {
    expect(() => parseBackup(zipSync({ "other.json": strToU8("{}") }))).toThrow(
      "没有找到 library.json",
    );
  });
  it("忽略未引用的文件与路径穿越条目", () => {
    const library = backupLibrary();
    const bytes = zipSync({
      "library.json": strToU8(JSON.stringify(library)),
      "../../outside.txt": strToU8("ignored"),
      "assets/orphan.png": new Uint8Array([4]),
    });
    expect(parseBackup(bytes).assets).toEqual({});
  });
  it("拒绝非法身份与无效版本资料", () => {
    const lib = backupLibrary();
    lib.characters[0].versions[0].profile.basics.age = 12 as unknown as string;
    expect(() =>
      parseBackup(zipSync({ "library.json": strToU8(JSON.stringify(lib)) })),
    ).toThrow("身份字段无效");
  });
});
