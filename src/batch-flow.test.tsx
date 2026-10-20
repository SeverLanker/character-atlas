// @vitest-environment happy-dom
import "fake-indexeddb/auto";
import { afterEach, beforeEach, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import App from "./App";
import { createCharacter, type Library } from "./model";
import { loadLibrary, saveLibrary } from "./storage";

afterEach(cleanup);
let library: Library;
beforeEach(async () => {
  const names = ["甲", "乙", "丙", "丁"];
  const chars = names.map((n, i) => {
    const c = createCharacter(n, i < 2 ? "一组" : "二组");
    c.updatedAt = new Date(2026, 0, 10 - i).toISOString(); // 最近更新排序：甲乙丙丁
    return c;
  });
  chars[3].versions[0].profile.relationships = [{ id: "r", title: "旧识", text: "", targetCharacterId: chars[0].id }];
  chars[0].versions[0].secret.enabled = true;
  chars[0].versions[0].secret.overrides = { background: "不能被批量改动的秘密" };
  library = { schemaVersion: 2, characters: chars };
  await saveLibrary(library);
});

async function openShelf() {
  render(<App />);
  await screen.findByRole("button", { name: "打开甲的档案" });
}
const card = (name: string) => screen.getByRole("button", { name: "选择" + name });
const count = () => screen.getByText(/^已选 \d+ \/ \d+ 位$/).textContent;

it("按钮进入多选、Ctrl 单选、Shift 连选、全选、清空、Esc 退出", async () => {
  await openShelf();
  fireEvent.click(screen.getByRole("button", { name: "多选" }));
  expect(screen.getByRole("toolbar", { name: "批量操作" })).toBeTruthy();
  fireEvent.click(card("乙"));
  expect(count()).toBe("已选 1 / 4 位");
  expect(card("乙").getAttribute("aria-pressed")).toBe("true");
  fireEvent.click(card("丁"), { shiftKey: true });
  expect(count()).toBe("已选 3 / 4 位");
  fireEvent.click(card("丙"), { ctrlKey: true });
  expect(count()).toBe("已选 2 / 4 位");
  fireEvent.click(screen.getByRole("button", { name: /全选当前结果/ }));
  expect(count()).toBe("已选 4 / 4 位");
  fireEvent.click(screen.getByRole("button", { name: /清空选择/ }));
  expect(count()).toBe("已选 0 / 4 位");
  fireEvent.keyDown(document, { key: "Escape" });
  expect(screen.queryByRole("toolbar", { name: "批量操作" })).toBeNull();
  expect(screen.getByRole("button", { name: "打开甲的档案" })).toBeTruthy();
});

it("Ctrl/Cmd+点击在普通模式下直接进入多选并选中", async () => {
  await openShelf();
  fireEvent.click(screen.getByRole("button", { name: "打开丙的档案" }), { metaKey: true });
  expect(count()).toBe("已选 1 / 4 位");
});

it("搜索 / 列表布局下选择与可见结果保持一致", async () => {
  await openShelf();
  fireEvent.click(screen.getByRole("button", { name: "列表视图" }));
  fireEvent.click(screen.getByRole("button", { name: "多选" }));
  fireEvent.click(screen.getByRole("button", { name: /全选当前结果/ }));
  fireEvent.change(screen.getByLabelText("搜索角色"), { target: { value: "乙" } });
  await waitFor(() => expect(count()).toBe("已选 1 / 1 位"));
  fireEvent.change(screen.getByLabelText("搜索角色"), { target: { value: "" } });
  await waitFor(() => expect(count()).toBe("已选 1 / 4 位"));
});

it("批量收藏、移到新分组，各为撤销栈一步，秘密数据不变", async () => {
  await openShelf();
  fireEvent.click(screen.getByRole("button", { name: "多选" }));
  fireEvent.click(card("甲"));
  fireEvent.click(card("丙"));
  fireEvent.click(screen.getByRole("button", { name: /^收藏$/ }));
  fireEvent.click(screen.getByRole("button", { name: /移到分组/ }));
  const dialog = screen.getByRole("dialog", { name: /移动所选 2 位角色到分组/ });
  fireEvent.change(within(dialog).getByRole("combobox"), { target: { value: "新的分组" } });
  expect(within(dialog).getByText("将新建分组「新的分组」。")).toBeTruthy();
  fireEvent.click(within(dialog).getByRole("button", { name: "移动" }));
  await waitFor(async () => {
    const saved = (await loadLibrary())!;
    expect(saved.characters.filter((c) => c.collection === "新的分组").map((c) => c.name).sort()).toEqual(["丙", "甲"]);
    expect(saved.characters.filter((c) => c.favorite).map((c) => c.name).sort()).toEqual(["丙", "甲"]);
    expect(saved.characters[0].versions[0].secret.overrides.background).toBe("不能被批量改动的秘密");
  });
  fireEvent.click(screen.getByRole("button", { name: "撤销修改" }));
  await waitFor(async () => expect((await loadLibrary())!.characters.some((c) => c.collection === "新的分组")).toBe(false));
  expect((await loadLibrary())!.characters.filter((c) => c.favorite)).toHaveLength(2);
});

it("删除：确认框列出数量、名字与受影响关系；取消不删；确认后一步撤销 / 重做", async () => {
  await openShelf();
  fireEvent.click(screen.getByRole("button", { name: "多选" }));
  fireEvent.click(card("甲"));
  fireEvent.click(card("乙"));
  fireEvent.click(screen.getByRole("button", { name: /^删除$/ }));
  let dialog = screen.getByRole("dialog", { name: "删除所选的 2 位角色？" });
  expect(dialog.textContent).toContain("“甲”、“乙”");
  expect(dialog.textContent).toContain("1 条关系");
  fireEvent.click(within(dialog).getByRole("button", { name: "取消" }));
  expect(screen.queryByRole("dialog")).toBeNull();
  expect((await loadLibrary())!.characters).toHaveLength(4);

  fireEvent.click(screen.getByRole("button", { name: /^删除$/ }));
  dialog = screen.getByRole("dialog", { name: "删除所选的 2 位角色？" });
  fireEvent.click(within(dialog).getByRole("button", { name: "删除 2 位角色" }));
  await waitFor(async () => expect((await loadLibrary())!.characters.map((c) => c.name)).toEqual(["丙", "丁"]));
  const kept = (await loadLibrary())!.characters[1].versions[0].profile.relationships[0];
  expect(kept.title).toBe("旧识");
  fireEvent.click(screen.getByRole("button", { name: "撤销修改" }));
  await waitFor(async () => expect((await loadLibrary())!.characters).toHaveLength(4));
  fireEvent.click(screen.getByRole("button", { name: "重做修改" }));
  await waitFor(async () => expect((await loadLibrary())!.characters).toHaveLength(2));
});

it("导出所选 Markdown 打开整库同款选项，标题显示所选数量", async () => {
  await openShelf();
  fireEvent.click(screen.getByRole("button", { name: "多选" }));
  fireEvent.click(card("丙"));
  fireEvent.click(screen.getByRole("button", { name: /导出 Markdown/ }));
  const dialog = screen.getByRole("dialog", { name: "导出所选 1 位角色为 Markdown" });
  expect(within(dialog).getByLabelText("包含秘密身份")).toHaveProperty("checked", false);
  expect(within(dialog).getByText("关联角色链接")).toBeTruthy();
});
