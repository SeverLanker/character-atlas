// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { createCharacter, type Library } from "./model";
import { inspectLibraryHealth } from "./library-health";
import { LibraryHealth } from "./components/LibraryHealth";
vi.mock("./storage", () => ({ listAssetFiles: async () => [], listSnapshots: async () => [{ id: "bad" }], snapshotLibrary: async () => { throw Error("bad"); } }));
afterEach(cleanup);
it("识别缺图、失效公开/秘密关联、归一重名，保护历史备份的图片", () => {
  const c = createCharacter("甲"); c.versions[0].profile.portrait = "missing.png";
  c.versions[0].profile.relationships = [{ id: "link", title: "旧识", text: "", targetCharacterId: "gone" }];
  c.versions[0].secret.overrides.relationships = [{ id: "hidden", title: "机密正文", text: "机密正文", targetCharacterId: "hidden-target" }];
  const entry = { kind: "skill" as const, rank: "", text: "", common: false };
  const library: Library = { schemaVersion: 2, characters: [c], catalog: [{ ...entry, id: "a", title: "Ａ" }, { ...entry, id: "b", title: "a" }] };
  const before = JSON.stringify(library);
  const report = inspectLibraryHealth(library, [{ name: "old.png", bytes: 10 }, { name: "unused.png", bytes: 20 }], ["old.png"]);
  expect(report.missing).toEqual(["missing.png"]); expect(report.unreferenced.map(f => f.name)).toEqual(["unused.png"]);
  expect(report.links.map(l => l.secret)).toEqual([false, true]); expect(report.duplicates).toHaveLength(1);
  expect(JSON.stringify(library)).toBe(before);
});
it("检查不完整时明确提示，默认不显示秘密关联内容，无删除入口", async () => {
  const c = createCharacter("甲"); c.versions[0].secret.overrides.relationships = [{ id: "x", title: "机密正文", text: "", targetCharacterId: "hidden-target" }];
  render(<LibraryHealth library={{ schemaVersion: 2, characters: [c] }} disabled={false}/>);
  fireEvent.click(screen.getByRole("button", { name: "开始健康检查" }));
  await screen.findByText(/1 份备份无法读取/);
  expect(screen.queryByText(/hidden-target/)).toBeNull(); expect(screen.queryByText(/机密正文/)).toBeNull();
  fireEvent.click(screen.getByText("失效角色关联"));
  fireEvent.click(screen.getByRole("checkbox", { name: /显示秘密档案/ }));
  expect(screen.getByText(/hidden-target/)).toBeTruthy(); expect(screen.queryByRole("button", { name: /删除/ })).toBeNull();
});
