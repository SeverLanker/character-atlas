// @vitest-environment happy-dom
import "fake-indexeddb/auto";
import { afterEach, describe, expect, it } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import App from "./App";
import { createCharacter, type Library } from "./model";
import {
  exportBackup,
  loadLibrary,
  putImage,
  readAsset,
  restoreBackup,
  saveLibrary,
} from "./storage";
afterEach(cleanup);
describe("本地实际存储与编辑流程", () => {
  it("完整备份恢复后，图片字节与秘密内容仍然存在", async () => {
    const bytes = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
    const ref = await putImage(
      new File([bytes], "portrait.png", { type: "image/png" }),
    );
    const character = createCharacter("备份角色");
    character.versions[0].profile.portrait = ref;
    character.versions[0].secret.overrides = {
      background: "秘密经历",
      portrait: ref,
    };
    const library: Library = { schemaVersion: 1, characters: [character] };
    await saveLibrary(library);
    const backup = await exportBackup(library);
    await saveLibrary({ schemaVersion: 1, characters: [] });
    const restored = await restoreBackup(backup);
    const newRef = restored.characters[0].versions[0].profile.portrait;
    expect(newRef).not.toBe(ref);
    expect(await readAsset(newRef)).toEqual(bytes);
    expect(restored.characters[0].versions[0].secret.overrides.portrait).toBe(
      newRef,
    );
    expect(
      (await loadLibrary())?.characters[0].versions[0].secret.overrides
        .background,
    ).toBe("秘密经历");
  });
  it("新建、修改证件资料、复制版本，重新打开后仍保存且互不覆盖", async () => {
    await saveLibrary({ schemaVersion: 1, characters: [] });
    const view = render(<App />);
    await screen.findByRole("button", { name: "创建角色" });
    fireEvent.click(screen.getByRole("button", { name: "创建角色" }));
    const dialog = screen.getByRole("dialog", { name: "翻开一个新的故事" });
    fireEvent.change(within(dialog).getByLabelText("角色名称"), {
      target: { value: "新角色" },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "创建并编辑" }));
    const editor = await screen.findByRole("region", { name: "编辑角色档案" });
    fireEvent.change(
      within(editor).getByRole("combobox", { name: "正在编辑" }),
      { target: { value: "archive" } },
    );
    fireEvent.change(within(editor).getByLabelText("姓名"), {
      target: { value: "初期姓名" },
    });
    fireEvent.click(within(editor).getByRole("button", { name: "剧情版本" }));
    fireEvent.change(within(editor).getByPlaceholderText("新版本名称"), {
      target: { value: "第二章" },
    });
    fireEvent.click(within(editor).getByRole("button", { name: "复制" }));
    fireEvent.click(within(editor).getByRole("button", { name: "资料" }));
    fireEvent.change(within(editor).getByLabelText("姓名"), {
      target: { value: "后期姓名" },
    });
    await waitFor(async () => {
      const lib = await loadLibrary();
      expect(lib?.characters[0].versions).toHaveLength(2);
      expect(lib?.characters[0].versions[0].profile.basics.name).toBe(
        "初期姓名",
      );
      expect(lib?.characters[0].versions[1].profile.basics.name).toBe(
        "后期姓名",
      );
    });
    view.unmount();
    render(<App />);
    await screen.findByRole("button", { name: "打开新角色的档案" });
    expect(
      (await loadLibrary())?.characters[0].versions[1].profile.basics.name,
    ).toBe("后期姓名");
  });
  it("秘密身份切换保持栏目，剧情版本切换回到表层", async () => {
    const character = createCharacter("外界姓名");
    const v = character.versions[0];
    v.secret.enabled = true;
    v.secret.trigger = "name";
    v.secret.overrides = { basics: { name: "隐藏姓名" } };
    const next = structuredClone(v);
    next.id = crypto.randomUUID();
    next.name = "下一阶段";
    character.versions.push(next);
    await saveLibrary({ schemaVersion: 1, characters: [character] });
    render(<App />);
    fireEvent.click(
      await screen.findByRole("button", { name: "打开外界姓名的档案" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "证件夹" }));
    const card = screen.getByRole("dialog", { name: "证件夹" });
    fireEvent.click(within(card).getByRole("button", { name: "外界姓名" }));
    await waitFor(() =>
      expect(screen.getByRole("heading", { name: "隐藏姓名" })).toBeTruthy(),
    );
    expect(
      within(screen.getByRole("navigation", { name: "档案目录" }))
        .getByRole("button", { name: /人员档案/ })
        .classList.contains("active"),
    ).toBe(true);
    expect(screen.getByRole("dialog", { name: "证件夹" })).toBeTruthy();
    expect(document.querySelector(".book-shell.theme-prison")).toBeTruthy();
    fireEvent.click(within(card).getByRole("button", { name: "关闭窗口" }));
    fireEvent.change(screen.getByRole("combobox", { name: "当前剧情版本" }), {
      target: { value: next.id },
    });
    expect(screen.getByRole("heading", { name: "外界姓名" })).toBeTruthy();
  });
});
