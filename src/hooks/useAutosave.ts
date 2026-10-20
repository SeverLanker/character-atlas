import { useCallback, useEffect, useRef, useState } from "react";
import { saveLibrary } from "../storage";
import type { Library } from "../model";

/** 自动保存的防抖间隔。连续输入在此间隔内只写一次资料库。 */
export const AUTOSAVE_DELAY_MS = 400;

let saveChain: Promise<void> = Promise.resolve();
/** 串行保存队列：每次保存都等待上一次完成（无论成败）后再写入。 */
export function queueSave(library: Library, forceSnapshot = false): Promise<void> {
  const job = saveChain.catch(() => {}).then(() => saveLibrary(library, forceSnapshot));
  saveChain = job;
  return job;
}
/** 当前保存队列末尾；与原先 `await saveChain` 语义相同（失败时会 reject）。 */
export function pendingSaves(): Promise<void> {
  return saveChain;
}

export type SaveState = "saving" | "saved" | "error";

/**
 * library 变化后延迟 AUTOSAVE_DELAY_MS 写入。
 * flush() 立即把尚未写入的最新资料加入队列并等待队列完成；force 为 true 时即使没有待写内容也再写一次最新资料。
 * 卸载时若仍有待写内容，会立即入队，不丢失编辑。
 */
export function useAutosave(library: Library | null) {
  const [saveState, setSaveState] = useState<SaveState>("saved");
  const [saveError, setSaveError] = useState("");
  const latest = useRef<Library | null>(library);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const dirty = useRef(false);
  const serial = useRef(0);
  const mounted = useRef(true);
  latest.current = library;

  const commit = useCallback((): Promise<void> => {
    clearTimeout(timer.current);
    timer.current = undefined;
    dirty.current = false;
    const value = latest.current;
    if (!value) return pendingSaves();
    const id = ++serial.current;
    const job = queueSave(value);
    job.then(
      () => {
        if (mounted.current && serial.current === id && latest.current === value && !dirty.current) {
          setSaveState("saved");
          setSaveError("");
        }
      },
      (error) => {
        if (mounted.current && serial.current === id && latest.current === value && !dirty.current) {
          setSaveState("error");
          setSaveError(String(error));
        }
      },
    );
    return job;
  }, []);

  useEffect(() => {
    if (!library) return;
    dirty.current = true;
    setSaveState("saving");
    clearTimeout(timer.current);
    timer.current = setTimeout(() => void commit().catch(() => {}), AUTOSAVE_DELAY_MS);
  }, [library, commit]);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      if (dirty.current) void commit().catch(() => {});
    };
  }, [commit]);

  const flush = useCallback(
    (force = false): Promise<void> => (dirty.current || force ? commit() : pendingSaves()),
    [commit],
  );
  return { saveState, saveError, flush };
}
