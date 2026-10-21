// @vitest-environment happy-dom
import "fake-indexeddb/auto";
import { expect, it } from "vitest";
import { strToU8, zipSync } from "fflate";
import { executeAgentRequest, type AgentContext, type AgentRecord } from "./agent-api";
import { historyReducer, type HistoryState } from "./useLibraryHistory";
import { createCharacter, migrateLibrary, type Library } from "./model";
import { sameLibrary } from "./storage";
import { seedLibrary } from "./seed";

function harness(initial: Library = { schemaVersion: 2, characters: [], catalog: [] }) {
  let state: HistoryState = { current: initial, past: [], future: [], time: 0, group: false };
  let disk = initial;
  const receipts = new Map<string, AgentRecord>(), written: string[] = [];
  const context: AgentContext = {
    lock: () => () => {}, flush: async () => {}, history: () => state, publish: next => { state = next; },
    lookup: async (id, fingerprint) => { const row = receipts.get(id); if (!row) return null; if (row.fingerprint !== fingerprint) throw new Error("409 request_id 已用于不同内容"); return row.reply; },
    commit: async (_req, previous, next, receipt) => { if (JSON.stringify(disk) !== JSON.stringify(previous)) throw new Error("409 资料库已变化"); disk = structuredClone(next); receipts.set(receipt.request_id, receipt); },
    importAssets: async (library, assets) => {
      for (const ref of Object.keys(assets)) { const fresh = `new-${ref}`; written.push(fresh); for (const c of library.characters) for (const v of c.versions) if (v.profile.portrait === ref) v.profile.portrait = fresh; }
    },
  };
  const call = async (method: string, url: string, body?: unknown) => {
    const reply = await executeAgentRequest({ id: crypto.randomUUID(), method, url, body, deadline: Date.now() + 30000, fingerprint: JSON.stringify([method, url, body]) }, context);
    return { ...reply, json: () => JSON.parse(reply.body) };
  };
  const uiEdit = (update: (lib: Library) => Library) => { state = historyReducer(state, { type: "set", update: update(state.current!), time: Date.now(), checkpoint: true }); disk = state.current!; };
  return { call, state: () => state, disk: () => disk, written, uiEdit };
}
function secretCharacter(name: string) {
  const c = createCharacter(name);
  c.versions[0].secret.enabled = true;
  c.versions[0].secret.overrides = { summary: "TOP-SECRET-机密" };
  return c;
}

it("角色导入：单个、数组、资料库三种 JSON；预览不写入；回执幂等；响应不含秘密档案", async () => {
  const h = harness(), one = secretCharacter("甲"), two = secretCharacter("乙");
  for (const text of [JSON.stringify(one), JSON.stringify([one, two]), JSON.stringify({ schemaVersion: 2, characters: [one] })]) {
    const preview = await h.call("POST", "/characters/import?dry_run=1", { format: "json", text });
    expect(preview.status).toBe(200); expect(preview.json().will_add).toBeGreaterThan(0);
    expect(preview.body).not.toContain("TOP-SECRET");
  }
  expect(h.disk().characters).toHaveLength(0);
  const body = { format: "json", text: JSON.stringify([one, two]), request_id: "chars-1" };
  const first = await h.call("POST", "/characters/import", body);
  expect(first.json()).toMatchObject({ added: 2, skipped: 0 });
  expect(first.body).not.toContain("TOP-SECRET");
  expect(h.disk().characters[0].versions[0].secret.overrides.summary).toBe("TOP-SECRET-机密");
  expect((await h.call("POST", "/characters/import", body)).body).toBe(first.body);
  expect(h.disk().characters).toHaveLength(2);
  const list = await h.call("GET", "/characters");
  expect(list.json().characters.map((c: { name: string }) => c.name)).toEqual(["甲", "乙"]);
  expect(list.body).not.toContain("TOP-SECRET");
});

it("ID 冲突：默认跳过，replace 原位替换，copy 生成新编号", async () => {
  const original = createCharacter("原角色");
  const h = harness({ schemaVersion: 2, characters: [original], catalog: [] });
  const incoming = { ...structuredClone(original), name: "新版角色" };
  const text = JSON.stringify(incoming);
  expect((await h.call("POST", "/characters/import", { format: "json", text, request_id: "skip" })).json()).toMatchObject({ added: 0, skipped: 1 });
  expect(h.state().past).toHaveLength(0);
  const copied = (await h.call("POST", "/characters/import", { format: "json", text, on_conflict: "copy", request_id: "copy" })).json();
  expect(copied).toMatchObject({ copied: 1 });
  expect(copied.characters[0].id).not.toBe(original.id);
  expect(h.disk().characters.map(c => c.id)).toEqual([original.id, copied.characters[0].id]);
  await h.call("POST", "/characters/import", { format: "json", text, on_conflict: "replace", request_id: "replace" });
  expect(h.disk().characters[0]).toMatchObject({ id: original.id, name: "新版角色" });
  expect((await h.call("POST", "/characters/import", { format: "json", text, on_conflict: "merge", request_id: "bad" })).status).toBe(422);
});

