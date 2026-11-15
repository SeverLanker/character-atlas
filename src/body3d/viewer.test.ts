// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from "vitest";
import { fireEvent } from "@testing-library/react";
import { mountBodyViewer } from "./viewer";
import type { Scene, Camera } from "three";

const mocks = vi.hoisted(() => ({ renders: vi.fn(), dispose: vi.fn(), lose: vi.fn(), disconnect: vi.fn(), fail: false }));
vi.mock("three", async original => {
  const actual = await original<typeof import("three")>();
  return { ...actual, WebGLRenderer: class {
    domElement = document.createElement("canvas"); outputColorSpace = "";
    setPixelRatio() {} setClearColor() {} setSize() {}
    render(scene: Scene, camera: Camera) { mocks.renders(scene, camera); }
    dispose = mocks.dispose; forceContextLoss = mocks.lose;
  } };
});
afterEach(() => { document.body.innerHTML = ""; vi.unstubAllGlobals(); vi.clearAllMocks(); mocks.fail = false; });

function setup() {
  let frame: FrameRequestCallback | undefined;
  vi.stubGlobal("requestAnimationFrame", vi.fn(callback => { frame = callback; return 1; }));
  vi.stubGlobal("cancelAnimationFrame", vi.fn(() => { frame = undefined; }));
  vi.stubGlobal("ResizeObserver", class {
    constructor() { if (mocks.fail) throw Error("resize failed"); }
    observe() {} disconnect = mocks.disconnect;
  });
  const host = document.createElement("div"); document.body.append(host);
  const onSelect = vi.fn(), onHover = vi.fn(), onLost = vi.fn();
  const viewer = mountBodyViewer(host, { onSelect, onHover, onLost });
  const canvas = host.querySelector("canvas")!;
  vi.spyOn(canvas, "getBoundingClientRect").mockReturnValue({ x: 0, y: 0, top: 0, left: 0, bottom: 480, right: 320, width: 320, height: 480, toJSON() {} });
  return { host, canvas, viewer, onSelect, onHover, onLost, flush() { const pending = frame; frame = undefined; pending?.(0); } };
}

it("real camera and raycasting select front/back, drags and multitouch do not click, frames are demand-only", () => {
  const x = setup();
  x.flush(); expect(mocks.renders).toHaveBeenCalledOnce(); x.flush(); expect(mocks.renders).toHaveBeenCalledOnce();
  const click = () => { fireEvent.pointerDown(x.canvas, { pointerId: 1, button: 0, clientX: 160, clientY: 150 }); fireEvent.pointerUp(x.canvas, { pointerId: 1, button: 0, clientX: 160, clientY: 150 }); };
  click(); expect(x.onSelect).toHaveBeenLastCalledWith("胸部");
  x.viewer.view("back"); x.flush(); click(); expect(x.onSelect).toHaveBeenLastCalledWith("背部");
  x.onSelect.mockClear();
  fireEvent.pointerDown(x.canvas, { pointerId: 2, button: 0, clientX: 160, clientY: 190 });
  fireEvent.pointerMove(x.canvas, { pointerId: 2, buttons: 1, clientX: 180, clientY: 190 });
  fireEvent.pointerUp(x.canvas, { pointerId: 2, clientX: 160, clientY: 190 }); expect(x.onSelect).not.toHaveBeenCalled();
  fireEvent.pointerDown(x.canvas, { pointerId: 3, pointerType: "touch", button: 0, clientX: 160, clientY: 190, pageX: 160, pageY: 190 });
  fireEvent.pointerDown(x.canvas, { pointerId: 4, pointerType: "touch", button: 0, clientX: 161, clientY: 190, pageX: 161, pageY: 190 });
  fireEvent.pointerUp(x.canvas, { pointerId: 4, pointerType: "touch", clientX: 161, clientY: 190 });
  fireEvent.pointerUp(x.canvas, { pointerId: 3, pointerType: "touch", clientX: 160, clientY: 190 }); expect(x.onSelect).not.toHaveBeenCalled();
  x.viewer.dispose(); x.viewer.dispose();
  expect(mocks.dispose).toHaveBeenCalledOnce(); expect(mocks.lose).toHaveBeenCalledOnce(); expect(mocks.disconnect).toHaveBeenCalledOnce();
  expect(x.host.querySelector("canvas")).toBeNull();
  click(); expect(x.onSelect).not.toHaveBeenCalled();
});
it("context loss reports fallback; failed setup frees an already-created renderer", () => {
  const x = setup();
  fireEvent(x.canvas, new Event("webglcontextlost", { cancelable: true })); expect(x.onLost).toHaveBeenCalledOnce();
  x.viewer.dispose(); mocks.dispose.mockClear(); mocks.fail = true;
  expect(() => mountBodyViewer(document.createElement("div"), { onSelect() {}, onHover() {}, onLost() {} })).toThrow("resize failed");
  expect(mocks.dispose).toHaveBeenCalledOnce();
});
