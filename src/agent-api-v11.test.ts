// @vitest-environment happy-dom
import { expect, it } from "vitest";
import { executeAgentRequest, type AgentContext, type AgentRecord } from "./agent-api";
import { historyReducer, type HistoryState } from "./useLibraryHistory";
import { exportCatalog, parseCatalog } from "./catalog-io";
import type { CatalogEntry, Library } from "./model";

const entry = (id: string, title: string, extra: Partial<CatalogEntry> = {}): CatalogEntry => ({ id, kind: "skill", title, rank: "", text: "", tags: [], common: false, world: "新迦南市", ...extra });
function harness(catalog: CatalogEntry[]) {
  let state: HistoryState = { current: { schemaVersion: 2, characters: [], catalog }, past: [], future: [], time: 0, group: false };
  const receipts = new Map<string, AgentRecord>();
  const context: AgentContext = {
    lock: () => () => {}, flush: async () => {}, history: () => state, publish: next => { state = next; },
    lookup: async (id, fingerprint) => { const row = receipts.get(id); if (!row) return null; if (row.fingerprint !== fingerprint) throw new Error("409 request_id 已用于不同内容"); return row.reply; },
    commit: async (_req, _previous, _next, receipt) => { receipts.set(receipt.request_id, receipt); },
    backup: async () => new Uint8Array([0x50, 0x4b, 3, 4]),
  };
  const call = async (method: string, url: string, body?: unknown, header?: string) => {
    const reply = await executeAgentRequest({ id: crypto.randomUUID(), method, url, body, request_id: header, deadline: Date.now() + 30000, fingerprint: JSON.stringify([method, url, body]) }, context);
    return { ...reply, json: () => JSON.parse(reply.body) };
  };
  return { call, state: () => state, catalog: () => state.current!.catalog!, ui: (library: Library) => { state = historyReducer(state, { type: "set", update: library, time: Date.now(), checkpoint: true }); } };
}
const seed = () => [entry("a", "夜見", { tags: ["战斗", "歌"] }), entry("b", "京極派唱法", { tags: ["歌"], kind: "spell" }), entry("c", "铁锤", { kind: "item", world: "别处" })];

it("P0-1 PATCH 可改名称与类别，保留 id；冲突返回 409 与 conflict_id", async () => {
  const h = harness(seed());
  const renamed = await h.call("PATCH", "/catalog/a", { title: " 夜见 ", kind: "spell", request_id: "p1" });
  expect(renamed.status).toBe(200);
  expect(renamed.json()).toMatchObject({ id: "a", title: "夜见", kind: "spell" });
  const clash = await h.call("PATCH", "/catalog/a", { title: "京極派唱法 ", request_id: "p2" });
  expect(clash.status).toBe(409);
  expect(clash.json()).toMatchObject({ conflict_id: "b" });
  expect(h.catalog().find(row => row.id === "a")!.title).toBe("夜见");
  const bad = await h.call("PATCH", "/catalog/a", { name: "x", request_id: "p3" });
  expect(bad.json().error).toContain("name");
  expect(bad.json().error).toContain("title（名称）");
  expect((await h.call("PATCH", "/catalog/a", { kind: "spellz", request_id: "p4" })).status).toBe(422);
});

it("P0-2 GET /catalog 轻量列表、筛选、游标分页", async () => {
  const rows = Array.from({ length: 25 }, (_, i) => entry(`e${i}`, `条目${i}`, { text: "很长的说明", tags: i % 2 ? ["奇"] : ["偶"] }));
  const h = harness(rows);
  const first = (await h.call("GET", "/catalog?limit=10&tag=奇")).json();
  expect(first.total).toBe(12);
  expect(first.items).toHaveLength(10);
  expect(first.items[0]).not.toHaveProperty("text");
  expect(first.items[0]).toMatchObject({ id: "e1", kind: "skill", world: "新迦南市", tags: ["奇"] });
  const second = (await h.call("GET", `/catalog?limit=10&tag=奇&cursor=${first.next_cursor}`)).json();
  expect(second.items.map((row: CatalogEntry) => row.id)).toEqual(["e21", "e23"]);
  expect(second.next_cursor).toBeNull();
  expect((await h.call("GET", "/catalog?cursor=nope")).status).toBe(422);
  expect((await h.call("GET", "/catalog?limit=0")).status).toBe(422);
  expect((await h.call("GET", "/catalog?tags=奇,偶&tag_mode=all")).json().total).toBe(0);
  expect((await h.call("GET", "/catalog?q=条目2")).json().total).toBe(6);
});

