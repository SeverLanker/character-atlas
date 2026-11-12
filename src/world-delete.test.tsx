// @vitest-environment happy-dom
import "fake-indexeddb/auto";
import { afterEach, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import App from "./App";
import { createArchiveRef, createArchiveRoot, withArchive, withRoot } from "./external-archives";
import { createCharacter, migrateLibrary } from "./model";
import { loadLibrary, saveLibrary } from "./storage";
import { assignCharacterWorld, createWorld, withWorld, withWorldLink } from "./worlds";

afterEach(cleanup);

const opensWorld = (fragment: string) => (name: string) => name.includes(fragment) && !name.startsWith("删除");

it("二次确认后删除世界和档案引用，撤销可恢复，公开范围不留下私有标题或路径", async () => {
  const role = createCharacter("甲", "雾港");
  const other = createCharacter("乙", "别组");
  let library = migrateLibrary({ schemaVersion: 2, characters: [role, other] });
  const hidden = createWorld("秘名世界", "秘密简介", "private");
  const shown = createWorld("公开港", "公开简介", "public");
  library = withWorld(withWorld(library, hidden), shown);
  library = withWorldLink(library, shown.id, hidden.id, "跨世界附注");
  library = assignCharacterWorld(library, role.id, hidden.id);
  const root = createArchiveRoot("合成库");
  library = withRoot(library, root);
  library = withArchive(library, createArchiveRef({
    title: "私有札记", rootId: root.id, relativePath: "vault/only-private.md", worldId: hidden.id, visibility: "private", note: "路径附注不要出现",
  }));
  await saveLibrary(library);
  render(<App />);
  await screen.findByRole("button", { name: "创建角色" });
  fireEvent.click(screen.getByRole("button", { name: "世界概览" }));
  const overview = await screen.findByRole("region", { name: "世界概览" });
  fireEvent.click(within(overview).getByRole("button", { name: opensWorld("秘名世界") }));
  fireEvent.click(await within(overview).findByRole("button", { name: /删除此世界/ }));
  const dialog = await screen.findByRole("dialog", { name: "删除这个世界？" });
  expect(within(dialog).getByText(/不会删除原文件/)).toBeTruthy();
  fireEvent.click(within(dialog).getByRole("button", { name: "取消" }));
  expect(within(overview).getByRole("button", { name: /删除此世界/ })).toBeTruthy();
  fireEvent.click(within(overview).getByRole("button", { name: /删除此世界/ }));
  fireEvent.click(within(await screen.findByRole("dialog", { name: "删除这个世界？" })).getByRole("button", { name: "确认删除" }));
  expect(await within(overview).findByText(/已删除世界/)).toBeTruthy();
  expect(within(overview).getByText(/已删除世界/).textContent).not.toContain("秘名世界");
  expect(within(overview).getByText("这个世界不在当前范围内。")).toBeTruthy();
  fireEvent.click(within(overview).getByRole("button", { name: "返回世界列表" }));
  expect(within(overview).queryByRole("button", { name: opensWorld("秘名世界") })).toBeNull();
  expect(within(overview).getByText("分组：雾港")).toBeTruthy();
  expect(within(overview).getByRole("heading", { name: "私有札记" })).toBeTruthy();
  expect(within(overview).getByText("相对路径：vault/only-private.md")).toBeTruthy();
  expect(within(overview).queryByText(/跨世界附注/)).toBeNull();
  fireEvent.click(within(overview).getByRole("button", { name: opensWorld("公开港") }));
  expect(within(overview).queryByText(/秘名世界/)).toBeNull();
  fireEvent.click(within(overview).getByRole("button", { name: "返回世界列表" }));
  fireEvent.click(within(overview).getByRole("button", { name: "公开范围" }));
  expect(overview.textContent).not.toContain("秘名世界");
  expect(overview.textContent).not.toContain("vault/only-private.md");
  expect(overview.textContent).not.toContain("私有札记");
  expect(overview.textContent).not.toContain("路径附注不要出现");
  expect(within(overview).queryByRole("button", { name: /删除/ })).toBeNull();
  fireEvent.click(within(overview).getByRole("button", { name: "返回自己的视图" }));
  fireEvent.click(within(overview).getByRole("button", { name: "撤销" }));
  expect(await within(overview).findByRole("button", { name: opensWorld("秘名世界") })).toBeTruthy();
  fireEvent.click(within(overview).getByRole("button", { name: opensWorld("秘名世界") }));
  expect(await within(overview).findByText("分组：雾港")).toBeTruthy();
  expect(within(overview).getByRole("heading", { name: "私有札记" })).toBeTruthy();
  fireEvent.click(within(overview).getByRole("button", { name: /删除引用/ }));
  const archiveDialog = await screen.findByRole("dialog", { name: "删除这条档案引用？" });
  expect(within(archiveDialog).getByText(/不会删除 Obsidian 或本机上的原文件/)).toBeTruthy();
  expect(archiveDialog.textContent).not.toContain("vault/only-private.md");
  fireEvent.click(within(archiveDialog).getByRole("button", { name: "确认删除" }));
  expect(await within(overview).findByText(/已删除档案引用/)).toBeTruthy();
  expect(within(overview).queryByRole("heading", { name: "私有札记" })).toBeNull();
  expect(within(overview).queryByText(/vault\/only-private\.md/)).toBeNull();
  expect(within(overview).getByText(/已删除档案引用/).textContent).not.toContain("私有札记");
  fireEvent.click(within(overview).getByRole("button", { name: "撤销" }));
  expect(await within(overview).findByRole("heading", { name: "私有札记" })).toBeTruthy();
  await waitFor(async () => {
    const stored = await loadLibrary();
    const person = stored?.characters.find((character) => character.id === role.id);
    expect(person?.collection).toBe("雾港");
    expect(person?.worldId).toBe(hidden.id);
    expect(stored?.worlds?.some((world) => world.name === "秘名世界")).toBe(true);
    expect(stored?.externalArchives?.some((item) => item.relativePath === "vault/only-private.md")).toBe(true);
    expect(JSON.stringify(stored)).not.toContain("absolutePath");
  }, { timeout: 3000 });
  expect(screen.getByRole("button", { name: /雾港/ })).toBeTruthy();
});
