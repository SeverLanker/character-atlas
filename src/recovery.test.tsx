// @vitest-environment happy-dom
import "fake-indexeddb/auto";
import { openDB } from "idb";
import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { createCharacter, type Library } from "./model";
import { inspectRecovery } from "./recovery";
import { exportRecoveryOriginals, listSnapshots, loadLibrary, prepareBackupRecovery, parseBackup, preserveOriginal, readRawLibrary, readAsset, saveLibrary, snapshotLibrary } from "./storage";
import App from "./App";

const fixture = (): Library => ({ schemaVersion: 2, characters: [createCharacter("旧城旅人")] });
async function connection() {
  return openDB("character-atlas", 2, { upgrade(database) {
    for (const store of ["library", "assets", "snapshots", "originals", "meta"]) database.createObjectStore(store);
  } });
}
beforeEach(async () => {
  const db = await connection();
  for (const store of ["library", "assets", "snapshots", "originals", "meta"]) await db.clear(store);
  db.close();
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

it("事务保留此前资料，30 分钟内不重复快照，最多保存 10 份", async () => {
  let time = Date.UTC(2026, 9, 19);
  vi.spyOn(Date, "now").mockImplementation(() => time);
  const library = fixture();
  await saveLibrary(library);
  library.characters[0].name = "阶段一";
  await saveLibrary(library);
  expect(await listSnapshots()).toHaveLength(1);
  time += 31 * 60 * 1000;
  library.characters[0].name = "阶段二";
  await saveLibrary(library);
  expect((await listSnapshots())[0].data).toMatchObject({ characters: [{ name: "阶段一" }] });
  for (let i = 0; i < 12; i++) {
    time += 31 * 60 * 1000;
    library.characters[0].name = `阶段-${i}`;
    await saveLibrary(library);
  }
  expect(await listSnapshots()).toHaveLength(10);
  expect((await loadLibrary())!.characters[0].name).toBe("阶段-11");
});

it("发现历史记录而当前键缺失时拒绝返回首次使用，恢复前检查图片", async () => {
  await saveLibrary(fixture());
  const db = await connection(); await db.delete("library", "current"); db.close();
  await expect(loadLibrary()).rejects.toThrow("未加载演示资料");
  const row = (await listSnapshots())[0];
  expect((await snapshotLibrary(row)).characters).toHaveLength(1);
  const missingAsset = fixture(); missingAsset.characters[0].versions[0].profile.portrait = "missing.png";
  await expect(snapshotLibrary({ ...row, data: missingAsset })).rejects.toThrow("图片文件缺失");
});

it("写入失败时整笔事务回滚，不改变当前资料或轮换快照", async () => {
  const library = fixture(); await saveLibrary(library);
  const before = await listSnapshots();
  const originalPut = IDBObjectStore.prototype.put;
  vi.spyOn(IDBObjectStore.prototype, "put").mockImplementation(function(this: IDBObjectStore, value, key) {
    if (this.name === "library") throw new DOMException("模拟空间不足", "QuotaExceededError");
    return originalPut.call(this, value, key);
  });
  const next = structuredClone(library); next.characters[0].name = "不应保存";
  await expect(saveLibrary(next, true)).rejects.toThrow("模拟空间不足");
  expect((await loadLibrary())!.characters[0].name).toBe("旧城旅人");
  expect((await listSnapshots()).map((row) => row.id)).toEqual(before.map((row) => row.id));
});

it("缺失 luck 只生成明确的修复预览，原件另存且可导出", async () => {
  const raw = fixture(); raw.characters[0].versions[0].name = "秋日";
  delete (raw.characters[0].versions[0].profile.coc!.state as { luck?: number }).luck;
  const db = await connection(); await db.put("library", raw, "current"); db.close();
  await expect(loadLibrary()).rejects.toThrow(/旧城旅人.*秋日.*coc.state.luck 缺失/);
  const proposal = inspectRecovery(raw);
  expect(proposal.changes[0]).toContain("拟补为 50");
  expect(raw.characters[0].versions[0].profile.coc!.state.luck).toBeUndefined();
  await preserveOriginal(await readRawLibrary());
  await saveLibrary(proposal.library, true);
  expect((await loadLibrary())!.characters[0].versions[0].profile.coc!.state.luck).toBe(50);
  const files = unzipSync(await exportRecoveryOriginals());
  const original = JSON.parse(strFromU8(Object.values(files)[0]));
  expect(original.characters[0].versions[0].profile.coc.state.luck).toBeUndefined();
});

it("无法修复的角色只在明确预览中排除，全坏资料不生成空库方案", () => {
  const raw = fixture(); const bad = createCharacter("坏数据");
  (bad.versions[0].profile.basics as unknown as Record<string, unknown>).age = 24;
  raw.characters.push(bad);
  expect(inspectRecovery(raw).excluded).toBe(1);
  expect(raw.characters).toHaveLength(2);
  expect(() => inspectRecovery({ ...raw, characters: [bad] })).toThrow("没有可安全加载的角色");
});

it("ZIP 默认严格校验，修复预览保留原始内容且不补秘密继承字段", () => {
  const raw = fixture();
  const state = raw.characters[0].versions[0].profile.coc!.state as { luck?: number };
  delete state.luck;
  raw.characters[0].versions[0].secret.overrides.coc = { state: { hp: 5 } };
  const bytes = zipSync({ "library.json": strToU8(JSON.stringify(raw)) });
  expect(() => parseBackup(bytes)).toThrow("coc.state.luck");
  const proposal = prepareBackupRecovery(bytes);
  expect(proposal.library.characters[0].versions[0].secret.overrides.coc!.state!.luck).toBeUndefined();
  expect(JSON.parse(proposal.raw).characters[0].versions[0].profile.coc.state.luck).toBeUndefined();
  expect(parseBackup(proposal.repairedBytes).library.characters).toHaveLength(1);
});

it("读取失败页面可预览修复，确认后重新进入书架并保留原件", async () => {
  const raw = fixture(); delete (raw.characters[0].versions[0].profile.coc!.state as { luck?: number }).luck;
  const db = await connection(); await db.put("library", raw, "current"); db.close();
  render(<App />);
  fireEvent.click(await screen.findByRole("button", { name: "分析可修复资料 / 有效角色" }));
  expect(await screen.findByText(/拟补为 50/)).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "保留原件并应用此方案" }));
  await screen.findByRole("button", { name: "打开旧城旅人的档案" });
  await waitFor(async () => expect((await loadLibrary())!.characters[0].versions[0].profile.coc!.state.luck).toBe(50));
  expect(Object.keys(unzipSync(await exportRecoveryOriginals()))).toHaveLength(1);
});

