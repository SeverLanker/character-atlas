// @vitest-environment happy-dom
import "fake-indexeddb/auto";
import { expect, it } from "vitest";
import { executeAgentRequest, type AgentContext, type AgentRecord, type AgentRequest } from "./agent-api";
import { type HistoryState } from "./useLibraryHistory";
import { createCharacter, type Library } from "./model";
import { loadLibrary, readAgentRecord, saveLibrary } from "./storage";

function harness(initial: Library = { schemaVersion: 2, characters: [], catalog: [] }) {
  let state: HistoryState = { current: initial, past: [], future: [], time: 0, group: false }, locked = false;
  let disk = initial;
  const receipts = new Map<string, AgentRecord>();
  const context: AgentContext = {
    lock: () => { if (locked) throw new Error("503 资料正在处理"); locked = true; return () => { locked = false; }; },
    flush: async () => {}, history: () => state, publish: next => { state = next; },
    lookup: async (id, fingerprint) => { const row = receipts.get(id); if (!row) return null; if (row.fingerprint !== fingerprint) throw new Error("409 request_id 已用于不同内容"); return row.reply; },
    commit: async (_req, previous, next, receipt) => { if (JSON.stringify(disk) !== JSON.stringify(previous)) throw new Error("409 资料库已变化"); disk = structuredClone(next); receipts.set(receipt.request_id, receipt); },
  };
  const call = async (method: string, url: string, body?: unknown) => {
    const reply = await executeAgentRequest({ id: crypto.randomUUID(), method, url, body, deadline: Date.now() + 30000, fingerprint: JSON.stringify([method, url, body]) }, context);
    return { ...reply, json: () => JSON.parse(reply.body) };
  };
  return { context, call, state: () => state, disk: () => disk, receipts };
}
const text = JSON.stringify([{ 名称: "京極派唱法 （全套）", 类别: "技能", 等级: "失传", 世界: "新迦南市", 标签: ["歌"] }, { 名称: "", 类别: "法术" }]);

it("dry_run 复用 UI 规则，错误逐条返回，预览不写入", async () => {
  const h = harness();
  const reply = await h.call("POST", "/catalog/import?dry_run=1", { format: "json", text });
  expect(reply.status).toBe(200);
  expect(reply.json()).toMatchObject({ total: 2, will_add: 1, will_overwrite: 0, errors: [{ row: 2, title: "未命名" }] });
  expect(h.disk().catalog).toEqual([]); expect(h.state().past).toHaveLength(0); expect(h.receipts.size).toBe(0);
});

it("实际导入持久回执，断线重试不重复，撤销后重试不重新执行", async () => {
  const h = harness(), body = { format: "json", text, request_id: "import-test" };
  const first = await h.call("POST", "/catalog/import", body);
  expect(first.json()).toMatchObject({ added: 1, overwritten: 0 });
  const after = structuredClone(h.disk());
  expect((await h.call("POST", "/catalog/import", body)).body).toBe(first.body);
  expect(h.state().past).toHaveLength(1);
  expect((await h.call("POST", "/undo", { request_id: "undo-test" })).status).toBe(200);
  expect(h.disk().catalog).toEqual([]);
  await h.call("POST", "/catalog/import", body);
  expect(h.disk().catalog).toEqual([]);
  await h.call("POST", "/redo", { request_id: "redo-test" });
  expect(h.disk()).toEqual(after);
  expect((await h.call("POST", "/catalog/import", { ...body, text: "[]" })).status).toBe(409);
});

it("重名默认跳过，显式覆盖保持旧 id 和名称，错误格式不放宽", async () => {
  const h = harness();
  await h.call("POST", "/catalog/import", { format: "json", text, request_id: "add" });
  const id = h.disk().catalog![0].id;
  const changed = JSON.stringify([{ 名称: "京極派唱法(全套)", 类别: "技能", 世界: "新迦南市", 说明: "新版" }]);
  expect((await h.call("POST", "/catalog/import", { format: "json", text: changed, request_id: "skip" })).json()).toMatchObject({ added: 0, skipped_dup: 1 });
  expect(h.state().past).toHaveLength(1);
  await h.call("POST", "/catalog/import", { format: "json", text: changed, overwrite: "all", request_id: "overwrite" });
  expect(h.disk().catalog![0]).toMatchObject({ id, title: "京極派唱法 （全套）", text: "新版" });
  expect((await h.call("POST", "/catalog/import", { format: ["json"], text: "[]", request_id: "bad-format" })).status).toBe(422);
  expect((await h.call("POST", "/catalog/import", { format: "json", text })).status).toBe(422);
});

