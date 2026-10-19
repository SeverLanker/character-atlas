// @vitest-environment happy-dom
import "fake-indexeddb/auto";
import { afterEach, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import App from "./App";
import { loadLibrary, saveLibrary } from "./storage";
afterEach(cleanup);

it("无角色也能进入独立管理页并保存模板，切回书架不会停留在管理页", async () => {
  await saveLibrary({ schemaVersion: 2, characters: [] });
  render(<App />);
  fireEvent.click(await screen.findByRole("button", { name: /条目库管理/ }));
  expect(screen.getByRole("heading", { name: "条目库管理" })).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "物品" }));
  fireEvent.click(screen.getByRole("button", { name: "新建物品模板" }));
  fireEvent.change(screen.getByLabelText("模板名称"), { target: { value: "旅人罗盘" } });
  fireEvent.click(screen.getByRole("button", { name: "保存模板" }));
  await waitFor(async () => expect((await loadLibrary())!.catalog?.[0].title).toBe("旅人罗盘"));
  expect(screen.queryByRole("button", { name: "添加到当前版本" })).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: /角色书架/ }));
  expect(screen.queryByRole("heading", { name: "条目库管理" })).toBeNull();
});
