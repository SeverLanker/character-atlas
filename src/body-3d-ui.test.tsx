// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { BodyDiagram } from "./components/BodyDiagram";
import { BodyImageEditor } from "./components/BodyImageEditor";
import { parseBodyValidatorJson } from "./body";
import type { ViewerOptions } from "./body3d/viewer";
const mocks = vi.hoisted(() => ({ mount: vi.fn(), view: vi.fn(), zoom: vi.fn(), update: vi.fn(), dispose: vi.fn() }));
vi.mock("./body3d/viewer", () => ({ mountBodyViewer: mocks.mount }));
vi.mock("./storage", () => ({ imageUrl: async () => "blob:art" }));
afterEach(() => { cleanup(); vi.resetAllMocks(); });
const props = { images: { front: "art.png", back: "", model: "porcelain" as const }, conditions: [], active: "全部", onSelect: vi.fn() };
const api = () => ({ view: mocks.view, zoom: mocks.zoom, update: mocks.update, dispose: mocks.dispose });

it("3D navigation, region toggles and latest record state use the same mounted viewer", async () => {
  mocks.mount.mockReturnValue(api());
  const body = parseBodyValidatorJson(JSON.stringify({ schema: "bodyval.character/1", body_type: "adult_male", height_cm: 175 }));
  const component = render(<BodyDiagram {...props} body={body} />);
  await waitFor(() => expect((screen.getByRole("button", { name: "正面" }) as HTMLButtonElement).disabled).toBe(false));
  expect(component.container.querySelector("image")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "背面" })); expect(mocks.view).toHaveBeenCalledWith("back");
  fireEvent.click(screen.getByRole("button", { name: "放大人体" })); expect(mocks.zoom).toHaveBeenCalledWith(1.2);
  fireEvent.click(screen.getByRole("button", { name: "左腿" })); expect(props.onSelect).toHaveBeenCalledWith("左腿");
  const nextSelect = vi.fn();
  component.rerender(<BodyDiagram {...props} body={{ ...body }} active="左腿" onSelect={nextSelect} />);
  expect(mocks.mount).toHaveBeenCalledOnce();
  const callbacks = mocks.mount.mock.calls[0][1] as ViewerOptions;
  callbacks.onSelect("左腿"); expect(nextSelect).toHaveBeenCalledWith("全部");
  expect(mocks.update).toHaveBeenLastCalledWith([], "左腿");
  component.unmount(); expect(mocks.dispose).toHaveBeenCalledOnce();
});
it("unavailable WebGL and context loss show the retained image fallback", async () => {
  mocks.mount.mockImplementationOnce(() => { throw Error("no WebGL"); });
  const component = render(<BodyDiagram {...props} />);
  await screen.findByText("3D 暂不可用，已显示备用人体图。");
  await waitFor(() => expect(component.container.querySelector("image")).not.toBeNull());
  expect(screen.queryByRole("button", { name: "放大人体" })).toBeNull();
  component.unmount();
  mocks.mount.mockReturnValue(api());
  render(<BodyDiagram {...props} />);
  await waitFor(() => expect(mocks.mount).toHaveBeenCalledTimes(2));
  const callbacks = mocks.mount.mock.calls[1][1] as ViewerOptions;
  act(() => callbacks.onLost());
  await screen.findByText("3D 暂不可用，已显示备用人体图。"); expect(mocks.dispose).toHaveBeenCalled();
});
it("choosing 3D preserves files and its image/SVG fallback; returning to images disables 3D", () => {
  const change = vi.fn();
  render(<BodyImageEditor images={{ front: "front.png", back: "back.png", display: "diagram" }} context="x" hidden={false} onUpload={async () => ""} onChange={change} />);
  fireEvent.change(screen.getByRole("combobox", { name: /身体图样式/ }), { target: { value: "model" } });
  expect(change).toHaveBeenLastCalledWith({ front: "front.png", back: "back.png", display: "diagram", model: "porcelain" });
  fireEvent.change(screen.getByRole("combobox", { name: /身体图样式/ }), { target: { value: "image" } });
  expect(change).toHaveBeenLastCalledWith({ front: "front.png", back: "back.png", display: "image", model: undefined });
});
