// @vitest-environment happy-dom
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Library } from "./model";
import { createCharacter } from "./model";

const native = vi.hoisted(() => ({
  close: undefined as
    undefined | ((event: { preventDefault: () => void }) => Promise<void>),
  destroy: vi.fn(async () => {}),
  load: vi.fn<() => Promise<Library | null>>(),
  save: vi.fn<(library: Library) => Promise<void>>(),
}));
vi.mock("@tauri-apps/api/window", () => ({
  getCurrentWindow: () => ({
    onCloseRequested: async (callback: typeof native.close) => {
      native.close = callback;
      return () => {
        native.close = undefined;
      };
    },
    destroy: native.destroy,
  }),
}));
vi.mock("./storage", () => ({
  desktop: true,
  loadLibrary: native.load,
  saveLibrary: native.save,
  libraryLocation: async () => "C:\\Atlas\\library",
  imageUrl: async () => "",
  downloadBytes: vi.fn(),
  exportBackup: vi.fn(),
  openFolder: vi.fn(),
  parseBackup: vi.fn(),
  putImage: vi.fn(),
  restoreBackup: vi.fn(),
  relocateLibrary: vi.fn(),
}));
import App from "./App";
beforeEach(() => {
  native.destroy.mockClear();
  native.save.mockReset().mockResolvedValue(undefined);
  native.load.mockResolvedValue({
    schemaVersion: 1,
    characters: [createCharacter("本地角色")],
  });
});
afterEach(cleanup);

describe("桌面窗口关闭与待保存资料", () => {
  it("等待队列写入完成，再写入最新资料并关闭窗口", async () => {
    render(<App />);
    await screen.findByRole("button", { name: "已在本地保存" });
    fireEvent.click(screen.getByRole("button", { name: "打开本地角色的档案" }));
    fireEvent.click(screen.getByRole("button", { name: "编辑档案" }));
    const editor = screen.getByRole("region", { name: "编辑角色档案" });
    fireEvent.change(
      within(editor).getByRole("combobox", { name: "正在编辑" }),
      { target: { value: "archive" } },
    );
    let finishSave!: () => void;
    native.save.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          finishSave = resolve;
        }),
    );
    fireEvent.change(within(editor).getByLabelText("姓名"), {
      target: { value: "最后一次修改" },
    });
    await waitFor(() => expect(finishSave).toBeTypeOf("function"));
    const preventDefault = vi.fn();
    const closing = native.close!({ preventDefault });
    expect(preventDefault).toHaveBeenCalledOnce();
    expect(native.destroy).not.toHaveBeenCalled();
    await act(async () => {
      finishSave();
      await closing;
    });
    expect(native.destroy).toHaveBeenCalledOnce();
    const last = native.save.mock.calls.at(-1)![0];
    expect(last.characters[0].versions[0].profile.basics.name).toBe(
      "最后一次修改",
    );
  });

  it("关闭时保存失败，保留窗口并显示失败提示", async () => {
    render(<App />);
    await screen.findByRole("button", { name: "已在本地保存" });
    native.save.mockRejectedValueOnce(new Error("磁盘不可写"));
    const preventDefault = vi.fn();
    await act(async () => {
      await native.close!({ preventDefault });
    });
    expect(preventDefault).toHaveBeenCalledOnce();
    expect(native.destroy).not.toHaveBeenCalled();
    expect(screen.getByRole("status").textContent).toContain(
      "保存失败，窗口保持打开",
    );
  });
});