it("整库不可修复时仍可选择 ZIP，确认后恢复角色及图片并保留坏库原件", async () => {
  const raw = fixture();
  (raw.characters[0].versions[0].profile.basics as unknown as Record<string, unknown>).age = 12;
  const db = await connection(); await db.put("library", raw, "current"); db.close();
  const good = fixture(); good.characters[0].name = "备份中的旅人";
  good.characters[0].versions[0].profile.portrait = "source.png";
  const bytes = zipSync({ "library.json": strToU8(JSON.stringify(good)), "assets/source.png": new Uint8Array([1, 2, 3]) });
  render(<App />);
  const input = await screen.findByLabelText("选择完整 ZIP 备份恢复");
  fireEvent.change(input, { target: { files: [new File([new Uint8Array(bytes)], "backup.zip", { type: "application/zip" })] } });
  await screen.findByText("将用所选 ZIP 替换当前资料，原件会先保留。");
  fireEvent.click(screen.getByRole("button", { name: "保留原件并应用此方案" }));
  await screen.findByRole("button", { name: "打开备份中的旅人的档案" });
  const result = (await loadLibrary())!;
  expect(await readAsset(result.characters[0].versions[0].profile.portrait)).toEqual(new Uint8Array([1, 2, 3]));
  expect(Object.keys(unzipSync(await exportRecoveryOriginals()))).toHaveLength(1);
});