it("P0-3 Idempotency-Key 请求头适用于所有写操作，body 不一致报 422；dry_run 可放 body；query 中 request_id 明确报错", async () => {
  const h = harness(seed());
  expect((await h.call("DELETE", "/catalog/c", undefined, "del-1")).json()).toMatchObject({ deleted: "c", remaining: 2 });
  expect((await h.call("DELETE", "/catalog/c", undefined, "del-1")).json()).toMatchObject({ deleted: "c" });
  expect((await h.call("PATCH", "/catalog/a", { rank: "1", request_id: "x" }, "y")).status).toBe(422);
  const query = await h.call("DELETE", "/catalog/a?request_id=z");
  expect(query.status).toBe(422);
  expect(query.json().error).toContain("Idempotency-Key");
  const text = JSON.stringify([{ title: "新", kind: "skill" }]);
  const dry = await h.call("POST", "/catalog/import", { format: "json", text, dry_run: true });
  expect(dry.json()).toMatchObject({ will_add: 1 });
  expect(h.catalog()).toHaveLength(2);
  expect((await h.call("POST", "/catalog/import?dry_run=0", { format: "json", text, dry_run: true })).status).toBe(422);
  expect((await h.call("POST", "/undo", { dry_run: true }, "u")).status).toBe(422);
  expect((await h.call("POST", "/catalog/import", { format: "json", text, request_id: "imp" })).json()).toMatchObject({ added: 1 });
});

it("P1-4 /stats 返回撤销深度、按世界分布与标签名录；P1-8 界面改动阻挡时说明栈顶", async () => {
  const h = harness(seed());
  await h.call("PATCH", "/catalog/a", { rank: "1" }, "s1");
  await h.call("PATCH", "/catalog/a", { rank: "2" }, "s2");
  const stats = (await h.call("GET", "/stats")).json();
  expect(stats).toMatchObject({ undo_depth: 2, redo_depth: 0, agent_undo_depth: 2, catalog_by_world: { 新迦南市: 2, 别处: 1 } });
  expect(stats.tags).toEqual([{ tag: "歌", count: 2 }, { tag: "战斗", count: 1 }]);
  h.ui({ ...h.state().current!, catalog: h.catalog().slice(1) });
  expect((await h.call("GET", "/stats")).json()).toMatchObject({ undo_depth: 3, agent_undo_depth: 0 });
  const blocked = await h.call("POST", "/undo", {}, "u1");
  expect(blocked.status).toBe(409);
  expect(blocked.json()).toMatchObject({ blocked_by: "ui", top_action: { kind: "catalog_update" } });
  expect(blocked.json().top_action.at).toMatch(/^\d{4}-/);
});

