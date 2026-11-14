// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MotionToggle } from "./components/MotionToggle";
import { applyReduceMotion, readReduceMotion, reducedMotion } from "./motion";

afterEach(() => { cleanup(); vi.unstubAllGlobals(); localStorage.clear(); applyReduceMotion(false); });
it("设置切换即时生效并在重开后保留，系统减弱动效优先", () => {
  vi.stubGlobal("matchMedia", () => ({ matches: false }));
  const view = render(<MotionToggle />);
  fireEvent.click(screen.getByRole("checkbox", { name: "减少动态效果" }));
  expect(reducedMotion()).toBe(true); expect(readReduceMotion()).toBe(true);
  view.unmount(); applyReduceMotion(readReduceMotion()); render(<MotionToggle />);
  expect((screen.getByRole("checkbox") as HTMLInputElement).checked).toBe(true);
  fireEvent.click(screen.getByRole("checkbox")); expect(reducedMotion()).toBe(false);
  vi.stubGlobal("matchMedia", () => ({ matches: true })); expect(reducedMotion()).toBe(true);
});
it("存储不可用时仍能关闭动效并明确提示未持久化", () => {
  vi.stubGlobal("localStorage", { getItem: () => { throw Error("denied"); }, setItem: () => { throw Error("denied"); } });
  const view = render(<MotionToggle />); fireEvent.click(screen.getByRole("checkbox"));
  expect(reducedMotion()).toBe(true); expect(screen.getByRole("status").textContent).toContain("未能保存");
  view.unmount(); render(<MotionToggle />);
  expect((screen.getByRole("checkbox") as HTMLInputElement).checked).toBe(true);
});
