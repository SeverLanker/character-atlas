// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { CatalogPicker, LibraryPicker } from "./components/LibraryPicker";
import { blankProfile, type CatalogEntry } from "./model";

afterEach(cleanup);
const catalog: CatalogEntry[] = [
  { id: "skill", kind: "skill", title: "修复", text: "修补旧书", rank: "熟练", common: false },
  { id: "specialty", kind: "specialty", title: "辨识墨迹", text: "比较纸上的墨迹", rank: "专家", common: true },
  { id: "item", kind: "item", title: "旧怀表", text: "一只停走的怀表", rank: "", common: false },
];

it("专长从分类库搜索、预览后复制为独立记录", () => {
  const onPatch = vi.fn(), onClose = vi.fn();
  render(<CatalogPicker mode="skills" catalog={catalog} profile={blankProfile()} onPatch={onPatch} onClose={onClose}/>);
  fireEvent.click(screen.getByRole("button", { name: "专长" }));
  fireEvent.change(screen.getByLabelText("搜索库中条目"), { target: { value: "墨迹 专家" } });
  fireEvent.click(screen.getByRole("button", { name: "辨识墨迹 专家" }));
  expect(screen.getByLabelText("条目预览").textContent).toContain("比较纸上的墨迹");
  expect(onPatch).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "添加选中条目" }));
  const added = onPatch.mock.calls[0][0].skills.at(-1);
  expect(added).toMatchObject({ title: "辨识墨迹", kind: "specialty", rank: "专家", common: true });
  expect(added.id).not.toBe("specialty");
  expect(onClose).toHaveBeenCalledOnce();
});

it("物品库只展示物品，并阻止重复添加", () => {
  const profile = blankProfile();
  profile.items = [{ id: "existing", title: "旧怀表", text: "个人记录", image: "" }];
  render(<CatalogPicker mode="items" catalog={catalog} profile={profile} onPatch={vi.fn()} onClose={vi.fn()}/>);
  expect(screen.queryByRole("button", { name: /修复/ })).toBeNull();
  expect((screen.getByRole("button", { name: "旧怀表 已添加" }) as HTMLButtonElement).disabled).toBe(true);
});

it("空物品库仍可创建自定义记录", () => {
  const onPatch = vi.fn();
  render(<CatalogPicker mode="items" catalog={[]} profile={blankProfile()} onPatch={onPatch} onClose={vi.fn()}/>);
  fireEvent.click(screen.getByRole("button", { name: "新建自定义记录" }));
  expect(onPatch.mock.calls[0][0].items.at(-1)).toMatchObject({ title: "", text: "", image: "" });
});

it("取消与 Escape 不添加条目且不触发外层 Escape", () => {
  const onAdd = vi.fn(), onClose = vi.fn(), outer = vi.fn();
  render(<div onKeyDown={outer}><LibraryPicker title="选取" entries={[]} onAdd={onAdd} onCustom={vi.fn()} onClose={onClose}/></div>);
  fireEvent.keyDown(screen.getByLabelText("搜索库中条目"), { key: "Escape" });
  expect(onClose).toHaveBeenCalledOnce();
  expect(outer).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "取消" }));
  expect(onAdd).not.toHaveBeenCalled();
});

