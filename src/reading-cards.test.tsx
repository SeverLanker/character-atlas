// @vitest-environment happy-dom
import { afterEach, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { NarrativeAbilities } from "./components/BookPages";
import type { Skill } from "./model";
afterEach(cleanup);

it("能力保持精选规则和分批展示，说明可独立展开且不丢失长文本", async () => {
  const skills: Skill[] = Array.from({ length: 8 }, (_, i) => ({ id: String(i), title: "能力" + i, text: "第一段\n第二段".repeat(50), rank: "精通" }));
  skills.push({ id: "low", title: "初学能力", text: "低阶说明", rank: "入门" });
  skills.push({ id: "featured", title: "重点日常", text: "不能隐藏", rank: "基础", common: true, featured: true });
  render(<NarrativeAbilities skills={skills} />);
  expect(screen.getAllByRole("article")).toHaveLength(6);
  expect(screen.queryByRole("heading", { name: "初学能力" })).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "再显示 6 项能力" }));
  expect(screen.getByRole("heading", { name: "重点日常" })).toBeTruthy();
  const summaries = document.querySelectorAll(".ability-card summary");
  fireEvent.click(summaries[0]); fireEvent.click(summaries[1]);
  await waitFor(() => expect([...document.querySelectorAll(".ability-card details")].filter(node => node.hasAttribute("open"))).toHaveLength(2));
  expect(summaries[0].nextElementSibling?.textContent).toBe(skills[0].text);
  fireEvent.click(screen.getByRole("button", { name: "查看全部能力（10）" }));
  expect(screen.getAllByRole("article")).toHaveLength(6);
  fireEvent.click(screen.getByRole("button", { name: "再显示 6 项能力" }));
  expect(screen.getByRole("heading", { name: "初学能力" })).toBeTruthy();
});

it("没有隐藏能力时不显示无效的查看全部按钮", () => {
  render(<NarrativeAbilities skills={[{ id: "a", title: "听", rank: "天生", text: "" }]} />);
  expect(screen.queryByRole("button", { name: /查看全部能力/ })).toBeNull();
  expect(screen.getByText("暂无说明")).toBeTruthy();
});
