import { beforeEach, describe, expect, it, vi } from "vitest";
import { strToU8, zipSync } from "fflate";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const invoke = vi.fn();
vi.mock("@tauri-apps/api/core", () => ({ isTauri: () => true, invoke: (...args: unknown[]) => invoke(...args) }));

const storage = await import("./storage");

beforeEach(() => invoke.mockReset());

describe("桌面端写文件只传内容和建议文件名", () => {
  it("前端不再引用对话框插件（对话框由 Rust 侧弹出）", () => {
    const pkg = JSON.parse(readFileSync(join(__dirname, "../package.json"), "utf8"));
    expect(pkg.dependencies["@tauri-apps/plugin-dialog"]).toBeUndefined();
    expect(readFileSync(join(__dirname, "storage.ts"), "utf8")).not.toContain("plugin-dialog");
  });
  it("备份走 save_backup，不传路径", async () => {
    invoke.mockResolvedValueOnce(true);
    await expect(storage.downloadBytes(new Uint8Array([1, 2, 3]), "叙册备份.zip")).resolves.toBe(true);
    expect(invoke).toHaveBeenCalledWith("save_backup", { suggestedName: "叙册备份.zip", data: "AQID" });
    expect(JSON.stringify(invoke.mock.calls)).not.toContain("path");
  });
  it("用户取消时返回 false", async () => {
    invoke.mockResolvedValueOnce(false);
    await expect(storage.downloadBytes(new Uint8Array([1]), "a.zip")).resolves.toBe(false);
  });
  it("导出走 save_export，带类型", async () => {
    invoke.mockResolvedValue(true);
    await storage.downloadExport(strToU8("# 林弥"), "林弥.md", "md");
    await storage.downloadExport(new Uint8Array([9]), "叙册Markdown.zip", "zip");
    expect(invoke.mock.calls.map((c) => [c[0], (c[1] as { kind: string }).kind, (c[1] as { suggestedName: string }).suggestedName])).toEqual([
      ["save_export", "md", "林弥.md"],
      ["save_export", "zip", "叙册Markdown.zip"],
    ]);
    expect(JSON.stringify(invoke.mock.calls)).not.toContain("path");
  });
  it("条目 JSON 和 CSV 使用原生保存通道", async () => {
    invoke.mockResolvedValue(true);
    await storage.downloadExport(strToU8("{}"), "条目.json", "json");
    await storage.downloadExport(strToU8("名称,类别"), "条目.csv", "csv");
    expect(invoke.mock.calls.map(c => c[1].kind)).toEqual(["json", "csv"]);
    expect(JSON.stringify(invoke.mock.calls)).not.toContain("path");
  });
  it("Rust 侧的中文报错原样抛给界面", async () => {
    invoke.mockRejectedValueOnce("备份文件约 600.0 MB，超过 512 MB 上限，未写入。");
    await expect(storage.downloadBytes(new Uint8Array([1]), "a.zip")).rejects.toBe("备份文件约 600.0 MB，超过 512 MB 上限，未写入。");
  });
  it("迁移资料库不再传目标路径", async () => {
    invoke.mockResolvedValueOnce("D:/新资料库");
    await expect(storage.relocateLibrary()).resolves.toBe("D:/新资料库");
    expect(invoke).toHaveBeenCalledWith("relocate_library");
    invoke.mockResolvedValueOnce(null);
    await expect(storage.relocateLibrary()).resolves.toBeNull();
  });
});

describe("备份解压加固", () => {
  const lib = strToU8(JSON.stringify({ schemaVersion: 2, characters: [] }));
  it("忽略路径穿越等未知条目，只取 library.json 与合法图片名", () => {
    const zip = zipSync({ "library.json": lib, "../evil.png": new Uint8Array([1]), "assets/../../x.png": new Uint8Array([1]), "assets/a/b.png": new Uint8Array([1]) });
    expect(storage.parseBackup(zip).assets).toEqual({});
  });
  it("条目数过多时停止", () => {
    const files: Record<string, Uint8Array> = { "library.json": lib };
    for (let i = 0; i < storage.ZIP_LIMITS.entries + 1; i++) files[`junk/${i}.txt`] = new Uint8Array(0);
    expect(() => storage.parseBackup(zipSync(files, { level: 0 }))).toThrow("文件数量异常");
  });
  it("压缩比异常（zip 炸弹）时停止", () => {
    const zip = zipSync({ "library.json": lib, "assets/bomb.png": new Uint8Array(8 * 1024 * 1024) }, { level: 9 });
    expect(() => storage.parseBackup(zip)).toThrow("压缩比异常");
  });
  it("library.json 超限时停止", () => {
    const big = new Uint8Array(storage.ZIP_LIMITS.libraryJsonBytes + 1);
    const zip = zipSync({ "library.json": big }, { level: 0 });
    expect(() => storage.parseBackup(zip)).toThrow("64 MB");
  });
  it("正常备份照常解析", () => {
    const zip = zipSync({ "library.json": lib, "README.txt": strToU8("x") });
    expect(storage.parseBackup(zip).library.characters).toEqual([]);
  });
});
