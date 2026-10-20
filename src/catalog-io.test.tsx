// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { applyCatalogImport, exportCatalog, parseCatalog } from "./catalog-io";
import { CatalogTransfer } from "./components/CatalogTransfer";
import { validateLibrary, type CatalogEntry } from "./model";

afterEach(cleanup);
const existing: CatalogEntry[] = [{ id: "old", title: "修复", kind: "skill", rank: "熟练", text: "原内容", common: true, favorite: true, tags: ["旧书"], createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-02T00:00:00Z" }];
const csv = '名称,类别,等级,标签,说明\r\n修复,技能,失传,"文献、书,手艺","第一行\n第二行，含逗号,和""引号"""\r\n怀表,物品,神器,纪念,停走\r\n,技能,,,缺名\r\n错误类别,武器,,,错误';

it("CSV 支持 BOM、多行、引号与标签分隔，并逐条给错误理由", () => {
  const rows = parseCatalog("\uFEFF" + csv, "csv", existing);
  expect(rows.map(row => row.status)).toEqual(["duplicate", "new", "error", "error"]);
  expect(rows[0].entry).toMatchObject({ rank: "失传", tags: ["文献", "书", "手艺"], text: '第一行\n第二行，含逗号,和"引号"' });
  expect(rows[2].reason).toContain("名称"); expect(rows[3].reason).toContain("类别");
  expect(existing[0].text).toBe("原内容");
});

it("同类同名默认跳过，覆盖保留 id、创建时间与收藏，坏条不入库", () => {
  const rows = parseCatalog(csv, "csv", existing);
  const skipped = applyCatalogImport(existing, rows, new Set());
  expect(skipped).toHaveLength(2); expect(skipped[0].text).toBe("原内容");
  const merged = applyCatalogImport(existing, rows, new Set([2]), "2026-10-20T00:00:00Z");
  expect(merged[0]).toMatchObject({ id: "old", rank: "失传", common: true, favorite: true, createdAt: existing[0].createdAt, updatedAt: "2026-10-20T00:00:00Z" });
  expect(() => validateLibrary({ schemaVersion: 2, characters: [], catalog: merged })).not.toThrow();
});

it("中文 JSON 样本格式与英文完整导出均可导入", () => {
  const rows = parseCatalog(JSON.stringify({ schemaVersion: 1, entries: [{ 名称: "唱法", 类别: "技能", 等级: "失传", 标签: ["歌"], 说明: "说明\n第二行" }] }), "json", []);
  expect(rows[0].entry?.kind).toBe("skill");
  const roundtrip = applyCatalogImport([], parseCatalog(exportCatalog(existing, "json"), "json", []), new Set());
  expect(roundtrip).toEqual(existing);
});

it("CSV 仅五列并保留换行，回灌结果兼容完整库校验", () => {
  const content = exportCatalog([{ ...existing[0], text: '多行\n含"引号",逗号' }], "csv");
  expect(content.split("\r\n")[0]).toBe('\uFEFF"名称","类别","等级","标签","说明"');
  const rows = parseCatalog(content, "csv", []);
  expect(rows[0].entry?.text).toBe('多行\n含"引号",逗号');
  expect(rows[0].status).toBe("new");
});

it("文件内重名按类别名称识别，可覆盖或跳过，冲突 id 自动重建", () => {
  const rows = parseCatalog(JSON.stringify([
    { 名称: "修复", 类别: "物品", id: "old" },
    { 名称: "修复", 类别: "物品", 说明: "后来的说明" },
    { 名称: " 修复 ", 类别: "技能" },
  ]), "json", existing);
  expect(rows.map(row => row.status)).toEqual(["new", "duplicate", "duplicate"]);
  const result = applyCatalogImport(existing, rows, new Set([2]));
  expect(result).toHaveLength(2); expect(result[1].id).not.toBe("old"); expect(result[1].text).toBe("后来的说明");
});

it("错误字段逐条隔离，不把不合法内容写入 catalog", () => {
  const rows = parseCatalog(JSON.stringify([
    null, { 名称: 3, 类别: "技能" }, { 名称: "A", 类别: "技能", 等级: 2 },
    { 名称: "B", 类别: "技能", 标签: "标签" }, { 名称: "C", 类别: "技能", favorite: "true" },
    { 名称: "D", 类别: "技能", createdAt: "bad" }, { 名称: "E", 类别: "技能", 标签: ["a".repeat(101)] },
    { 名称: "正常", 类别: "法术" },
  ]), "json", []);
  expect(rows.filter(row => row.status === "error")).toHaveLength(7);
  expect(rows.every(row => !!row.reason)).toBe(true);
  expect(applyCatalogImport([], rows, new Set())).toHaveLength(1);
});

it("损坏 CSV、缺表头和无效 JSON 在预览阶段拒绝", () => {
  expect(() => parseCatalog('名称,类别,等级,标签,说明\n"未闭合', "csv", [])).toThrow("引号未闭合");
  expect(() => parseCatalog('名称,类别\nA,技能', "csv", [])).toThrow("表头");
  expect(() => parseCatalog('{', "json", [])).toThrow("JSON 语法");
  expect(parseCatalog('名称,类别,等级,标签,说明\nA,技能,,,说明,额外列\nB,技能,,,正常', "csv", []).map(row => row.status)).toEqual(["error", "new"]);
});

it("Tab 粘贴支持批量填写", () => {
  expect(parseCatalog('名称\t类别\t等级\t标签\t说明\nA\t专长\t专家\t旧书、手艺\t说明', "tsv", [])[0].entry).toMatchObject({ kind: "specialty", rank: "专家" });
});

it("解析预览不落库，确认才写入合法条目", () => {
  const onChange = vi.fn();
  render(<CatalogTransfer entries={existing} kind="skill" onChange={onChange}/>);
  fireEvent.click(screen.getByRole("button", { name: "导入 / 批量快填" }));
  fireEvent.change(screen.getByLabelText("批量填写内容"), { target: { value: csv } });
  fireEvent.click(screen.getByRole("button", { name: "解析并预览" }));
  expect(screen.getByText("共 4 条：新增 1 / 重名 1 / 错误 2")).toBeTruthy();
  expect(onChange).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "确认导入合法条目（1）" }));
  expect(onChange).toHaveBeenCalledOnce(); expect(onChange.mock.calls[0][0]).toHaveLength(2);
});

it("预览后资料变化必须重新解析，取消不写入", () => {
  const onChange = vi.fn();
  const { rerender } = render(<CatalogTransfer entries={existing} kind="skill" onChange={onChange}/>);
  fireEvent.click(screen.getByRole("button", { name: "导入 / 批量快填" }));
  fireEvent.change(screen.getByLabelText("批量填写内容"), { target: { value: csv } });
  fireEvent.click(screen.getByRole("button", { name: "解析并预览" }));
  rerender(<CatalogTransfer entries={[]} kind="skill" onChange={onChange}/>);
  expect((screen.getByRole("button", { name: "确认导入合法条目（1）" }) as HTMLButtonElement).disabled).toBe(true);
  fireEvent.click(screen.getByRole("button", { name: "取消" }));
  expect(onChange).not.toHaveBeenCalled();
});

it("显式 null 不是合法字符串或标签数组，不能悄悄转为空值", () => {
 const rows = parseCatalog(JSON.stringify([{名称:"A",类别:"技能",等级:null},{名称:"B",类别:"技能",说明:null},{名称:"C",类别:"技能",标签:null}]),"json",[]);
 expect(rows.every(row => row.status === "error")).toBe(true);
});
