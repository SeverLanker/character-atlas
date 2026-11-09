// @vitest-environment happy-dom
import "fake-indexeddb/auto";
import { afterEach, expect, it } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import App from "./App";
import { createDocument } from "./documents";
import { createCharacter } from "./model";
import { saveLibrary } from "./storage";

afterEach(cleanup);

async function openWallet() {
  const character = createCharacter("聚焦角色");
  const version = character.versions[0];
  version.profile.documents = [createDocument("identity", version.profile)];
  version.secret.enabled = true;
  await saveLibrary({ schemaVersion: 2, characters: [character] });
  render(<App />);
  fireEvent.click(
    await screen.findByRole("button", { name: "打开聚焦角色的档案" }),
  );
  fireEvent.click(screen.getByRole("button", { name: "证件夹" }));
  return within(screen.getByRole("dialog", { name: "证件夹" }));
}

it("聚焦查看：进入后只剩证件本身，关闭按钮可退出", async () => {
  const wallet = await openWallet();
  fireEvent.click(wallet.getByRole("button", { name: "聚焦查看" }));
  expect(
    wallet.getByRole("dialog", { name: "聚焦查看证件" }),
  ).toBeTruthy();
  expect(
    wallet.getByText("点击空白处返回证件列表"),
  ).toBeTruthy();
  // The whole picker (list, tools, actions, editor) is hidden in focus view.
  expect(
    wallet.queryByRole("navigation", { name: "角色证件列表" }),
  ).toBeNull();
  expect(wallet.queryByRole("button", { name: "编辑证件" })).toBeNull();
  fireEvent.click(
    wallet.getByRole("button", { name: "关闭聚焦查看，返回证件列表" }),
  );
  expect(wallet.queryByRole("dialog", { name: "聚焦查看证件" })).toBeNull();
  expect(
    wallet.getByRole("navigation", { name: "角色证件列表" }),
  ).toBeTruthy();
});

it("聚焦查看：点背景空白处退出", async () => {
  const wallet = await openWallet();
  fireEvent.click(wallet.getByRole("button", { name: "聚焦查看" }));
  fireEvent.click(wallet.getByLabelText("点击空白处返回证件列表"));
  expect(wallet.queryByRole("dialog", { name: "聚焦查看证件" })).toBeNull();
  expect(
    wallet.getByRole("navigation", { name: "角色证件列表" }),
  ).toBeTruthy();
});

it("聚焦查看：Esc 只退出聚焦，不关闭整个证件夹", async () => {
  const wallet = await openWallet();
  fireEvent.click(wallet.getByRole("button", { name: "聚焦查看" }));
  const close = wallet.getByRole("button", {
    name: "关闭聚焦查看，返回证件列表",
  });
  fireEvent.keyDown(close, { key: "Escape" });
  expect(wallet.queryByRole("dialog", { name: "聚焦查看证件" })).toBeNull();
  expect(screen.getByRole("dialog", { name: "证件夹" })).toBeTruthy();
});

it("聚焦查看：编辑态下进入先关编辑器", async () => {
  const wallet = await openWallet();
  fireEvent.click(wallet.getByRole("button", { name: "编辑证件" }));
  expect(
    wallet.getByRole("region", { name: "编辑证件资料" }),
  ).toBeTruthy();
  fireEvent.click(wallet.getByRole("button", { name: "聚焦查看" }));
  expect(
    wallet.queryByRole("region", { name: "编辑证件资料" }),
  ).toBeNull();
  fireEvent.click(
    wallet.getByRole("button", { name: "关闭聚焦查看，返回证件列表" }),
  );
  expect(
    wallet.queryByRole("region", { name: "编辑证件资料" }),
  ).toBeNull();
});

it("聚焦查看：点卡面空白进入，点秘密触发点不进入", async () => {
  const wallet = await openWallet();
  // The holder name is plain text on the face: clicking it enters focus.
  fireEvent.click(wallet.getByRole("heading", { name: "聚焦角色" }));
  expect(
    wallet.getByRole("dialog", { name: "聚焦查看证件" }),
  ).toBeTruthy();
  fireEvent.click(
    wallet.getByRole("button", { name: "关闭聚焦查看，返回证件列表" }),
  );
  // The portrait is the secret trigger (default trigger=portrait): it switches
  // identity instead of entering focus.
  fireEvent.click(wallet.getByRole("button", { name: "切换身份档案" }));
  expect(wallet.queryByRole("dialog", { name: "聚焦查看证件" })).toBeNull();
  expect(wallet.getByRole("button", { name: "返回公开身份" })).toBeTruthy();
});

it("聚焦查看：翻面显示真实编号与条形码，再翻回来", async () => {
  const wallet = await openWallet();
  fireEvent.click(wallet.getByRole("button", { name: "聚焦查看" }));
  const focus = within(
    wallet.getByRole("dialog", { name: "聚焦查看证件" }),
  );
  fireEvent.click(focus.getByRole("button", { name: "查看背面" }));
  expect(focus.getByLabelText(/背面$/)).toBeTruthy();
  expect(focus.getByText("芯片与磁条为装饰图案，不代表真实签发信息。")).toBeTruthy();
  fireEvent.click(focus.getByRole("button", { name: "查看正面" }));
  expect(
    wallet.getByRole("button", { name: "查看背面" }),
  ).toBeTruthy();
  expect(
    document.querySelector(".focus-flip-inner.is-flipped"),
  ).toBeNull();
});

it("聚焦查看：删除确认框打开时不进入", async () => {
  const wallet = await openWallet();
  fireEvent.click(wallet.getByRole("button", { name: "移除证件" }));
  expect(wallet.getByRole("button", { name: "确认移除" })).toBeTruthy();
  fireEvent.click(wallet.getByRole("heading", { name: "聚焦角色" }));
  expect(wallet.queryByRole("dialog", { name: "聚焦查看证件" })).toBeNull();
});
