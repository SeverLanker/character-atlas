// @vitest-environment happy-dom
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { useLibraryHistory, historyReducer } from "./useLibraryHistory";
import type { Library } from "./model";
afterEach(cleanup);

it("Agent 锁期间排队的界面修改在接口提交后应用，不丢失或覆盖接口写入", () => {
  const { result } = renderHook(useLibraryHistory);
  const initial: Library = { schemaVersion: 2, characters: [], catalog: [] };
  act(() => result.current.setLibrary(initial));
  let release: () => void = () => {};
  act(() => { release = result.current.lock(); });
  act(() => result.current.setLibrary(lib => ({ ...lib!, characters: [] }), true));
  expect(result.current.getState().current).toBe(initial);
  const state = result.current.getState();
  const entry = { id: "agent", title: "API 写入", kind: "skill" as const, rank: "", text: "", common: false };
  act(() => result.current.publish(historyReducer(state, { type: "set", update: { ...initial, catalog: [entry] }, time: 100, checkpoint: true })));
  act(() => release());
  expect(result.current.library!.catalog).toEqual([entry]);
  expect(result.current.getState().past).toHaveLength(2);
  act(() => result.current.undo());
  expect(result.current.library!.catalog).toEqual([entry]);
  act(() => result.current.undo());
  expect(result.current.library).toEqual(initial);
});
