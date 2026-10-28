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
import { createCharacter } from "./model";
import { loadLibrary, saveLibrary } from "./storage";

afterEach(cleanup);
it("在真实应用中添加同类证件、独立编辑、复制、秘密覆盖、删除撤销并重新读取", async () => {
  const character = createCharacter("证件角色");
  const version = character.versions[0];
  version.profile.documents = [];
  version.secret.enabled = true;
  await saveLibrary({ schemaVersion: 2, characters: [character] });
  render(<App />);
  fireEvent.click(
    await screen.findByRole("button", { name: "打开证件角色的档案" }),
  );
  fireEvent.click(screen.getByRole("button", { name: "证件夹" }));
  const wallet = within(screen.getByRole("dialog", { name: "证件夹" }));
  expect(wallet.getByText("还没有证件")).toBeTruthy();
  const addStudent = () => {
    fireEvent.click(wallet.getByRole("button", { name: "添加证件" }));
    fireEvent.click(
      wallet.getByRole("button", { name: "学生证 STUDENT CARD" }),
    );
  };
  addStudent();
  let editor = within(wallet.getByRole("region", { name: "编辑证件资料" }));
  fireEvent.change(editor.getByLabelText("证件名称"), {
    target: { value: "大学学生证" },
  });
  fireEvent.change(editor.getByLabelText("学号"), {
    target: { value: "STUDENT-001" },
  });
  fireEvent.change(editor.getByLabelText("学校"), {
    target: { value: "北境大学" },
  });
  addStudent();
  editor = within(wallet.getByRole("region", { name: "编辑证件资料" }));
  fireEvent.change(editor.getByLabelText("证件名称"), {
    target: { value: "留学学生证" },
  });
  fireEvent.change(editor.getByLabelText("学号"), {
    target: { value: "STUDENT-002" },
  });
  fireEvent.click(wallet.getByRole("button", { name: "复制证件" }));
  expect(
    within(
      wallet.getByRole("navigation", { name: "角色证件列表" }),
    ).getAllByRole("button"),
  ).toHaveLength(3);
  editor = within(wallet.getByRole("region", { name: "编辑证件资料" }));
  fireEvent.change(editor.getByLabelText("姓名"), {
    target: { value: "证件化名" },
  });
  fireEvent.change(editor.getByLabelText("证件类型"), {
    target: { value: "passport" },
  });
  fireEvent.change(editor.getByLabelText("证件类型"), {
    target: { value: "student" },
  });
  expect((editor.getByLabelText("学号") as HTMLInputElement).value).toBe(
    "STUDENT-002",
  );
  fireEvent.click(wallet.getByRole("button", { name: "移除证件" }));
  fireEvent.click(wallet.getByRole("button", { name: "确认移除" }));
  expect(
    within(
      wallet.getByRole("navigation", { name: "角色证件列表" }),
    ).getAllByRole("button"),
  ).toHaveLength(2);
  fireEvent.click(wallet.getByRole("button", { name: "撤销修改" }));
  expect(
    within(
      wallet.getByRole("navigation", { name: "角色证件列表" }),
    ).getAllByRole("button"),
  ).toHaveLength(3);
  fireEvent.click(wallet.getAllByRole("button", { name: "切换身份档案" })[0]);
  expect(wallet.queryByRole("button", { name: "切换秘密身份" })).toBeNull();
  expect(wallet.getByRole("button", { name: "返回公开身份" })).toBeTruthy();
  fireEvent.click(wallet.getByRole("button", { name: "编辑证件" }));
  editor = within(wallet.getByRole("region", { name: "编辑证件资料" }));
  fireEvent.change(editor.getByLabelText("学号"), {
    target: { value: "SECRET-001" },
  });
  await waitFor(async () => {
    const saved = (await loadLibrary())!.characters[0].versions[0];
    expect(saved.profile.documents).toHaveLength(3);
    expect(saved.profile.documents![0].fields.number).toBe("STUDENT-001");
    expect(saved.profile.documents![1].fields.holder).toBe("证件角色");
    expect(saved.profile.documents![2].fields.holder).toBe("证件化名");
    expect(saved.profile.basics.name).toBe("证件角色");
    expect(saved.secret.overrides.documents![0].fields.number).toBe(
      "SECRET-001",
    );
  });
  fireEvent.click(wallet.getByRole("button", { name: "恢复沿用公开证件" }));
  fireEvent.click(wallet.getByRole("button", { name: "确认恢复沿用" }));
  await waitFor(async () =>
    expect(
      (await loadLibrary())!.characters[0].versions[0].secret.overrides
        .documents,
    ).toBeUndefined(),
  );
});
