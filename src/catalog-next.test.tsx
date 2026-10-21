// @vitest-environment happy-dom
import "fake-indexeddb/auto";
import { useState } from "react";
import { afterEach, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import App from "./App";
import { applyCatalogImport, exportCatalog, parseCatalog } from "./catalog-io";
import { catalogKey } from "./catalog-key";
import { CatalogPanel } from "./components/CatalogPanel";
import { CatalogPicker } from "./components/LibraryPicker";
import { blankProfile, createCharacter, validateLibrary, type CatalogEntry, type Library } from "./model";
import { exportBackup, loadLibrary, parseBackup, saveLibrary } from "./storage";

afterEach(cleanup);
const original: CatalogEntry = { id: "original", title: "京極派唱法（全套）", kind: "skill", rank: "失传", text: "原文", common: false, world: "新迦南市", favorite: true, tags: ["歌"], createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-02T00:00:00Z" };

it("NFKC、全角括号、英文大小写与连续空格统一判重，显示保留原文", () => {
  expect(catalogKey({ ...original, title: "ＡＢＣ　（全套）" })).toBe(catalogKey({ ...original, title: "abc (全套)" }));
  const rows = parseCatalog(JSON.stringify([{ ...original, title: "京極派唱法(全套)", text: "修订内容" }]), "json", [original]);
  expect(rows[0].status).toBe("duplicate");
  expect(rows[0].warnings.join()).toContain("归一");
  const result = applyCatalogImport([original], rows, new Set([1]));
  expect(result[0]).toMatchObject({ id: "original", title: original.title, text: "修订内容" });
});

it("世界区分判重，同名不同类别只警告；通用不等于某个世界", () => {
  const rows = parseCatalog(JSON.stringify([
    { ...original, id: "other", world: "雾港" },
    { ...original, id: "global", world: "" },
    { ...original, id: "spell", kind: "spell" },
  ]), "json", [original]);
  expect(rows.every(row => row.status === "new")).toBe(true);
  expect(rows[2].warnings.join()).toContain("不同类别");
  expect(applyCatalogImport([original], rows, new Set())).toHaveLength(4);
});

it("已有多条归一化同名记录时拒绝盲目覆盖，不改旧库", () => {
  const existing = [original, { ...original, id: "duplicate", title: "京極派唱法(全套)" }];
  const rows = parseCatalog(JSON.stringify([original]), "json", existing);
  expect(rows[0].status).toBe("error");
  expect(rows[0].reason).toContain("多条归一化");
  expect(applyCatalogImport(existing, rows, new Set([1]))).toEqual(existing);
});

it("JSON 未识别字段显式警告，不能偷偷当作别名；空可选项升级提示", () => {
  const rows = parseCatalog(JSON.stringify([{ title: "测试", kind: "skill", 级别: "通", tag: ["x"] }]), "json", []);
  expect(rows[0].warnings).toContain("忽略字段：级别、tag");
  expect(rows[0].attention).toBe(true);
  expect(rows[0].entry?.rank).toBe("");
  expect(rows[0].entry?.tags).toEqual([]);
});

it("表头别名映射、未知列与缺失列均给出具体信息", () => {
  const rows = parseCatalog('名字,类型,级别,tag,内容,作品,备注\n唱法,技能,失传,歌,说明,新迦南市,未知列', "csv", []);
  expect(rows[0].entry).toMatchObject({ title: "唱法", rank: "失传", world: "新迦南市", tags: ["歌"] });
  expect(rows[0].headerNotes.join()).toContain("『名字』按『名称』处理");
  expect(rows[0].headerNotes.join()).toContain("未识别列『备注』，原样保存到 extra");
  expect(rows[0].entry?.extra).toEqual({ 备注: "未知列" });
  expect(rows[0].warnings.join()).toContain("备注");
  expect(() => parseCatalog('名字,类型,内容\nA,技能,说明', "csv", [])).toThrow("缺少列：等级、标签");
  expect(() => parseCatalog('名字,名称,类型,级别,标签,内容', "csv", [])).toThrow("映射后重复列：名称");
  expect(parseCatalog('name,kind,rank,tags,text\nA,spell,III,光,说明', "csv", [])[0].entry?.kind).toBe("spell");
});

it("世界字段随 JSON、六列 CSV 和完整备份往返，旧五列不变", async () => {
  const six = exportCatalog([original], "csv");
  expect(six.split("\r\n")[0]).toContain('"世界"');
  expect(parseCatalog(six, "csv", [])[0].entry?.world).toBe(original.world);
  expect(parseCatalog(exportCatalog([original], "json"), "json", [])[0].entry).toEqual(original);
  expect(exportCatalog([{ ...original, world: undefined }], "csv").split("\r\n")[0]).not.toContain('"世界"');
  expect(parseCatalog('名称,类别,等级,标签,说明\nA,技能,,,说明', "csv", [])[0].entry?.world).toBeUndefined();
  const library: Library = { schemaVersion: 2, characters: [], catalog: [original] };
  expect(parseBackup(await exportBackup(library)).library).toEqual(library);
  expect(parseCatalog(JSON.stringify([{ ...original, world: 3 }]), "json", [])[0].reason).toContain("世界");
  expect(() => validateLibrary({ ...library, catalog: [{ ...original, world: 3 }] })).toThrow("条目世界无效");
});

it("编辑器可以创建不同世界的同名模板并按世界筛选", () => {
  function Harness() {
    const [entries, setEntries] = useState<CatalogEntry[]>([original]);
    return <CatalogPanel entries={entries} onChange={setEntries}/>;
  }
  render(<Harness/>);
  fireEvent.click(screen.getByRole("button", { name: "新建技能模板" }));
  fireEvent.change(screen.getByLabelText("模板名称"), { target: { value: original.title } });
  fireEvent.change(screen.getByLabelText("模板世界／作品"), { target: { value: "雾港" } });
  fireEvent.click(screen.getByRole("button", { name: "保存模板" }));
  expect(screen.getAllByRole("heading", { name: /京極派唱法/ })).toHaveLength(2);
  fireEvent.change(screen.getByLabelText("筛选条目世界"), { target: { value: "world:雾港" } });
  expect(screen.getAllByRole("heading", { name: /京極派唱法/ })).toHaveLength(1);
  fireEvent.change(screen.getByLabelText("筛选条目世界"), { target: { value: "world:" } });
  expect(screen.queryByRole("heading", { name: /京極派唱法/ })).toBeNull();
});

it("添加弹窗可以筛选世界，条目搜索包含世界名", () => {
  render(<CatalogPicker catalog={[original, { ...original, id: "other", title: "另一本书", world: "雾港" }]} mode="skills" profile={blankProfile()} onPatch={() => {}} onClose={() => {}}/>);
  fireEvent.change(screen.getByLabelText("选取条目世界"), { target: { value: "world:雾港" } });
  expect(screen.queryByRole("button", { name: /京極派唱法/ })).toBeNull();
  expect(screen.getByRole("button", { name: /另一本书/ })).toBeTruthy();
});

it.each([3, 7])("真实应用整批导入 %i 条后，一次撤销、重做完整恢复编号、时间戳与角色内容", async (amount) => {
  const character = createCharacter("撤销测试");
  const before: Library = { schemaVersion: 2, characters: [character], catalog: [original] };
  await saveLibrary(before);
  render(<App/>);
  await screen.findByRole("button", { name: "打开撤销测试的档案" });
  fireEvent.click(screen.getByRole("button", { name: /^条目库管理/ }));
  fireEvent.click(screen.getByRole("button", { name: "导入 / 批量快填" }));
  fireEvent.change(screen.getByLabelText("粘贴格式"), { target: { value: "json" } });
  const incoming = Array.from({ length: amount }, (_, i) => ({ ...original, id: `incoming-${i}`, title: i ? `新增条目${i}` : original.title, text: `本次内容${i}` }));
  fireEvent.change(screen.getByLabelText("批量填写内容"), { target: { value: JSON.stringify(incoming) } });
  fireEvent.click(screen.getByRole("button", { name: "解析并预览" }));
  expect(await loadLibrary()).toEqual(before);
  fireEvent.click(screen.getByRole("button", { name: "覆盖全部重名" }));
  fireEvent.click(screen.getByRole("button", { name: `确认导入合法条目（${amount}）` }));
  await waitFor(async () => expect((await loadLibrary())?.catalog).toHaveLength(amount));
  const after = (await loadLibrary())!;
  expect(after.characters).toEqual(before.characters);
  expect(after.catalog![0].id).toBe(original.id);
  fireEvent.click(screen.getByRole("button", { name: "撤销" }));
  expect(screen.getByText(`已撤销本次导入（${amount} 条）。`)).toBeTruthy();
  await waitFor(async () => expect(await loadLibrary()).toEqual(before));
  fireEvent.click(screen.getByRole("button", { name: "重做" }));
  expect(screen.getByText(`已重做本次导入（${amount} 条）。`)).toBeTruthy();
  await waitFor(async () => expect(await loadLibrary()).toEqual(after));
});


it("括号相邻半角、全角与连续空白均判重，存储不改原文", () => {
 const names = ["京極派唱法(全套)", "京極派唱法 （全套）", "京極派唱法  （全套）", "京極派唱法\u3000（全套）", "京極派唱法 （ 全套 ） "];
 for (const title of names) {
   const rows = parseCatalog(JSON.stringify([{...original,title}]),"json",[original]);
   expect(rows[0].status, title).toBe("duplicate");
   const result = applyCatalogImport([original],rows,new Set([1]));
   expect(result[0].title).toBe(original.title);
   expect(result[0].id).toBe(original.id);
 }
 const crossWorld = parseCatalog(JSON.stringify([{...original,title:names[1],world:"雾港来信"},{...original,title:names[1],world:""}]),"json",[original]);
 expect(crossWorld.map(row => row.status)).toEqual(["new","new"]);
});

it("英文词间空格仍有意义，不与连写名称误合并", () => {
 expect(catalogKey({...original,title:"Old  Curiosity Shop"})).toBe(catalogKey({...original,title:"Old Curiosity Shop"}));
 expect(catalogKey({...original,title:"Old Curiosity Shop"})).not.toBe(catalogKey({...original,title:"OldCuriosityShop"}));
 const mixed = [original,{...original,id:"global",world:undefined}];
 const rows = parseCatalog(exportCatalog(mixed,"csv"),"csv",[]);
 expect(rows.map(row => row.entry?.world)).toEqual(["新迦南市",""]);
});
