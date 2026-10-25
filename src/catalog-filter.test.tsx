// @vitest-environment happy-dom
import { afterEach, beforeEach, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { useState } from "react";
import { emptyFilter, filterCatalog, isFiltered, matchesTags, pageItems, paginate, quickTags, readCatalogPrefs, scopeEntries, tagCounts, writeCatalogPrefs } from "./catalog-filter";
import { CatalogPanel } from "./components/CatalogPanel";
import type { CatalogEntry } from "./model";

const entry = (id: string, tags: string[], extra: Partial<CatalogEntry> = {}): CatalogEntry => ({ id, kind: "skill", title: id, text: "", rank: "", common: false, tags, ...extra });
const rows = [entry("a", ["战斗", "近战"]), entry("b", ["战斗", "远程"], { favorite: true }), entry("c", ["探索"], { world: "雾港" }), entry("d", ["战斗"], { kind: "spell" }), entry("e", [])];

it("界面与 Agent 一样可以按来源和来源编号搜索", () => {
  const sourced = [entry("source-entry", [], { source: "规则书", sourceId: "D-33" })];
  expect(filterCatalog(sourced, { ...emptyFilter("skill"), query: "规则书 D-33" }).map(row => row.id)).toEqual(["source-entry"]);
});

it("多标签：任一 / 全部，可与收藏、世界、类别、搜索组合", () => {
  const base = emptyFilter("skill");
  expect(filterCatalog(rows, { ...base, tags: ["近战", "远程"] }).map(r => r.id)).toEqual(["a", "b"]);
  expect(filterCatalog(rows, { ...base, tags: ["战斗", "远程"], tagMode: "all" }).map(r => r.id)).toEqual(["b"]);
  expect(filterCatalog(rows, { ...base, tags: ["战斗"], favorite: true }).map(r => r.id)).toEqual(["b"]);
  expect(filterCatalog(rows, { ...base, world: "world:雾港" }).map(r => r.id)).toEqual(["c"]);
  expect(filterCatalog(rows, { ...base, world: "world:" }).map(r => r.id)).toEqual(["a", "b", "e"]);
  expect(filterCatalog(rows, { ...base, query: "远程" }).map(r => r.id)).toEqual(["b"]);
  expect(filterCatalog(rows, { ...base, sort: "favorite" })[0].id).toBe("b");
  expect(matchesTags(rows[4], [], "all")).toBe(true);
  expect(isFiltered(base)).toBe(false); expect(isFiltered({ ...base, tags: ["x"] })).toBe(true);
});

it("标签计数只统计当前类别和世界；快捷标签固定优先、最多 8 个", () => {
  const counts = tagCounts(scopeEntries(rows, "skill", "all"));
  expect(counts).toEqual([{ tag: "战斗", count: 2 }, { tag: "近战", count: 1 }, { tag: "探索", count: 1 }, { tag: "远程", count: 1 }].sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag, "zh-CN")));
  expect(tagCounts(scopeEntries(rows, "skill", "world:雾港"))).toEqual([{ tag: "探索", count: 1 }]);
  expect(tagCounts([entry("x", ["重复", "重复"])])).toEqual([{ tag: "重复", count: 1 }]);
  const many = Array.from({ length: 12 }, (_, i) => ({ tag: `t${i}`, count: 12 - i }));
  expect(quickTags(many, []).map(t => t.tag)).toEqual(["t0", "t1", "t2", "t3", "t4", "t5", "t6", "t7"]);
  const pinned = quickTags(many, ["t11", "不存在"]);
  expect(pinned[0]).toEqual({ tag: "t11", count: 1, pinned: true }); expect(pinned).toHaveLength(8);
});

it("分页边界：空列表、末页、越界页码被收回", () => {
  expect(paginate(0, 3, 20)).toEqual({ page: 1, pages: 1, start: 0, end: 0, total: 0 });
  expect(paginate(45, 3, 20)).toMatchObject({ page: 3, pages: 3, start: 40, end: 45 });
  expect(paginate(45, 9, 20)).toMatchObject({ page: 3 });
  expect(paginate(45, 0, 20)).toMatchObject({ page: 1 });
  expect(paginate(40, 3, 20)).toMatchObject({ page: 2, start: 20, end: 40 });
  expect(pageItems(1, 1)).toEqual([1]);
  expect(pageItems(5, 10)).toEqual([1, "…", 4, 5, 6, "…", 10]);
  expect(pageItems(2, 4)).toEqual([1, 2, 3, 4]);
});

