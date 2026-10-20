// @vitest-environment happy-dom
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Library } from "./model";
import { saveLibrary } from "./storage";

const saved: Library[] = [];
vi.mock("./storage", () => ({
  saveLibrary: vi.fn(async (library: Library) => { saved.push(library); }),
}));
const { useAutosave, AUTOSAVE_DELAY_MS } = await import("./hooks/useAutosave");
const lib = (n: number): Library => ({ schemaVersion: 2, characters: [], catalog: [{ id: String(n), title: "", text: "", kind: "skill", rank: "", common: false }] });

describe("自动保存防抖", () => {
  beforeEach(() => { saved.length = 0; vi.mocked(saveLibrary).mockReset().mockImplementation(async library => { saved.push(library); }); vi.useFakeTimers(); });
  afterEach(() => { cleanup(); vi.useRealTimers(); });

  it("连续修改在防抖间隔内只写入最后一份资料", async () => {
    const { result, rerender } = renderHook(({ value }) => useAutosave(value), { initialProps: { value: lib(1) } });
    rerender({ value: lib(2) });
    rerender({ value: lib(3) });
    expect(result.current.saveState).toBe("saving");
    expect(saved).toHaveLength(0);
    await act(async () => { await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS + 10); });
    expect(saved.map((l) => l.catalog![0].id)).toEqual(["3"]);
    expect(result.current.saveState).toBe("saved");
  });

  it("flush 立即写入待保存资料，关闭前不丢编辑", async () => {
    const { result, rerender } = renderHook(({ value }) => useAutosave(value), { initialProps: { value: lib(1) } });
    rerender({ value: lib(2) });
    await act(async () => { await result.current.flush(); });
    expect(saved.map((l) => l.catalog![0].id)).toEqual(["2"]);
    await act(async () => { await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS * 2); });
    expect(saved).toHaveLength(1);
    await act(async () => { await result.current.flush(true); });
    expect(saved).toHaveLength(2);
  });

  it("卸载时仍有待写内容会立即入队", async () => {
    const { rerender, unmount } = renderHook(({ value }) => useAutosave(value), { initialProps: { value: lib(1) } });
    rerender({ value: lib(5) });
    unmount();
    await vi.runAllTimersAsync();
    expect(saved.map((l) => l.catalog![0].id)).toEqual(["5"]);
  });
});


describe("自动保存中的迟到结果", () => {
  beforeEach(() => { saved.length = 0; vi.mocked(saveLibrary).mockReset().mockImplementation(async library => { saved.push(library); }); vi.useFakeTimers(); });
  afterEach(() => { cleanup(); vi.useRealTimers(); });

  it("前一次写入完成时，新编辑仍待防抖保存，不能提前显示已保存", async () => {
    let complete!: () => void;
    vi.mocked(saveLibrary).mockImplementationOnce(() => new Promise<void>(resolve => { complete = resolve; }));
    const { result, rerender } = renderHook(({ value }) => useAutosave(value), { initialProps: { value: lib(10) } });
    await act(async () => { await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS); });
    rerender({ value: lib(11) });
    await act(async () => { complete(); });
    expect(result.current.saveState).toBe("saving");
    expect(result.current.saveError).toBe("");
    await act(async () => { await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS); });
    expect(result.current.saveState).toBe("saved");
    expect(saved.map(value => value.catalog![0].id)).toEqual(["11"]);
  });

  it("旧写入失败不能覆盖新编辑的保存状态，后续写入仍可成功", async () => {
    let fail!: (error: Error) => void;
    vi.mocked(saveLibrary).mockImplementationOnce(() => new Promise<void>((_, reject) => { fail = reject; }));
    const { result, rerender } = renderHook(({ value }) => useAutosave(value), { initialProps: { value: lib(20) } });
    await act(async () => { await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS); });
    rerender({ value: lib(21) });
    await act(async () => { fail(new Error("旧写入失败")); });
    expect(result.current.saveState).toBe("saving");
    expect(result.current.saveError).toBe("");
    await act(async () => { await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS); });
    expect(result.current.saveState).toBe("saved");
    expect(saved.map(value => value.catalog![0].id)).toEqual(["21"]);
  });
});
