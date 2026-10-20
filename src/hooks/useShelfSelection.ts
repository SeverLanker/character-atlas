import { useCallback, useEffect, useState } from "react";
import { emptySelection, pruneSelection, rangeSelect, selectAll, toggleSelect, type Selection } from "../batch";

/** 书架多选状态。选择始终与可见结果保持一致（看不到的角色自动移出）。 */
export function useShelfSelection(visibleIds: string[]) {
  const [selecting, setSelecting] = useState(false);
  const [selection, setSelection] = useState<Selection>(emptySelection);
  const key = visibleIds.join("|");
  useEffect(() => {
    setSelection((sel) => pruneSelection(sel, key ? key.split("|") : []));
  }, [key]);
  const exit = useCallback(() => {
    setSelecting(false);
    setSelection(emptySelection);
  }, []);
  const toggleMode = useCallback(() => {
    if (selecting) exit();
    else setSelecting(true);
  }, [selecting, exit]);
  const select = useCallback(
    (id: string, { shift }: { shift: boolean; toggle: boolean }) => {
      setSelecting(true);
      setSelection((sel) => (shift ? rangeSelect(sel, visibleIds, id) : toggleSelect(sel, id)));
    },
    [key], // visibleIds 的内容由 key 追踪
  );
  return {
    selecting,
    selectedIds: selection.ids,
    toggleMode,
    exit,
    select,
    selectAll: () => setSelection(selectAll(visibleIds)),
    clear: () => setSelection(emptySelection),
  };
}