it("偏好只接受合法每页条数和字符串标签", () => {
  const store = new Map<string, string>();
  const storage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => { store.set(k, v); } };
  expect(readCatalogPrefs(storage)).toEqual({ pageSize: 20, pinned: [] });
  writeCatalogPrefs({ pageSize: 50, pinned: ["战斗"] }, storage);
  expect(readCatalogPrefs(storage)).toEqual({ pageSize: 50, pinned: ["战斗"] });
  store.set("atlas.catalog.prefs", JSON.stringify({ pageSize: 7, pinned: [1, "a"] }));
  expect(readCatalogPrefs(storage)).toEqual({ pageSize: 20, pinned: ["a"] });
  store.set("atlas.catalog.prefs", "{bad");
  expect(readCatalogPrefs(storage).pageSize).toBe(20);
});

beforeEach(() => localStorage.clear());
afterEach(cleanup);
function Harness({ initial }: { initial: CatalogEntry[] }) {
  const [entries, setEntries] = useState(initial);
  return <CatalogPanel entries={entries} onChange={setEntries}/>;
}
const titles = () => screen.queryAllByRole("heading", { level: 4 }).map(h => h.textContent?.trim());
const big = Array.from({ length: 45 }, (_, i) => entry(`条目${String(i + 1).padStart(2, "0")}`, i % 3 ? ["常见"] : ["稀有", "常见"]));

it("界面只渲染当前页；翻页、跳转、筛选回到第 1 页；删除后页码保持有效", () => {
  render(<Harness initial={big}/>);
  expect(titles()).toHaveLength(20);
  expect(screen.getByText("1–20 / 共 45 条")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "末页" }));
  expect(screen.getByText("41–45 / 共 45 条")).toBeTruthy();
  for (let i = 0; i < 5; i++) fireEvent.click(within(screen.getAllByRole("article")[0]).getByRole("button", { name: "删除模板" }));
  expect(screen.getByText("21–40 / 共 40 条")).toBeTruthy();
  fireEvent.change(screen.getByLabelText("跳转页码"), { target: { value: "1" } });
  fireEvent.submit(screen.getByLabelText("跳转页码").closest("form")!);
  expect(screen.getByRole("button", { name: "第 1 页" }).getAttribute("aria-current")).toBe("page");
  fireEvent.keyDown(screen.getByRole("navigation", { name: "条目分页" }), { key: "ArrowRight" });
  expect(screen.getByText("21–40 / 共 40 条")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "快捷标签 稀有" }));
  expect(screen.getByText("1–14 / 共 14 条")).toBeTruthy();
  fireEvent.change(screen.getByLabelText("每页条数"), { target: { value: "50" } });
  expect(JSON.parse(localStorage.getItem("atlas.catalog.prefs")!).pageSize).toBe(50);
});

it("标签选择器：搜索、计数、多选芯片可移除，全部 / 任一切换，固定快捷标签，清除筛选", () => {
  render(<Harness initial={rows}/>);
  fireEvent.click(screen.getByText("选择标签"));
  fireEvent.change(screen.getByLabelText("搜索标签"), { target: { value: "战" } });
  const picker = screen.getByLabelText("搜索标签").closest("div")!;
  expect(within(picker).getAllByRole("checkbox")).toHaveLength(2);
  fireEvent.click(within(picker).getByRole("checkbox", { name: /近战/ }));
  fireEvent.change(screen.getByLabelText("搜索标签"), { target: { value: "" } });
  fireEvent.click(within(picker).getByRole("checkbox", { name: /远程/ }));
  expect(titles()).toEqual(["a", "b"]);
  fireEvent.click(screen.getByRole("button", { name: "全部" }));
  expect(titles()).toEqual([]);
  fireEvent.click(screen.getByRole("button", { name: "移除标签 近战" }));
  expect(titles()).toEqual(["b"]);
  fireEvent.click(within(picker).getByRole("button", { name: "固定为快捷标签 探索" }));
  expect(within(screen.getByRole("group", { name: "常用标签" })).getAllByRole("button")[0].getAttribute("aria-label")).toBe("快捷标签 探索");
  expect(JSON.parse(localStorage.getItem("atlas.catalog.prefs")!).pinned).toEqual(["探索"]);
  fireEvent.click(screen.getByRole("button", { name: "清除筛选" }));
  expect(titles()).toEqual(["a", "b", "c", "e"]);
  expect(screen.queryByRole("group", { name: "已选标签" })).toBeNull();
});