it("P1-5 批量修改：预览、一步撤销、冲突整体拒绝、空筛选需 all", async () => {
  const h = harness(seed());
  const body = { filter: { tag: "歌" }, set: { world: "旧城" }, add_tags: ["已校"], remove_tags: ["战斗"] };
  expect((await h.call("PATCH", "/catalog?dry_run=1", body)).json()).toMatchObject({ matched: 2, will_update: 2 });
  expect(h.catalog()[0].world).toBe("新迦南市");
  const done = await h.call("PATCH", "/catalog", body, "b1");
  expect(done.json()).toMatchObject({ matched: 2, updated: 2 });
  expect(done.audit_ids).toEqual(["a", "b"]);
  expect(h.catalog()[0]).toMatchObject({ world: "旧城", tags: ["歌", "已校"] });
  expect((await h.call("PATCH", "/catalog", body, "b2")).json()).toMatchObject({ matched: 2, updated: 0 });
  expect((await h.call("POST", "/undo", {}, "b3")).status).toBe(200);
  expect(h.catalog()[0]).toMatchObject({ world: "新迦南市", tags: ["战斗", "歌"] });
  expect((await h.call("PATCH", "/catalog", { set: { world: "x" } }, "b4")).status).toBe(422);
  expect((await h.call("PATCH", "/catalog", { filter: { all: true }, set: { title: "x" } }, "b5")).json().error).toContain("title（名称）");
  const h2 = harness([entry("a", "甲"), entry("b", "甲", { world: "别处" })]);
  const clash = await h2.call("PATCH", "/catalog", { filter: { ids: ["b"] }, set: { world: "新迦南市" } }, "b6");
  expect(clash.status).toBe(409);
  expect(clash.json().conflicts).toEqual([{ id: "b", conflict_id: "a" }]);
});

it("P1-6 重名查询；P2-9 按 ids 导出与整库备份", async () => {
  const h = harness([...seed(), entry("d", "夜見 "), entry("e", "夜見")]);
  const groups = (await h.call("GET", "/catalog/duplicates")).json();
  expect(groups.groups).toEqual([expect.objectContaining({ ids: ["a", "d", "e"] })]);
  expect((await h.call("GET", "/catalog/duplicates?by=name")).json().groups[0].ids).toEqual(["a", "e"]);
  const exported = JSON.parse((await h.call("GET", "/catalog/export?ids=c,a")).body).entries.map((row: CatalogEntry) => row.id);
  expect(exported).toEqual(["a", "c"]);
  const backup = await h.call("GET", "/backup");
  expect(backup).toMatchObject({ status: 200, content_type: "application/zip", encoding: "base64", body: "UEsDBA==" });
});

it("P1-7 source/sourceId 可导入导出与 PATCH；未知列保存在 extra 并导出带回", async () => {
  const rows = parseCatalog("名称,类别,等级,标签,说明,来源,来源编号,备注\n道具,物品,,,,08-秘学/目录.md,D-32,手抄", "csv", []);
  expect(rows[0].entry).toMatchObject({ source: "08-秘学/目录.md", sourceId: "D-32", extra: { 备注: "手抄" } });
  expect(rows[0].warnings.join()).toContain("extra：备注");
  const csv = exportCatalog([rows[0].entry!], "csv");
  expect(csv.split("\r\n")[0]).toContain('"来源","来源编号","备注"');
  const back = parseCatalog(csv, "csv", []);
  expect(back[0].entry).toMatchObject({ source: "08-秘学/目录.md", sourceId: "D-32", extra: { 备注: "手抄" } });
  const json = parseCatalog(exportCatalog([rows[0].entry!], "json"), "json", []);
  expect(json[0].entry).toMatchObject({ sourceId: "D-32", extra: { 备注: "手抄" } });
  const h = harness([rows[0].entry!]);
  const id = rows[0].entry!.id;
  expect((await h.call("PATCH", `/catalog/${id}`, { sourceId: "D-33" }, "s")).json()).toMatchObject({ sourceId: "D-33", extra: { 备注: "手抄" } });
  expect((await h.call("PATCH", `/catalog/${id}`, { source: "" }, "s2")).json()).not.toHaveProperty("source");
  expect((await h.call("GET", "/catalog?q=D-33")).json().items[0]).toMatchObject({ sourceId: "D-33" });
  expect(parseCatalog("名称,类别,等级,标签,说明,__proto__\nA,技能,,,,x", "csv", [])[0].entry).not.toHaveProperty("extra");
});
