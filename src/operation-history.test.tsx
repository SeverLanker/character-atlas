// @vitest-environment happy-dom
import { afterEach, expect, it } from "vitest";
import { act, cleanup, fireEvent, render, renderHook, screen } from "@testing-library/react";
import { createCharacter, type Library } from "./model";
import { historyReducer, useLibraryHistory, type HistoryState } from "./useLibraryHistory";
import { markOperation, operationHistory } from "./history-labels";
import { OperationHistory } from "./components/OperationHistory";
afterEach(cleanup);
it("记录界面与 Agent 来源，撤销重做保留含义，新编辑清空重做分支，不进入备份", () => {
  const initial: Library = { schemaVersion: 2, characters: [] };
  let state: HistoryState = { current: initial, past: [], future: [], time: 0, group: false };
  const next = { ...initial, characters: [createCharacter("角色甲")] };
  state = historyReducer(state, { type: "set", update: next, checkpoint: true, time: 1 });
  markOperation(next, initial, "agent", 1);
  expect(operationHistory(state).undo[0]).toMatchObject({ source: "agent", label: "角色变动：新增 1、移除 0" });
  state = historyReducer(state, { type: "undo" });
  expect(operationHistory(state).redo[0].source).toBe("agent");
  state = historyReducer(state, { type: "redo" });
  expect(operationHistory(state).undo[0].source).toBe("agent");
  state = historyReducer(state, { type: "undo" });
  state = historyReducer(state, { type: "set", update: { ...initial, characters: [createCharacter("乙")] }, checkpoint: true, time: 2 });
  expect(operationHistory(state).redo).toEqual([]); expect(operationHistory(state).undo[0].source).toBe("ui");
  expect(JSON.stringify(next)).not.toContain("source\":\"agent");
});
it("设置中可看下一步含义并撤销，不显示角色正文", () => {
  const { result } = renderHook(useLibraryHistory);
  const library: Library = { schemaVersion: 2, characters: [createCharacter("测试")] };
  library.characters[0].versions[0].profile.summary = "正文不应进入操作记录";
  act(() => result.current.setLibrary(library));
  act(() => result.current.setLibrary({ ...library, characters: [{ ...library.characters[0], name: "新名字" }] }, true));
  const view = render(<OperationHistory history={result.current} disabled={false}/>);
  expect(screen.queryByText("正文不应进入操作记录")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "撤销：编辑角色「新名字」" }));
  view.rerender(<OperationHistory history={result.current} disabled={false}/>);
  expect(result.current.library?.characters[0].name).toBe("测试");
  expect(screen.getByRole("button", { name: "重做：编辑角色「新名字」" })).toBeTruthy();
});
