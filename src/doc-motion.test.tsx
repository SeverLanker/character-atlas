// @vitest-environment happy-dom
import "fake-indexeddb/auto";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import App from "./App";
import { createCharacter } from "./model";
import { saveLibrary } from "./storage";
import { createDocument } from "./documents";
import { DocumentFace } from "./components/DocumentWallet";
import { TypeReveal, resetTypeReveal } from "./components/TypeReveal";

function motion(reduce: boolean) {
  vi.stubGlobal("matchMedia", (q: string) => ({ matches: reduce && q.includes("reduced-motion"), media: q, addEventListener() {}, removeEventListener() {} }));
}
beforeEach(() => { resetTypeReveal(); motion(false); });
afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); delete document.documentElement.dataset.reduceMotion; });

it("打字效果立即提供完整文字，约 1 秒内打完，同一证件不重放", () => {
  vi.useFakeTimers();
  const text = "长".repeat(300);
  const { container, unmount } = render(<p><TypeReveal id="d1:number:p" text={text} /></p>);
  expect(container.querySelector(".visually-hidden")?.textContent).toBe(text);
  expect(container.querySelector(".type-caret")).toBeTruthy();
  act(() => { vi.advanceTimersByTime(1000); });
  expect(container.querySelector(".type-caret")).toBeNull();
  expect(container.textContent).toBe(text);
  unmount();
  const again = render(<p><TypeReveal id="d1:number:p" text={text} /></p>);
  expect(again.container.querySelector(".type-caret")).toBeNull();
});

it("减少动态效果时直接显示结果（系统设置或根节点开关）", () => {
  motion(true);
  const a = render(<TypeReveal id="a" text="WC-01" />);
  expect(a.container.querySelector(".type-caret")).toBeNull();
  motion(false);
  document.documentElement.dataset.reduceMotion = "true";
  const b = render(<TypeReveal id="b" text="WC-02" />);
  expect(b.container.querySelector(".type-caret")).toBeNull();
});

it("警官证编号逐字打出，其他公开证件不打字", () => {
  const profile = createCharacter("警探").versions[0].profile;
  const police = createDocument("police", profile, "p1"); police.fields.number = "WC-0042";
  const work = createDocument("work", profile, "w1"); work.fields.number = "STAFF-7";
  const { container } = render(<><DocumentFace document={police} /><DocumentFace document={work} /></>);
  expect(container.querySelectorAll(".type-reveal")).toHaveLength(1);
  expect(container.querySelector(".visually-hidden")?.textContent).toBe("WC-0042");
});

async function openWallet(enabled = true) {
  const character = createCharacter("动效角色");
  const version = character.versions[0];
  version.profile.documents = [];
  version.secret.enabled = enabled;
  version.secret.trigger = "emblem";
  await saveLibrary({ schemaVersion: 2, characters: [character] });
  render(<App />);
  fireEvent.click(await screen.findByRole("button", { name: "打开动效角色的档案" }));
  fireEvent.click(screen.getByRole("button", { name: "证件夹" }));
  return () => within(screen.getByRole("dialog", { name: "证件夹" }));
}

it("只有添加证件时盖章，切换证件不盖章", async () => {
  const wallet = await openWallet();
  expect(document.querySelector(".doc-issue-stamp")).toBeNull();
  fireEvent.click(wallet().getByRole("button", { name: "添加证件" }));
  fireEvent.click(wallet().getByRole("button", { name: "警官证 POLICE OFFICER" }));
  expect(document.querySelector(".doc-issue-stamp")).toBeTruthy();
  fireEvent.animationEnd(document.querySelector(".doc-issue-stamp")!);
  expect(document.querySelector(".doc-issue-stamp")).toBeNull();
  fireEvent.click(wallet().getByRole("button", { name: "完成编辑" }));
  expect(document.querySelector(".doc-issue-stamp")).toBeNull();
});

it("减少动态效果时添加证件不盖章、切换身份不故障", async () => {
  motion(true);
  const wallet = await openWallet();
  fireEvent.click(wallet().getByRole("button", { name: "添加证件" }));
  fireEvent.click(wallet().getByRole("button", { name: "学生证 STUDENT CARD" }));
  expect(document.querySelector(".doc-issue-stamp")).toBeNull();
  fireEvent.click(wallet().getAllByRole("button", { name: "切换身份档案" })[0]);
  expect(document.querySelector(".identity-glitch")).toBeNull();
});

it("切换秘密身份和返回公开身份时触发故障效果，随后移除", async () => {
  const wallet = await openWallet();
  fireEvent.click(wallet().getByRole("button", { name: "添加证件" }));
  fireEvent.click(wallet().getByRole("button", { name: "身份证 IDENTITY CARD" }));
  expect(document.querySelector(".document-wallet.identity-glitch")).toBeNull();
  fireEvent.click(wallet().getAllByRole("button", { name: "切换身份档案" })[0]);
  expect(document.querySelector(".document-wallet.identity-glitch.wallet-secret")).toBeTruthy();
  await act(() => new Promise(r => setTimeout(r, 500)));
  expect(document.querySelector(".identity-glitch")).toBeNull();
  fireEvent.click(wallet().getByRole("button", { name: "返回公开身份" }));
  expect(document.querySelector(".document-wallet.identity-glitch:not(.wallet-secret)")).toBeTruthy();
});