it("逐个角色校验：坏角色报告编号与原因，其余照常；外部图片、重复 id、超大文本被拒绝", async () => {
  const h = harness(), good = createCharacter("好"), bad = { ...createCharacter("坏"), favorite: "yes" };
  const image = createCharacter("带图"); image.versions[0].profile.portrait = "abc.png";
  const reply = (await h.call("POST", "/characters/import?dry_run=1", { format: "json", text: JSON.stringify([good, bad, image, good]) })).json();
  expect(reply.will_add).toBe(1);
  expect(reply.errors.map((e: { index: number }) => e.index)).toEqual([2, 3, 4]);
  expect(reply.errors[0]).toMatchObject({ name: "坏", reason: '字段 favorite 应为true / false（当前为 "yes"）' });
  expect(reply.errors[1].reason).toContain("ZIP");
  expect(reply.errors[2].reason).toContain("重复");
  expect((await h.call("POST", "/characters/import?dry_run=1", { format: "json", text: "{bad" })).status).toBe(422);
  expect((await h.call("POST", "/characters/import?dry_run=1", { format: "json", text: JSON.stringify({ hello: 1 }) })).status).toBe(422);
  expect((await h.call("POST", "/characters/import?dry_run=1", { format: "json", text: " ".repeat(32 * 1024 * 1024 + 1) })).status).toBe(422);
  expect((await h.call("POST", "/characters/import?dry_run=1", { format: "json", text: "[]", extra: 1 })).status).toBe(422);
});

it("备份 ZIP 导入：图片复制为新文件名并重写引用；路径穿越条目被忽略", async () => {
  const h = harness(), c = createCharacter("图像角色");
  c.versions[0].profile.portrait = "face.png";
  const zip = zipSync({ "library.json": strToU8(JSON.stringify({ schemaVersion: 2, characters: [c] })), "assets/face.png": new Uint8Array([1, 2, 3]), "../evil.png": new Uint8Array([9]) });
  const data_base64 = btoa(String.fromCharCode(...zip));
  const preview = (await h.call("POST", "/characters/import?dry_run=1", { format: "zip", data_base64 })).json();
  expect(preview.will_add).toBe(1); expect(h.written).toEqual([]);
  await h.call("POST", "/characters/import", { format: "zip", data_base64, request_id: "zip" });
  expect(h.written).toEqual(["new-face.png"]);
  expect(h.disk().characters[0].versions[0].profile.portrait).toBe("new-face.png");
  expect((await h.call("POST", "/characters/import?dry_run=1", { format: "zip", data_base64: "%%%" })).status).toBe(422);
});

it("Agent 撤销只作用于 Agent 自己的操作，界面修改在栈顶时返回 409", async () => {
  const h = harness();
  await h.call("POST", "/characters/import", { format: "json", text: JSON.stringify(createCharacter("A")), request_id: "a" });
  h.uiEdit(lib => ({ ...lib, characters: lib.characters.map(c => ({ ...c, name: "界面改名" })) }));
  const refused = await h.call("POST", "/undo", { request_id: "u1" });
  expect(refused.status).toBe(409);
  expect(h.disk().characters[0].name).toBe("界面改名");
  const h2 = harness();
  h2.uiEdit(lib => ({ ...lib, characters: [createCharacter("界面角色")] }));
  await h2.call("POST", "/characters/import", { format: "json", text: JSON.stringify(createCharacter("B")), request_id: "b" });
  expect((await h2.call("POST", "/undo", { request_id: "u2" })).status).toBe(200);
  expect(h2.disk().characters.map(c => c.name)).toEqual(["界面角色"]);
  expect((await h2.call("POST", "/undo", { request_id: "u3" })).status).toBe(409);
  expect((await h2.call("POST", "/redo", { request_id: "r1" })).status).toBe(200);
  expect(h2.disk().characters).toHaveLength(2);
});

it("覆盖导入：内容未变的重名行计为 unchanged，不产生撤销记录", async () => {
  const h = harness();
  const text = JSON.stringify([{ 名称: "修复", 类别: "技能", 等级: "精通", 说明: "旧书" }]);
  await h.call("POST", "/catalog/import", { format: "json", text, request_id: "add" });
  const preview = (await h.call("POST", "/catalog/import?dry_run=1", { format: "json", text, overwrite: "all" })).json();
  expect(preview).toMatchObject({ will_overwrite: 0, unchanged: 1, skipped_dup: 0 });
  const same = (await h.call("POST", "/catalog/import", { format: "json", text, overwrite: "all", request_id: "same" })).json();
  expect(same).toMatchObject({ overwritten: 0, unchanged: 1 }); expect(h.state().past).toHaveLength(1);
  const changed = JSON.stringify([{ 名称: "修复", 类别: "技能", 等级: "大师", 说明: "旧书" }]);
  expect((await h.call("POST", "/catalog/import", { format: "json", text: changed, overwrite: "all", request_id: "diff" })).json()).toMatchObject({ overwritten: 1, unchanged: 0 });
});

it("TSV 导出可再导入；首次打开的演示资料与迁移后的存储一致", async () => {
  const h = harness();
  await h.call("POST", "/catalog/import", { format: "json", text: JSON.stringify([{ 名称: "修\t复", 类别: "技能", 说明: "多行\n说明" }]), request_id: "add" });
  const tsv = await h.call("GET", "/catalog/export?format=tsv");
  expect(tsv.content_type).toContain("tab-separated");
  expect((await h.call("POST", "/catalog/import?dry_run=1", { format: "tsv", text: tsv.body })).json()).toMatchObject({ skipped_dup: 1, errors: [] });
  const seed = seedLibrary();
  expect(sameLibrary(migrateLibrary(seed), seed)).toBe(true);
  expect(sameLibrary(null, seed)).toBe(false);
});
