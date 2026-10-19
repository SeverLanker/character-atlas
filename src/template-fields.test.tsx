// @vitest-environment happy-dom
import { afterEach, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { BookPages } from "./components/BookPages";
import { blankProfile } from "./model";

afterEach(cleanup);

it("系统记录可筛选和全文检索，切换到不含该系统的档案时恢复全部", () => {
  const profile = blankProfile("观察对象");
  profile.conditions = [
    { id: "skin", title: "皮肤 · 恢复情况", area: "皮肤", severity: "stable", text: "无色素沉着" },
    { id: "sense", title: "感官 · 听觉", area: "感官", severity: "notice", text: "阈值变化" },
    { id: "body", title: "总体观察", area: "全身", severity: "stable", text: "状态平稳" },
  ];
  const { rerender } = render(<BookPages page="status" profile={profile} hidden={false} onPreview={() => {}} />);
  fireEvent.click(screen.getByRole("button", { name: "皮肤" }));
  expect(screen.queryByText("感官 · 听觉")).toBeNull();
  expect(screen.getByText("总体观察")).toBeTruthy();
  fireEvent.change(screen.getByLabelText("搜索状态记录"), { target: { value: "色素" } });
  expect(screen.getByText("皮肤 · 恢复情况")).toBeTruthy();
  expect(screen.queryByText("总体观察")).toBeNull();
  fireEvent.change(screen.getByLabelText("搜索状态记录"), { target: { value: "不存在" } });
  expect(screen.getByText("没有匹配的状态记录")).toBeTruthy();
  fireEvent.change(screen.getByLabelText("搜索状态记录"), { target: { value: "" } });
  const next = blankProfile("另一版本");
  next.conditions = [profile.conditions[1]];
  rerender(<BookPages page="status" profile={next} hidden={true} onPreview={() => {}} />);
  expect(screen.getByRole("button", { name: "全部" }).getAttribute("aria-pressed")).toBe("true");
  expect(screen.getByText("感官 · 听觉")).toBeTruthy();
});
