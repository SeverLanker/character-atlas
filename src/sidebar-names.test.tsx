// @vitest-environment happy-dom
import "fake-indexeddb/auto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import App from "./App";
import { saveLibrary } from "./storage";
import { createCharacter } from "./model";

afterEach(cleanup);

it("窄侧栏按钮有稳定可访问名称和视觉标记", async () => {
  await saveLibrary({ schemaVersion: 2, characters: [createCharacter("甲", "雾港")] });
  render(<App />);
  await screen.findByRole("button", { name: "创建角色" });
  const names: Array<[string, string]> = [
    ["叙册", "叙"],
    ["角色书架，1 位", "架"],
    ["特别收藏", "藏"],
    ["条目库管理，0 条", "条"],
    ["关系图", "图"],
    ["本地资料库", "库"],
  ];
  for (const [name, mark] of names) {
    const matches = screen.getAllByRole("button", { name });
    const button = matches.find((item) => item.getAttribute("data-mark") === mark);
    expect(button, name).toBeTruthy();
    expect(button?.getAttribute("data-label")).toBeTruthy();
  }
  const css = [
    readFileSync(join(__dirname, "styles.css"), "utf8"),
    readFileSync(join(__dirname, "styles/visual-refresh.css"), "utf8"),
    readFileSync(join(__dirname, "styles/identity-cards.css"), "utf8"),
  ].join("\n");
  expect(css).toMatch(/\.shelf-heading \.shelf-actions[\s\S]*flex-wrap:\s*wrap/);
  expect(css).toContain("content: attr(data-mark)");
  expect(css).toContain("content: attr(data-label)");
  expect(document.querySelector(".shelf-actions")).toBeTruthy();
});
