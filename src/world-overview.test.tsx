// @vitest-environment happy-dom
import "fake-indexeddb/auto";
import { afterEach, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import App from "./App";
import { createCharacter } from "./model";
import { loadLibrary, saveLibrary } from "./storage";

afterEach(cleanup);

it("世界概览保留分组，同名不合并，公开范围不渲染私有标题和路径", async () => {
  const first = createCharacter("甲", "雾港");
  const second = createCharacter("乙", "雾港");
  const third = createCharacter("丙", "");
  await saveLibrary({ schemaVersion: 2, characters: [first, second, third] });
  render(<App />);
  await screen.findByRole("button", { name: "创建角色" });
  expect(screen.getByRole("button", { name: /雾港/ })).toBeTruthy();
  expect(screen.getByRole("button", { name: /未分类/ })).toBeTruthy();
  const user = userEvent.setup();
  screen.getByRole("button", { name: "世界概览" }).focus();
  await user.keyboard("{Enter}");
  const overview = await screen.findByRole("region", { name: "世界概览" });
  expect(within(overview).getByText(/不会按分组名称自动生成世界/)).toBeTruthy();
  expect(within(overview).getByRole("button", { name: "打开档案：甲" })).toBeTruthy();
  expect(within(overview).getByRole("button", { name: "打开档案：乙" })).toBeTruthy();
  expect(within(overview).getByRole("button", { name: "打开档案：丙" })).toBeTruthy();
  expect(within(overview).getByText(/网页预览不能打开/)).toBeTruthy();

  async function addWorld(name: string, visibility: "private" | "public") {
    const before = within(overview).queryAllByRole("button", { name: new RegExp(name) }).length;
    fireEvent.click(within(overview).getByRole("button", { name: "新建世界" }));
    fireEvent.change(within(overview).getByLabelText("世界名称"), { target: { value: name } });
    fireEvent.change(within(overview).getByLabelText("世界公开范围"), { target: { value: visibility } });
    fireEvent.click(within(overview).getByRole("button", { name: "保存世界" }));
    await waitFor(() => expect(within(overview).getAllByRole("button", { name: new RegExp(name) })).toHaveLength(before + 1));
  }
  await addWorld("重名", "private");
  await addWorld("重名", "private");
  expect(within(overview).getAllByRole("button", { name: /重名/ })).toHaveLength(2);
  fireEvent.click(within(overview).getAllByRole("button", { name: /重名/ })[0]);
  expect(await within(overview).findByText("这个世界还没有编入角色，也没有外部档案。")).toBeTruthy();
  fireEvent.change(within(overview).getByLabelText("选择要编入的角色"), { target: { value: first.id } });
  fireEvent.click(within(overview).getByRole("button", { name: "编入此世界" }));
  expect(await within(overview).findByText("分组：雾港")).toBeTruthy();
  expect(within(overview).getByText("1 个剧情版本：初始设定")).toBeTruthy();
  expect(within(overview).queryByRole("button", { name: "打开档案：乙" })).toBeNull();
  fireEvent.click(within(overview).getByRole("button", { name: "返回世界列表" }));
  expect(within(overview).getByRole("button", { name: "打开档案：乙" })).toBeTruthy();
  expect(within(overview).queryByRole("button", { name: "打开档案：甲" })).toBeNull();

  await addWorld("公开港", "public");
  fireEvent.click(within(overview).getByRole("button", { name: "公开港" }));
  async function addArchive(title: string, path: string, visibility: "private" | "public", note: string, rootLabel?: string) {
    fireEvent.change(within(overview).getByLabelText("档案标题"), { target: { value: title } });
    if (rootLabel) fireEvent.change(within(overview).getByLabelText("根目录名称"), { target: { value: rootLabel } });
    else {
      const roots = within(overview).getByLabelText("已有根目录");
      fireEvent.change(roots, { target: { value: (within(roots).getAllByRole("option")[1] as HTMLOptionElement).value } });
    }
    fireEvent.change(within(overview).getByLabelText("相对路径"), { target: { value: path } });
    fireEvent.change(within(overview).getByLabelText("来源附注"), { target: { value: note } });
    fireEvent.change(within(overview).getByLabelText("档案公开范围"), { target: { value: visibility } });
    fireEvent.click(within(overview).getByRole("button", { name: "保存档案引用" }));
    await waitFor(() => expect(within(overview).getByRole("heading", { name: title })).toBeTruthy());
  }
  await addArchive("私有札记", "vault/only-private.md", "private", "路径附注不要出现", "合成库");
  await addArchive("公开札记", "public/note.md", "public", "维护附注不要出现");
  expect(within(overview).getByRole("heading", { name: "私有札记" })).toBeTruthy();
  expect(within(overview).getByText("相对路径：vault/only-private.md")).toBeTruthy();
  expect(within(overview).getAllByText("正文留在原文件里，资料库不保存副本。")).toHaveLength(2);
  await waitFor(async () => {
    const stored = await loadLibrary();
    expect(stored?.characters.find((character) => character.id === first.id)?.collection).toBe("雾港");
    expect(stored?.externalArchives?.some((ref) => ref.relativePath === "vault/only-private.md" && !("text" in ref))).toBe(true);
    expect(stored?.worlds?.filter((world) => world.name === "重名")).toHaveLength(2);
  });

  fireEvent.click(within(overview).getByRole("button", { name: "公开范围" }));
  expect(within(overview).queryByRole("heading", { name: "私有札记" })).toBeNull();
  expect(within(overview).queryByText(/vault\/only-private\.md/)).toBeNull();
  expect(within(overview).queryByText("路径附注不要出现")).toBeNull();
  expect(within(overview).getByRole("heading", { name: "公开札记" })).toBeTruthy();
  expect(within(overview).queryByText(/public\/note\.md/)).toBeNull();
  expect(within(overview).queryByText("维护附注不要出现")).toBeNull();
  fireEvent.click(within(overview).getByRole("button", { name: "返回世界列表" }));
  expect(within(overview).queryByRole("button", { name: /重名/ })).toBeNull();
  expect(within(overview).getByRole("button", { name: "公开港" })).toBeTruthy();
  expect(screen.getByRole("button", { name: /雾港/ })).toBeTruthy();
});
