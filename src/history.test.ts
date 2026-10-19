import { expect, it } from "vitest";
import { historyReducer } from "./useLibraryHistory";
import { createCharacter, type Library } from "./model";
it("连续输入合并，结构操作单独撤销，撤销后新编辑丢弃重做分支", () => {
  const initial: Library = {
    schemaVersion: 2,
    characters: [createCharacter("角色")],
  };
  let s = historyReducer(
    { current: null, past: [], future: [], time: 0, group: false },
    { type: "set", update: initial, time: 1, checkpoint: false },
  );
  const named = (name: string) => (lib: Library | null) => ({
    ...lib!,
    characters: [{ ...lib!.characters[0], name }],
  });
  s = historyReducer(s, {
    type: "set",
    update: named("甲"),
    time: 100,
    checkpoint: false,
  });
  s = historyReducer(s, {
    type: "set",
    update: named("甲乙"),
    time: 200,
    checkpoint: false,
  });
  expect(s.past).toHaveLength(1);
  s = historyReducer(s, {
    type: "set",
    update: { schemaVersion: 2, characters: [] },
    time: 210,
    checkpoint: true,
  });
  s = historyReducer(s, { type: "undo" });
  expect(s.current!.characters[0].name).toBe("甲乙");
  s = historyReducer(s, { type: "undo" });
  expect(s.current!.characters[0].name).toBe("角色");
  s = historyReducer(s, { type: "redo" });
  expect(s.current!.characters[0].name).toBe("甲乙");
  s = historyReducer(s, {
    type: "set",
    update: named("另一分支"),
    time: 220,
    checkpoint: false,
  });
  expect(s.future).toHaveLength(0);
});
