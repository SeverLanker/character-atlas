// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { createCharacter } from "./model";
const invoke = vi.hoisted(() => vi.fn());
vi.mock("@tauri-apps/api/core", () => ({ isTauri: () => true, invoke }));
import { RecoveryPanel } from "./components/RecoveryPanel";

afterEach(() => { cleanup(); invoke.mockReset(); });
it("桌面备份先只读预览；明确确认且保存原件成功后才恢复", async () => {
  const library = { schemaVersion: 2, characters: [createCharacter("历史角色")] };
  invoke.mockImplementation(async (cmd: string) => {
    if (cmd === "list_snapshots") return [{ id: "library-100.sqlite", createdAt: 100, characters: 1, versions: 1 }, { id: "library-200.sqlite", createdAt: 200, error: "损坏" }];
    if (cmd === "read_snapshot" || cmd === "load_library") return JSON.stringify(library);
    if (cmd === "save_backup") return true;
    throw Error(cmd);
  });
  const apply = vi.fn(); render(<RecoveryPanel onApply={apply}/>);
  fireEvent.click(await screen.findByText("历史备份（2）"));
  expect(screen.getByText("1 个角色 · 1 个版本")).toBeTruthy();
  const previews = screen.getAllByRole("button", { name: "预览恢复" });
  expect((previews[1] as HTMLButtonElement).disabled).toBe(true);
  fireEvent.click(previews[0]);
  await screen.findByText("恢复预览：1 个角色");
  expect(apply).not.toHaveBeenCalled(); expect(invoke.mock.calls.some(([cmd]) => cmd === "save_backup")).toBe(false);
  fireEvent.click(screen.getByRole("button", { name: "保留原件并应用此方案" }));
  await waitFor(() => expect(apply).toHaveBeenCalledWith(library));
  expect(invoke.mock.calls.findIndex(([cmd]) => cmd === "save_backup")).toBeGreaterThan(-1);
});
it("取消保存原件时保留当前资料，不能应用历史备份", async () => {
  const library = { schemaVersion: 2, characters: [] };
  invoke.mockImplementation(async (cmd: string) => cmd === "list_snapshots" ? [{ id: "library-100.sqlite", createdAt: 100 }] : cmd === "save_backup" ? false : JSON.stringify(library));
  const apply = vi.fn(); render(<RecoveryPanel onApply={apply}/>);
  fireEvent.click(await screen.findByText("历史备份（1）"));
  fireEvent.click(screen.getByRole("button", { name: "预览恢复" }));
  fireEvent.click(await screen.findByRole("button", { name: "保留原件并应用此方案" }));
  await screen.findByText("已取消保存原件，未应用修复"); expect(apply).not.toHaveBeenCalled();
});
