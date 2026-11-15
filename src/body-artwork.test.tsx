// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { BodyArtwork } from "./components/BodyArtwork";
import { BookPages } from "./components/BookPages";
import { createCharacter, type Condition } from "./model";
vi.mock("./storage", () => ({ imageUrl: async (ref: string) => "blob:" + ref }));
afterEach(cleanup);

const conditions: Condition[] = [
  { id: "abdomen", title: "腹部记录", text: "", area: "腹部", severity: "danger" },
  { id: "hand", title: "手部记录", text: "", area: "左手", severity: "stable" },
  { id: "overall", title: "全身记录", text: "", area: "全身", severity: "notice" },
];

it("动漫图按角色左右选择，细分记录计入粗部位，全身记录不使整图着色", () => {
  const select = vi.fn();
  const props = { conditions, active: "全部", onSelect: select };
  const view = render(<BodyArtwork {...props} />);
  const map = screen.getByRole("group", { name: "身体部位选择" });
  expect(map.getAttribute("viewBox")).toBe("-40 -40 1280 1580");
  expect(map.querySelector("image")?.getAttribute("x")).toBe("-40");
  // Landmarks in the approved SVG use the same coordinate system as the hotspots.
  for (const [area, x, y] of [["头部", 600, 260], ["躯干", 600, 590], ["右臂", 135, 410], ["左臂", 1065, 410], ["右腿", 420, 1280], ["左腿", 780, 1280]] as const) {
    const rect = map.querySelector(`[data-area="${area}"] rect`)!;
    const a = (key: string) => Number(rect.getAttribute(key));
    expect(x).toBeGreaterThanOrEqual(a("x")); expect(x).toBeLessThanOrEqual(a("x") + a("width"));
    expect(y).toBeGreaterThanOrEqual(a("y")); expect(y).toBeLessThanOrEqual(a("y") + a("height"));
  }
  const left = screen.getByRole("button", { name: "左臂，1 条记录" });
  expect(Number(left.querySelector("rect")!.getAttribute("x"))).toBeGreaterThan(500);
  expect(screen.getByRole("button", { name: "右臂" }).getAttribute("data-level")).toBeNull();
  expect(screen.getByRole("button", { name: "躯干，1 条记录" }).getAttribute("data-level")).toBe("danger");
  expect(left.getAttribute("data-level")).toBe("stable");
  fireEvent.keyDown(left, { key: " " }); expect(select).toHaveBeenLastCalledWith("左臂");
  view.rerender(<BodyArtwork {...props} active="左臂" />);
  expect(left.getAttribute("aria-pressed")).toBe("true");
  fireEvent.keyDown(left, { key: "Enter" }); expect(select).toHaveBeenLastCalledWith("全部");
  view.rerender(<BodyArtwork {...props} active="腹部" />);
  const torso = screen.getByRole("button", { name: "躯干，1 条记录" });
  expect(torso.getAttribute("data-related")).toBe("true");
  expect(torso.getAttribute("aria-pressed")).toBe("false");
  expect(screen.getByText("当前筛选 · 腹部")).toBeTruthy();
  fireEvent.click(torso); expect(select).toHaveBeenLastCalledWith("躯干");
});

it("可以查看备用 SVG 的正背面并返回插图；图片损坏时安全回退", () => {
  const view = render(<BodyArtwork conditions={[]} active="全部" onSelect={vi.fn()} />);
  fireEvent.click(screen.getByRole("button", { name: "查看中性人体示意" }));
  expect(view.container.querySelector("image")).toBeNull();
  expect(view.container.querySelector(".body-silhouette")).not.toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "背面" }));
  expect(view.container.querySelector('[data-view="back"]')).not.toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "返回动漫 SVG" }));
  const image = view.container.querySelector("image")!;
  expect(image.getAttribute("href")).toBe("/art/body-vitruvian-anime.svg");
  fireEvent.error(image);
  expect(screen.getByRole("status").textContent).toContain("已使用 SVG");
  expect(view.container.querySelector("image")).toBeNull();
  expect(view.container.querySelector(".body-silhouette")).not.toBeNull();
});

it("默认页插图与 SVG 筛选使用同一规则，不写入身体数据，也不替换自定义图", async () => {
  const profile = createCharacter("默认图测试").versions[0].profile;
  profile.conditions = conditions;
  const snapshot = JSON.stringify(profile);
  const props = { profile, page: "status" as const, hidden: false, onPreview: vi.fn() };
  const view = render(<BookPages {...props} />);
  fireEvent.click(within(screen.getByRole("group", { name: "身体部位选择" })).getByRole("button", { name: /躯干/ }));
  expect(screen.getByRole("heading", { name: "腹部记录" })).toBeTruthy();
  expect(screen.queryByRole("heading", { name: "手部记录" })).toBeNull();
  expect(screen.getByRole("heading", { name: "全身记录" })).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "查看中性人体示意" }));
  fireEvent.click(within(screen.getByRole("group", { name: "身体部位选择" })).getByRole("button", { name: /左手/ }));
  expect(screen.getByRole("heading", { name: "手部记录" })).toBeTruthy();
  expect(screen.queryByRole("heading", { name: "腹部记录" })).toBeNull();
  expect(JSON.stringify(profile)).toBe(snapshot);
  view.rerender(<BookPages {...props} profile={{ ...profile, bodyImages: { front: "own.png", back: "" } }} />);
  expect(view.container.querySelector(".body-artwork")).toBeNull();
  expect(screen.queryByRole("button", { name: "查看中性人体示意" })).toBeNull();
});
