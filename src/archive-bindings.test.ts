import { beforeEach, expect, it, vi } from "vitest";
import { createArchiveRef, createArchiveRoot, deleteArchiveRef, withArchive, withRoot } from "./external-archives";
import { migrateLibrary } from "./model";

const invoke = vi.fn();
vi.mock("@tauri-apps/api/core", () => ({ isTauri: () => true, invoke: (...args: unknown[]) => invoke(...args) }));

const machine = await import("./archive-machine");

beforeEach(() => invoke.mockReset());

it("删除最后一条引用时只忘记本机路径，撤销时写回，且不把路径交给别的命令", async () => {
  const root = createArchiveRoot("合成库");
  const other = createArchiveRoot("另一库");
  const gone = createArchiveRef({ title: "札记", rootId: root.id, relativePath: "notes/a.md", visibility: "private" });
  const stays = createArchiveRef({ title: "留下", rootId: other.id, relativePath: "notes/b.md", visibility: "private" });
  const before = withArchive(withArchive(withRoot(withRoot(migrateLibrary({ schemaVersion: 2, characters: [] }), root), other), gone), stays);
  const after = deleteArchiveRef(before, gone.id);
  invoke.mockImplementation(async (command: string) => {
    if (command === "archive_forget_roots") return [{ rootId: root.id, absolutePath: "C:/secret/vault" }];
    return undefined;
  });
  await machine.syncReleasedArchiveRoots(before, after);
  expect(invoke).toHaveBeenCalledTimes(1);
  expect(invoke).toHaveBeenCalledWith("archive_forget_roots", { rootIds: [root.id] });
  expect(JSON.stringify(invoke.mock.calls[0])).not.toContain("C:/secret/vault");
  expect(JSON.stringify(invoke.mock.calls)).not.toContain("notes/a.md");
  invoke.mockClear();
  await machine.syncReleasedArchiveRoots(after, before);
  expect(invoke).toHaveBeenCalledWith("archive_restore_roots", { roots: [{ rootId: root.id, absolutePath: "C:/secret/vault" }] });
  expect(invoke.mock.calls.every((call) => call[0] === "archive_restore_roots")).toBe(true);
});
