import { useEffect, type Dispatch, type SetStateAction } from "react";
import { pageMeta, type Page } from "../model";

export interface AppKeyboardOptions {
  editing: boolean;
  modal: unknown;
  confirm: unknown;
  preview: unknown;
  shelf: boolean;
  busy: boolean;
  undo: () => void;
  redo: () => void;
  setConfirm: (value: null) => void;
  setPreview: (value: null) => void;
  setModal: (value: null) => void;
  setEditing: (value: boolean) => void;
  setPage: Dispatch<SetStateAction<Page>>;
}

/** 全局快捷键：Esc 关闭层级、Ctrl+Z / Ctrl+Y 撤销重做、← → 翻页。逻辑自 App.tsx 原样迁出。 */
export function useAppKeyboard({
  editing, modal, confirm, preview, shelf, busy, undo, redo,
  setConfirm, setPreview, setModal, setEditing, setPage,
}: AppKeyboardOptions) {
  useEffect(() => {
    function key(e: KeyboardEvent) {
      if (e.key === "Escape" && !busy) {
        if (confirm) setConfirm(null);
        else if (preview) setPreview(null);
        else if (modal) setModal(null);
        else if (editing) setEditing(false);
        return;
      }
      const element = e.target as HTMLElement;
      if (
        (e.ctrlKey || e.metaKey) &&
        !element.matches("input,textarea,select,[contenteditable]")
      ) {
        if (e.key.toLowerCase() === "z" || e.key.toLowerCase() === "y") {
          e.preventDefault();
          if (e.shiftKey || e.key.toLowerCase() === "y") redo();
          else undo();
          return;
        }
      }
      if (
        editing ||
        modal ||
        confirm ||
        preview ||
        shelf ||
        element.matches("input,textarea,select,[contenteditable]")
      )
        return;
      if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
        e.preventDefault();
        setPage((current) => {
          const index = pageMeta.findIndex((p) => p.id === current);
          return pageMeta[
            Math.max(
              0,
              Math.min(
                pageMeta.length - 1,
                index + (e.key === "ArrowRight" ? 1 : -1),
              ),
            )
          ].id;
        });
      }
    }
    document.addEventListener("keydown", key);
    return () => document.removeEventListener("keydown", key);
  }, [editing, modal, confirm, preview, shelf, busy, undo, redo]);
}
