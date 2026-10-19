// @vitest-environment happy-dom
import "fake-indexeddb/auto";
import { afterEach, expect, it } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
  waitFor,
} from "@testing-library/react";
import App from "./App";
import { createCharacter, duplicateVersion } from "./model";
import { loadLibrary, saveLibrary } from "./storage";
afterEach(cleanup);
it("默认身份卡使用表层资料，阈值点击展开，身体数值编辑与撤销同步保存", async () => {
  const role = createCharacter("管理名");
  const v = role.versions[0];
  v.profile.basics.name = "初期学生";
  const later = duplicateVersion(v, "后期");
  later.profile.basics.name = "后期学生";
  later.profile.coc!.characteristics.STR = 57;
  later.secret.enabled = true;
  later.secret.overrides = { basics: { name: "秘密真名" } };
  role.versions.push(later);
  role.defaultVersionId = later.id;
  await saveLibrary({ schemaVersion: 2, characters: [role] });
  render(<App />);
  const card = await screen.findByRole("button", { name: "打开管理名的档案" });
  expect(card.textContent).toContain("后期学生");
  expect(card.textContent).not.toContain("初期学生");
  expect(screen.queryByText("秘密真名")).toBeNull();
  expect(card.querySelector("button")).toBeNull();
  fireEvent.click(card);
  expect(
    (
      screen.getByRole("combobox", {
        name: "当前剧情版本",
      }) as HTMLSelectElement
    ).value,
  ).toBe(later.id);
  expect(screen.queryByRole("button", { name: /扉页/ })).toBeNull();
  fireEvent.click(
    within(screen.getByRole("navigation", { name: "档案目录" })).getByRole(
      "button",
      { name: /属性与技能/ },
    ),
  );
  const value = screen.getByRole("button", { name: "力量 常规 57" });
  expect(value.getAttribute("aria-expanded")).toBe("false");
  fireEvent.click(value);
  expect(value.parentElement!.textContent).toContain("困难 28 · 极难 11");
  fireEvent.click(value);
  expect(value.getAttribute("aria-expanded")).toBe("false");
  fireEvent.click(screen.getByRole("button", { name: "编辑档案" }));
  let editor = screen.getByRole("region", { name: "编辑角色档案" });
  fireEvent.change(within(editor).getByLabelText("当前 HP"), {
    target: { value: "3" },
  });
  fireEvent.click(within(editor).getByRole("button", { name: "完成编辑" }));
  fireEvent.click(
    within(screen.getByRole("navigation", { name: "档案目录" })).getByRole(
      "button",
      { name: /身体状态/ },
    ),
  );
  expect(screen.getByLabelText("当前身体数值").textContent).toContain(
    "HP3 / 10",
  );
  fireEvent.click(screen.getByRole("button", { name: "撤销修改" }));
  expect(screen.getByLabelText("当前身体数值").textContent).toContain(
    "HP10 / 10",
  );
  fireEvent.click(screen.getByRole("button", { name: "重做修改" }));
  await waitFor(async () =>
    expect(
      (await loadLibrary())!.characters[0].versions[1].profile.coc!.state.hp,
    ).toBe(3),
  );
  fireEvent.click(screen.getByRole("button", { name: "编辑档案" }));
  editor = screen.getByRole("region", { name: "编辑角色档案" });
  fireEvent.change(within(editor).getByRole("combobox", { name: "正在编辑" }), {
    target: { value: "skills" },
  });
  fireEvent.change(within(editor).getByLabelText("体质 CON"), {
    target: { value: "80" },
  });
  expect(
    (within(editor).getByLabelText("当前 HP") as HTMLInputElement).value,
  ).toBe("3");
  await waitFor(async () =>
    expect(
      (await loadLibrary())!.characters[0].versions[1].profile.coc!
        .characteristics.CON,
    ).toBe(80),
  );
});
it("删除默认版本后选取有效默认版本，撤销恢复完整版本和默认设置", async () => {
  const role = createCharacter("版本角色"),
    later = duplicateVersion(role.versions[0], "第二章");
  role.versions.push(later);
  role.defaultVersionId = later.id;
  await saveLibrary({ schemaVersion: 2, characters: [role] });
  render(<App />);
  fireEvent.click(
    await screen.findByRole("button", { name: "打开版本角色的档案" }),
  );
  fireEvent.click(screen.getByRole("button", { name: "编辑档案" }));
  const editor = screen.getByRole("region", { name: "编辑角色档案" });
  fireEvent.click(within(editor).getByRole("button", { name: "剧情版本" }));
  fireEvent.click(within(editor).getByRole("button", { name: "删除当前版本" }));
  const confirm = screen.getByRole("dialog", { name: "删除这个剧情版本？" });
  fireEvent.click(within(confirm).getByRole("button", { name: "删除版本" }));
  await waitFor(async () => {
    const lib = await loadLibrary();
    expect(lib!.characters[0].versions).toHaveLength(1);
    expect(lib!.characters[0].defaultVersionId).toBe(role.versions[0].id);
  });
  fireEvent.click(within(editor).getByRole("button", { name: "撤销修改" }));
  await waitFor(async () => {
    const lib = await loadLibrary();
    expect(lib!.characters[0].versions).toHaveLength(2);
    expect(lib!.characters[0].defaultVersionId).toBe(later.id);
  });
});
