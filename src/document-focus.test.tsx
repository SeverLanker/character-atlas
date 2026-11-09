// @vitest-environment happy-dom
import "fake-indexeddb/auto";
import { afterEach, describe, expect, it } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { readFileSync } from "node:fs";
import App from "./App";
import {
  createDocument,
  type DocumentField,
  type DocumentType,
} from "./documents";
import { createCharacter } from "./model";
import { saveLibrary } from "./storage";

/** The focus stylesheet, read as text: the grid-stacking fix lives in CSS, so the regression guard reads the rules themselves (?raw is emptied by this repo's vitest setup). Tests run from the repo root. */
const focusCss = readFileSync("src/styles/document-focus.css", "utf8");

afterEach(cleanup);

async function openWallet(
  type: DocumentType = "identity",
  fields: Partial<Record<DocumentField, string>> = {},
) {
  const character = createCharacter("聚焦角色");
  const version = character.versions[0];
  const doc = createDocument(type, version.profile);
  doc.fields = { ...doc.fields, ...fields };
  version.profile.documents = [doc];
  version.secret.enabled = true;
  await saveLibrary({ schemaVersion: 2, characters: [character] });
  render(<App />);
  fireEvent.click(
    await screen.findByRole("button", { name: "打开聚焦角色的档案" }),
  );
  fireEvent.click(screen.getByRole("button", { name: "证件夹" }));
  return within(screen.getByRole("dialog", { name: "证件夹" }));
}

function openFocus(wallet: ReturnType<typeof within>) {
  fireEvent.click(wallet.getByRole("button", { name: "聚焦查看" }));
  return within(wallet.getByRole("dialog", { name: "聚焦查看证件" }));
}

/** The declaration block for `selector` in the focus stylesheet. */
function cssBlock(selector: string): string {
  const start = focusCss.indexOf(selector);
  if (start < 0) return "";
  const open = focusCss.indexOf("{", start);
  const close = focusCss.indexOf("}", open);
  return focusCss.slice(open + 1, close);
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

describe("聚焦查看：小册子开合（护照 / 警官证）", () => {
  const cases = [
    {
      type: "passport" as const,
      fields: {
        holder: "浅上京子",
        romanName: "KYOKO ASAGAMI",
        gender: "女",
        birthday: "2000-01-01",
        nationality: "新迦南",
        birthplace: "新迦南市",
        number: "P123456",
        issuer: "新迦南市政厅",
        issued: "2020-01-01",
        expires: "2030-01-01",
      },
      coverName: "护照",
      firstPage: "个人资料页",
      issuer: "新迦南市政厅",
    },
    {
      type: "police" as const,
      fields: {
        holder: "浅上京子",
        organization: "新迦南市警局",
        department: "重案组",
        rank: "警督",
        position: "探长",
        number: "K-01",
        issuer: "市政厅",
        issued: "2020-01-01",
        expires: "2030-01-01",
      },
      coverName: "警官证",
      firstPage: "内页",
      issuer: "市政厅",
    },
  ];
  for (const { type, fields, coverName, firstPage, issuer } of cases) {
    it(`${coverName}：打开证件而非查看背面，翻页到签发页，合上回到封面`, async () => {
      const wallet = await openWallet(type, fields);
      const focus = openFocus(wallet);
      // Booklets open around the spine; there is no card-back flip.
      expect(
        focus.getByRole("button", { name: "打开证件" }),
      ).toBeTruthy();
      expect(
        focus.queryByRole("button", { name: "查看背面" }),
      ).toBeNull();
      expect(
        focus.queryByText(/第 \d+ \/ \d+ 页/),
      ).toBeNull();

      fireEvent.click(focus.getByRole("button", { name: "打开证件" }));
      expect(
        focus.getByRole("button", { name: "合上证件" }),
      ).toBeTruthy();
      expect(focus.getByText(/第 1 \/ 2 页/)).toBeTruthy();
      expect(
        focus.getByLabelText(`${coverName} · ${firstPage}`),
      ).toBeTruthy();

      fireEvent.click(focus.getByRole("button", { name: "下一页" }));
      expect(focus.getByText(/第 2 \/ 2 页/)).toBeTruthy();
      const issuePage = within(
        focus.getByLabelText(`${coverName} · 签发页`),
      );
      expect(issuePage.getByText(issuer)).toBeTruthy();
      expect(
        focus.queryByLabelText(`${coverName} · ${firstPage}`),
      ).toBeNull();

      fireEvent.click(focus.getByRole("button", { name: "合上证件" }));
      expect(
        focus.getByRole("button", { name: "打开证件" }),
      ).toBeTruthy();
      expect(focus.queryByText(/第 \d+ \/ \d+ 页/)).toBeNull();
      expect(
        focus.queryByLabelText(`${coverName} · 签发页`),
      ).toBeNull();
    });
  }

  it("护照：签发信息全空时只有一页", async () => {
    const wallet = await openWallet("passport", {
      holder: "浅上京子",
      number: "P123456",
    });
    const focus = openFocus(wallet);
    fireEvent.click(focus.getByRole("button", { name: "打开证件" }));
    expect(focus.getByText(/第 1 \/ 1 页/)).toBeTruthy();
    expect(
      focus.getByRole("button", { name: "下一页" }),
    ).toHaveProperty("disabled", true);
  });
});

describe("聚焦查看：翻面不再用绝对定位的背面", () => {
  it("身份证仍走翻面，没有打开证件按钮", async () => {
    const wallet = await openWallet();
    const focus = openFocus(wallet);
    expect(
      focus.getByRole("button", { name: "查看背面" }),
    ).toBeTruthy();
    expect(
      focus.queryByRole("button", { name: "打开证件" }),
    ).toBeNull();
  });

  it("正反两面同占一个网格单元，背面不再绝对定位", async () => {
    const wallet = await openWallet();
    const focus = openFocus(wallet);
    fireEvent.click(focus.getByRole("button", { name: "查看背面" }));
    const inner = document.querySelector(".focus-flip-inner");
    expect(inner).toBeTruthy();
    const faces = inner!.querySelectorAll(".focus-flip-face");
    expect(faces).toHaveLength(2);
    expect(faces[1].classList.contains("focus-flip-back")).toBe(true);
    // The grid stacking itself lives in the stylesheet: the inner is a grid,
    // both faces share grid-area 1/1, and the back is not absolute anymore.
    expect(cssBlock(".focus-flip-inner")).toContain("display: grid");
    expect(cssBlock(".focus-flip-face")).toContain("grid-area: 1 / 1");
    expect(cssBlock(".focus-flip-back")).not.toContain("absolute");
  });
});
