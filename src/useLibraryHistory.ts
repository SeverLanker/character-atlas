import { useCallback, useReducer } from "react";
import type { Library } from "./model";
type Update = Library | null | ((current: Library | null) => Library | null);
export type HistoryAction = "set" | "undo" | "redo";
interface State {
  lastAction?: HistoryAction;
  current: Library | null;
  past: Library[];
  future: Library[];
  time: number;
  group: boolean;
}
type Action =
  | { type: "set"; update: Update; time: number; checkpoint: boolean }
  | { type: "undo" }
  | { type: "redo" };
export function historyReducer(state: State, action: Action): State {
  if (action.type === "undo") {
    const previous = state.past.at(-1);
    if (!previous || !state.current) return state;
    return {
      lastAction: "undo",
      current: previous,
      past: state.past.slice(0, -1),
      future: [state.current, ...state.future],
      time: 0,
      group: false,
    };
  }
  if (action.type === "redo") {
    const next = state.future[0];
    if (!next || !state.current) return state;
    return {
      lastAction: "redo",
      current: next,
      past: [...state.past, state.current].slice(-40),
      future: state.future.slice(1),
      time: 0,
      group: false,
    };
  }
  const current =
    typeof action.update === "function"
      ? action.update(state.current)
      : action.update;
  if (current === state.current) return state;
  const grouped =
    !action.checkpoint && state.group && action.time - state.time < 800;
  return {
    lastAction: "set",
    current,
    past:
      state.current && !grouped
        ? [...state.past, state.current].slice(-40)
        : state.past,
    future: [],
    time: action.time,
    group: Boolean(state.current) && !action.checkpoint,
  };
}
export function useLibraryHistory() {
  const [state, dispatch] = useReducer(historyReducer, {
    current: null,
    past: [],
    future: [],
    time: 0,
    group: false,
  });
  const set = useCallback(
    (update: Update, checkpoint = false) =>
      dispatch({ type: "set", update, time: Date.now(), checkpoint }),
    [],
  );
  const undo = useCallback(() => dispatch({ type: "undo" }), []),
    redo = useCallback(() => dispatch({ type: "redo" }), []);
  return {
    library: state.current,
    lastAction: state.lastAction,
    setLibrary: set,
    undo,
    redo,
    canUndo: !!state.past.length,
    canRedo: !!state.future.length,
  };
}
