// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import {
  canEnterFocus,
  isFocusGuardTarget,
  springSettled,
  springStep,
  tiltFromPointer,
} from "./document-motion";

describe("springStep", () => {
  it("moves toward the target and slows down near it", () => {
    let value = 0;
    let velocity = 0;
    for (let i = 0; i < 120; i++) {
      const next = springStep(value, 10, velocity);
      value = next.value;
      velocity = next.velocity;
    }
    expect(value).toBeCloseTo(10, 1);
    expect(springSettled(value, 10, velocity)).toBe(true);
  });
  it("stays put when already at the target", () => {
    expect(springStep(4, 4, 0)).toEqual({ value: 4, velocity: 0 });
  });
  it("reports unsettled while still moving", () => {
    expect(springSettled(0, 10, 3)).toBe(false);
    expect(springSettled(9.999, 10, 0.001)).toBe(true);
  });
});

describe("tiltFromPointer", () => {
  it("is flat at the centre and tilts toward the pointer at the edges", () => {
    expect(tiltFromPointer(0.5, 0.5)).toEqual({
      rx: 0,
      ry: 0,
      lightX: 50,
      lightY: 50,
    });
    expect(tiltFromPointer(1, 0)).toEqual({
      rx: 3.5,
      ry: 4.5,
      lightX: 100,
      lightY: 0,
    });
    expect(tiltFromPointer(0, 1)).toEqual({
      rx: -3.5,
      ry: -4.5,
      lightX: 0,
      lightY: 100,
    });
  });
  it("clamps positions outside the card", () => {
    expect(tiltFromPointer(-2, 3).lightX).toBe(0);
    expect(tiltFromPointer(-2, 3).lightY).toBe(100);
  });
});

describe("isFocusGuardTarget", () => {
  it("guards buttons, links and form controls (incl. secret triggers)", () => {
    const root = document.createElement("div");
    root.innerHTML =
      `<button class="document-seal">印</button>` +
      `<button class="text-button">名</button>` +
      `<a href="#">链</a><input type="text">` +
      `<span class="plain">空白</span>`;
    document.body.append(root);
    for (const selector of [".document-seal", ".text-button", "a", "input"]) {
      expect(
        isFocusGuardTarget(root.querySelector(selector)),
      ).toBe(true);
    }
    expect(isFocusGuardTarget(root.querySelector(".plain"))).toBe(false);
    expect(isFocusGuardTarget(null)).toBe(false);
    root.remove();
  });
});

describe("canEnterFocus", () => {
  it("blocks entry while a confirm dialog is open", () => {
    expect(canEnterFocus(true)).toBe(false);
    expect(canEnterFocus(false)).toBe(true);
  });
});
