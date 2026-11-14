// @vitest-environment happy-dom
import { useState } from "react";
import { afterEach, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { BodyImageEditor } from "./components/BodyImageEditor";
import { BodyDiagram } from "./components/BodyDiagram";
import type { BodyImages } from "./body";
vi.mock("./storage", () => ({ imageUrl: async (ref: string) => "blob:" + ref }));
afterEach(cleanup);
const file = new File(["test"], "art.png", { type: "image/png" });
const choose = (side: string) => fireEvent.change(screen.getByLabelText("上传" + side + "图"), { target: { files: [file] } });

it("无需 JSON 上传正背面图、切换 SVG、清除单面与恢复沿用", async () => {
  function Harness() {
    const [images, setImages] = useState<BodyImages>({ front: "", back: "" });
    return <><BodyImageEditor images={images} context="a" hidden onChange={setImages} onUpload={async () => "art.png"}
      onInherit={() => setImages({ front: "public.png", back: "" })} /><output>{JSON.stringify(images)}</output></>;
  }
  render(<Harness />); choose("正面");
  await screen.findByText("正面图已更新。");
  choose("背面"); await screen.findByText("背面图已更新。");
  fireEvent.change(screen.getByRole("combobox", { name: /身体图样式/ }), { target: { value: "diagram" } });
  expect(JSON.parse(document.querySelector("output")!.textContent!)).toEqual({ front: "art.png", back: "art.png", display: "diagram" });
  fireEvent.click(screen.getByRole("button", { name: "清除正面图" }));
  expect(JSON.parse(document.querySelector("output")!.textContent!).back).toBe("art.png");
  fireEvent.click(screen.getByRole("button", { name: "沿用公开身体图" }));
  expect(JSON.parse(document.querySelector("output")!.textContent!).front).toBe("public.png");
});

it("上传中的重复请求、图像变更、切换档案和卸载都不会造成旧结果覆盖", async () => {
  let finish!: (ref: string) => void;
  const onChange = vi.fn(), onUpload = vi.fn(() => new Promise<string>(resolve => { finish = resolve; }));
  const props = { context: "a", hidden: false, onChange, onUpload, images: { front: "old.png", back: "" } };
  const view = render(<BodyImageEditor {...props} />); choose("正面"); choose("背面");
  expect(onUpload).toHaveBeenCalledTimes(1);
  view.rerender(<BodyImageEditor {...props} images={{ front: "new.png", back: "" }} />);
  await act(async () => { finish("late.png"); });
  expect(onChange).not.toHaveBeenCalled(); expect(screen.getByRole("status").textContent).toContain("未覆盖");
  choose("正面"); view.rerender(<BodyImageEditor {...props} context="b" images={{ front: "new.png", back: "" }} />);
  await act(async () => { finish("other.png"); }); expect(onChange).not.toHaveBeenCalled();
  choose("背面"); view.unmount(); await act(async () => { finish("unmounted.png"); }); expect(onChange).not.toHaveBeenCalled();
});

it("上传失败保留原图并解除等待状态", async () => {
  const onChange = vi.fn();
  render(<BodyImageEditor context="a" hidden={false} images={{ front: "old.png", back: "" }} onChange={onChange} onUpload={async () => { throw Error("磁盘不可用"); }} />);
  choose("正面"); await screen.findByText("上传失败：磁盘不可用"); expect(onChange).not.toHaveBeenCalled();
  expect((document.querySelector("fieldset") as HTMLFieldSetElement).disabled).toBe(false);
});

it("自定义图不显示虚构参数，正背面可切换，SVG 模式不暴露保留的图片", async () => {
  const props = { images: { front: "front.png", back: "back.png" }, conditions: [], active: "全部", onSelect: vi.fn() };
  const view = render(<BodyDiagram {...props} />);
  await waitFor(() => expect(view.container.querySelector("image")?.getAttribute("href")).toBe("blob:front.png"));
  expect(screen.queryByText(/cm/)).toBeNull(); expect(view.container.querySelector(".body-region")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "背面" }));
  await waitFor(() => expect(view.container.querySelector("image")?.getAttribute("href")).toBe("blob:back.png"));
  view.rerender(<BodyDiagram {...props} images={{ ...props.images, display: "diagram" }} />);
  expect(view.container.querySelector("image")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "左腿" })); expect(props.onSelect).toHaveBeenCalledWith("左腿");
});
