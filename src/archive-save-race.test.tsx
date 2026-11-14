// @vitest-environment happy-dom
import "fake-indexeddb/auto";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import App from "./App";
import { createCharacter } from "./model";
import { loadLibrary, saveLibrary } from "./storage";

const machine = vi.hoisted(() => ({ bind: vi.fn(), history: null as ReturnType<typeof import("./useLibraryHistory").useLibraryHistory> | null }));
vi.mock("./useLibraryHistory", async (original) => {
  const actual = await original<typeof import("./useLibraryHistory")>();
  return { ...actual, useLibraryHistory: () => {
    const history = actual.useLibraryHistory(); machine.history = history; return history;
  } };
});
vi.mock("./archive-machine", async (original) => ({
  ...await original<typeof import("./archive-machine")>(),
  canOpenLocalFiles: () => true,
  pickArchiveFile: async () => ({ absolutePath: "C:/synthetic/notes.md", name: "notes.md" }),
  bindArchiveParent: machine.bind,
  archiveBindings: async () => [],
  probeArchive: async () => ({ status: "valid", detail: "测试文件" }),
}));
afterEach(() => { cleanup(); vi.clearAllMocks(); });

it("定位文件期间创建世界不会被旧资料覆盖，保留表单供重试且避免重复保存", async () => {
  let resolve!: (path: string) => void;
  machine.bind.mockImplementation(() => new Promise<string>(done => { resolve = done; }));
  await saveLibrary({ schemaVersion: 2, characters: [createCharacter("并发测试")] });
  render(<App />);
  fireEvent.click(await screen.findByRole("button", { name: "世界概览" }));
  const form = screen.getByRole("form", { name: "添加外部档案" });
  fireEvent.change(within(form).getByLabelText("档案标题"), { target: { value: "合成札记" } });
  fireEvent.change(within(form).getByLabelText("根目录名称"), { target: { value: "合成库" } });
  fireEvent.click(within(form).getByRole("button", { name: "选择本机文件" }));
  await screen.findByText(/已选择文件/);
  fireEvent.submit(form);
  await waitFor(() => expect(machine.bind).toHaveBeenCalledTimes(1));
  fireEvent.click(screen.getByRole("button", { name: "新建世界" }));
  fireEvent.change(screen.getByLabelText("世界名称"), { target: { value: "等待期间的新世界" } });
  fireEvent.click(screen.getByRole("button", { name: "保存世界" }));
  await act(async () => resolve("notes.md"));
  await screen.findByRole("button", { name: (name) => name.includes("等待期间的新世界") && !name.startsWith("删除") });
  expect(await screen.findByText(/资料库已变化/)).toBeTruthy();
  expect((within(form).getByLabelText("档案标题") as HTMLInputElement).value).toBe("合成札记");
  fireEvent.submit(form);
  fireEvent.submit(form);
  await waitFor(() => expect(machine.bind).toHaveBeenCalledTimes(2));
  await act(async () => resolve("notes.md"));
  await screen.findByText("已保存档案引用");
  await waitFor(async () => {
    const saved = await loadLibrary();
    expect(saved?.worlds?.map(world => world.name)).toEqual(["等待期间的新世界"]);
    expect(saved?.externalArchives).toHaveLength(1);
    expect(saved?.externalArchives?.[0].title).toBe("合成札记");
  });
});

it("Agent 占用写入锁时不排队提交旧库，离开页面后不再提交迟到的定位结果", async () => {
  let resolve!: (path: string) => void;
  machine.bind.mockImplementation(() => new Promise<string>(done => { resolve = done; }));
  await saveLibrary({ schemaVersion: 2, characters: [createCharacter("锁测试")] });
  render(<App />);
  fireEvent.click(await screen.findByRole("button", { name: "世界概览" }));
  const form = screen.getByRole("form", { name: "添加外部档案" });
  fireEvent.change(within(form).getByLabelText("档案标题"), { target: { value: "稍后保存" } });
  fireEvent.change(within(form).getByLabelText("根目录名称"), { target: { value: "测试库" } });
  fireEvent.click(within(form).getByRole("button", { name: "选择本机文件" }));
  await screen.findByText(/已选择文件/);
  fireEvent.submit(form);
  const release = machine.history!.lock();
  await act(async () => resolve("notes.md"));
  expect(await screen.findByText("资料正在处理，请稍后重试")).toBeTruthy();
  await act(async () => release());
  expect(machine.history!.getState().current?.externalArchives ?? []).toEqual([]);
  fireEvent.submit(form);
  await waitFor(() => expect(machine.bind).toHaveBeenCalledTimes(2));
  fireEvent.click(screen.getByRole("button", { name: /^角色书架/ }));
  await act(async () => resolve("notes.md"));
  expect(machine.history!.getState().current?.externalArchives ?? []).toEqual([]);
});
