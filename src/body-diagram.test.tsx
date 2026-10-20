// @vitest-environment happy-dom
import "fake-indexeddb/auto";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { parseBodyValidatorJson } from "./body";
import { BodyDiagram } from "./components/BodyDiagram";
import aria from "./fixtures/bodyval-aria.json";
import type { Condition } from "./model";

afterEach(cleanup);
const conditions: Condition[] = [
  { id: "1", title: "刀伤", text: "", area: "腹部", severity: "danger" },
  { id: "2", title: "旧伤", text: "", area: "左臂", severity: "notice" },
];

it("无图时显示剪影，热区按记录高亮，点击切换筛选", () => {
  const onSelect = vi.fn();
  const { container, rerender } = render(<BodyDiagram body={parseBodyValidatorJson(JSON.stringify(aria))} conditions={conditions} active="全部" onSelect={onSelect} />);
  expect(container.querySelector(".body-silhouette")).not.toBeNull();
  expect(screen.getByText(/未导入正面图/)).toBeTruthy();
  expect(container.querySelector('[data-area="腹部"]')!.getAttribute("data-level")).toBe("danger");
  expect(container.querySelector('[data-area="左手"]')!.getAttribute("data-level")).toBe("notice");
  expect(container.querySelector('[data-area="右手"]')!.getAttribute("data-level")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: /腹部/ }));
  expect(onSelect).toHaveBeenLastCalledWith("腹部");
  rerender(<BodyDiagram body={parseBodyValidatorJson(JSON.stringify(aria))} conditions={conditions} active="腹部" onSelect={onSelect} />);
  fireEvent.click(screen.getByRole("button", { name: /腹部/ }));
  expect(onSelect).toHaveBeenLastCalledWith("全部");
  fireEvent.click(screen.getByRole("button", { name: "背面" }));
  expect(container.querySelector('[data-area="背部"]')).not.toBeNull();
});
