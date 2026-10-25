// @vitest-environment happy-dom
import { useState } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, renderHook, screen } from "@testing-library/react";
import { CatalogPanel } from "./components/CatalogPanel";
import { CATALOG_DRAFT_KEY, catalogDraftNeedsAttention, useCatalogDraft } from "./hooks/useCatalogDraft";
import type { CatalogEntry } from "./model";
const entry = (id: string): CatalogEntry => ({ id, title: id, kind: "skill", text: "", rank: "", common: false });
beforeEach(() => localStorage.clear());
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
function Harness({ initial = [] }: { initial?: CatalogEntry[] }) { const [entries, setEntries] = useState(initial); return <CatalogPanel entries={entries} onChange={setEntries}/>; }
it("离开页面后恢复草稿，保存前不改条目库，保存后清理草稿", () => {
  const change = vi.fn(), view = render(<CatalogPanel entries={[]} onChange={change}/>);
  fireEvent.click(screen.getByRole("button", { name: "新建技能模板" }));
  fireEvent.change(screen.getByLabelText("模板名称"), { target: { value: "草稿甲" } });
  fireEvent.change(screen.getByLabelText("模板内容"), { target: { value: "未写完的长说明" } });
  expect(change).not.toHaveBeenCalled(); view.unmount();
  render(<CatalogPanel entries={[]} onChange={change}/>);
  fireEvent.click(screen.getByRole("button", { name: "恢复草稿" }));
  expect((screen.getByLabelText("模板内容") as HTMLTextAreaElement).value).toBe("未写完的长说明");
  fireEvent.click(screen.getByRole("button", { name: "保存模板" }));
  expect(change.mock.calls[0][0][0].title).toBe("草稿甲"); expect(localStorage.getItem(CATALOG_DRAFT_KEY)).toBeNull();
});
it("Agent 改了原模板后不能用旧草稿覆盖，可以另存为新模板", () => {
  const original = entry("a"), change = vi.fn(), view = render(<CatalogPanel entries={[original]} onChange={change}/>);
  fireEvent.click(screen.getByRole("button", { name: "编辑模板" }));
  fireEvent.change(screen.getByLabelText("模板内容"), { target: { value: "草稿修改" } });
  view.rerender(<CatalogPanel entries={[{ ...original, text: "Agent 修改" }]} onChange={change}/>);
  fireEvent.click(screen.getByRole("button", { name: "保存模板" }));
  expect(change).not.toHaveBeenCalled(); expect(screen.getByRole("alert").textContent).toContain("不能覆盖");
  fireEvent.click(screen.getByRole("button", { name: "另存为新模板" }));
  fireEvent.click(screen.getByRole("button", { name: "保存模板" }));
  expect(change.mock.calls[0][0][0].text).toBe("Agent 修改"); expect(change.mock.calls[0][0][1].text).toBe("草稿修改");
});
it("保存后定位到模板所在页，不被旧搜索条件藏起来", () => {
  render(<Harness initial={Array.from({ length: 45 }, (_, i) => entry(`t${String(i).padStart(2, "0")}`))}/>);
  fireEvent.click(screen.getByRole("button", { name: "新建技能模板" }));
  fireEvent.change(screen.getByLabelText("模板名称"), { target: { value: "z" } });
  fireEvent.click(screen.getByRole("button", { name: "保存模板" }));
  expect(screen.getByText("41–46 / 共 46 条")).toBeTruthy(); expect(screen.getByRole("heading", { name: "z" })).toBeTruthy();
});
it("本机存储写入失败时保留内存草稿并阻挡关闭，取消后解除", () => {
  vi.stubGlobal("localStorage", { getItem: () => null, setItem: () => { throw Error("full"); }, removeItem: () => {} });
  const hook = renderHook(() => useCatalogDraft([]));
  act(() => hook.result.current.setDraft(entry("draft")));
  expect(catalogDraftNeedsAttention()).toBe(true); expect(hook.result.current.draftError).toContain("内存");
  hook.unmount(); vi.unstubAllGlobals();
  const second = renderHook(() => useCatalogDraft([])); expect(second.result.current.pending?.entry.id).toBe("draft");
  act(() => second.result.current.setDraft(null)); expect(catalogDraftNeedsAttention()).toBe(false);
});