it("PATCH、DELETE 只改共享库，逐条校验且支持撤销", async () => {
  const character = createCharacter("保留角色");
  const h = harness({ schemaVersion: 2, characters: [character], catalog: [] });
  await h.call("POST", "/catalog/import", { format: "json", text, request_id: "add" });
  const id = h.disk().catalog![0].id;
  expect((await h.call("PATCH", `/catalog/${id}`, { world: null, request_id: "bad-world" })).status).toBe(422);
  expect((await h.call("PATCH", `/catalog/${id}`, { tags: [42], request_id: "bad-tags" })).status).toBe(422);
  expect((await h.call("PATCH", `/catalog/${id}`, { arbitrary: true, request_id: "bad-key" })).status).toBe(422);
  await h.call("PATCH", `/catalog/${id}`, { world: "雾港", rank: "精通", text: "修订", tags: ["文献"], request_id: "patch" });
  expect((await h.call("GET", `/catalog/${id}`)).json()).toMatchObject({ world: "雾港", rank: "精通", tags: ["文献"] });
  const changed = structuredClone(h.disk());
  await h.call("DELETE", `/catalog/${id}`, { request_id: "delete" });
  expect((await h.call("GET", "/stats")).json()).toMatchObject({ characters: 1, versions: 1, catalog: 0, catalog_by_kind: { skill: 0 } });
  await h.call("POST", "/undo", { request_id: "undo-delete" });
  expect(h.disk()).toEqual(changed); expect(h.disk().characters).toEqual([character]);
});

it("导出支持世界、类别、标签和关键词组合过滤", async () => {
  const h = harness();
  await h.call("POST", "/catalog/import", { format: "json", text: JSON.stringify([{ 名称: "修复", 类别: "技能", 世界: "新迦南市", 标签: ["文献"], 说明: "旧书" }, { 名称: "怀表", 类别: "物品", 世界: "雾港" }]), request_id: "add" });
  const reply = await h.call("GET", "/catalog/export?format=json&scope=world:新迦南市&tag=文献&q=旧书");
  expect(reply.json().entries).toHaveLength(1);
  expect(reply.json().entries[0].title).toBe("修复");
  expect((await h.call("GET", "/catalog/export?format=csv&scope=kind:item")).body).toContain("怀表");
  expect((await h.call("GET", "/catalog/export?scope=kind:wrong")).status).toBe(422);
});

it("过期请求与没有历史的撤销不会提交", async () => {
  const h = harness();
  expect((await h.call("POST", "/undo", { request_id: "empty" })).status).toBe(409);
  const request: AgentRequest = { id: "expired", method: "POST", url: "/catalog/import", fingerprint: "abc", deadline: Date.now() - 1, body: { format: "json", text, request_id: "expired" } };
  expect((await executeAgentRequest(request, h.context)).status).toBe(504); expect(h.receipts.size).toBe(0);
});

it("IndexedDB 中资料和回执原子保存，新的会话可读取原请求结果", async () => {
  const before: Library = { schemaVersion: 2, characters: [], catalog: [] };
  await saveLibrary(before);
  const h = harness(before);
  h.context.lookup = readAgentRecord;
  h.context.commit = (req, previous, next, record) => saveLibrary(next, false, previous, { ...record, id: req.id, deadline: req.deadline });
  const body = { format: "json", text, request_id: `durable-${crypto.randomUUID()}` };
  const reply = await h.call("POST", "/catalog/import", body);
  const saved = (await loadLibrary())!;
  expect(saved.catalog).toHaveLength(1);
  const restarted = harness(saved); restarted.context.lookup = readAgentRecord;
  expect((await restarted.call("POST", "/catalog/import", body)).body).toBe(reply.body);
  expect(restarted.receipts.size).toBe(0); expect(await loadLibrary()).toEqual(saved);
});
