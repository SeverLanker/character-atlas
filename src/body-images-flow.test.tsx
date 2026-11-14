// @vitest-environment happy-dom
import "fake-indexeddb/auto";
import { afterEach, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import App from "./App";
import { createCharacter } from "./model";
import { loadLibrary, saveLibrary } from "./storage";
afterEach(cleanup);

it("真实编辑入口保存身体图与 SVG 选择，秘密清空和恢复沿用保持公开图，重开仍有效", async () => {
  const c = createCharacter("身体图角色"); c.versions[0].secret.enabled = true;
  await saveLibrary({ schemaVersion: 2, characters: [c] });
  const view = render(<App />);
  fireEvent.click(await screen.findByRole("button", { name: "打开身体图角色的档案" }));
  fireEvent.click(within(screen.getByRole("navigation", { name: "档案目录" })).getByRole("button", { name: /身体状态/ }));
  fireEvent.click(screen.getByRole("button", { name: "编辑档案" }));
  fireEvent.change(screen.getByLabelText("上传正面图"), { target: { files: [new File([new Uint8Array([137,80,78,71,13,10,26,10])], "body.png", { type: "image/png" })] } });
  await screen.findByText("正面图已更新。");
  fireEvent.change(screen.getByRole("combobox", { name: /身体图样式/ }), { target: { value: "diagram" } });
  await waitFor(async () => expect((await loadLibrary())!.characters[0].versions[0].profile.bodyImages?.display).toBe("diagram"));
  const publicRef = (await loadLibrary())!.characters[0].versions[0].profile.bodyImages!.front;
  expect((await loadLibrary())!.characters[0].versions[0].profile.body).toBeUndefined();
  fireEvent.click(screen.getByRole("button", { name: "完成编辑" }));
  fireEvent.click(within(screen.getByRole("navigation", { name: "档案目录" })).getByRole("button", { name: /详细档案/ }));
  fireEvent.click(screen.getByRole("button", { name: "身体图角色 · 切换秘密档案" }));
  fireEvent.click(within(screen.getByRole("navigation", { name: "档案目录" })).getByRole("button", { name: /医疗记录/ }));
  fireEvent.click(screen.getByRole("button", { name: "编辑档案" }));
  fireEvent.click(screen.getByRole("button", { name: "清除正面图" }));
  await waitFor(async () => expect((await loadLibrary())!.characters[0].versions[0].secret.overrides.bodyImages?.front).toBe(""));
  expect((await loadLibrary())!.characters[0].versions[0].profile.bodyImages!.front).toBe(publicRef);
  fireEvent.click(screen.getByRole("button", { name: "沿用公开身体图" }));
  await waitFor(async () => expect((await loadLibrary())!.characters[0].versions[0].secret.overrides.bodyImages).toBeUndefined());
  view.unmount(); render(<App />);
  fireEvent.click(await screen.findByRole("button", { name: "打开身体图角色的档案" }));
  fireEvent.click(within(screen.getByRole("navigation", { name: "档案目录" })).getByRole("button", { name: /身体状态/ }));
  expect(document.querySelector(".body-silhouette")).not.toBeNull();
  expect((await loadLibrary())!.characters[0].versions[0].profile.bodyImages).toEqual({ front: publicRef, back: "", display: "diagram" });
});
