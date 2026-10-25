import { useRef, useState } from "react";
import { uid, validateLibrary, type CatalogEntry } from "../model";
export const CATALOG_DRAFT_KEY = "atlas.catalog.draft.v1";
interface Draft { entry: CatalogEntry; base: CatalogEntry | null }
let emergency: Draft | null = null;
export const catalogDraftNeedsAttention = () => emergency !== null;
function readDraft(): Draft | null {
  if (emergency) return emergency;
  try {
    const text = localStorage.getItem(CATALOG_DRAFT_KEY);
    if (!text || text.length > 1048576) return null;
    const data = JSON.parse(text) as Draft;
    validateLibrary({ schemaVersion: 2, characters: [], catalog: [data.entry] });
    if (data.base !== null) validateLibrary({ schemaVersion: 2, characters: [], catalog: [data.base] });
    return data;
  } catch { return null; }
}
/** A template draft is saved synchronously, separately from the real catalog. */
export function useCatalogDraft(entries: CatalogEntry[]) {
  const [pending, setPending] = useState(readDraft), [draft, setActive] = useState<CatalogEntry | null>(null), [draftError, setError] = useState("");
  const record = useRef<Draft | null>(pending);
  function persist(data: Draft) {
    record.current = data;
    try {
      const text = JSON.stringify(data);
      if (text.length > 1048576) throw Error("草稿超过 1 MB");
      localStorage.setItem(CATALOG_DRAFT_KEY, text); emergency = null; setError("");
    } catch { emergency = data; setError("草稿未能保存到本机，暂存于内存中。请先保存模板或复制内容，再关闭程序。"); }
  }
  function setDraft(next: CatalogEntry | null) {
    if (!next) {
      record.current = null; emergency = null; setActive(null); setPending(null); setError("");
      try { localStorage.removeItem(CATALOG_DRAFT_KEY); } catch { setError("旧草稿未能从本机清理，下次恢复前请核对内容。"); }
      return;
    }
    if (record.current && record.current.entry.id !== next.id) { setError("已有未保存草稿，请先保存、恢复或丢弃，避免覆盖。"); return; }
    const base = record.current ? record.current.base : entries.find(row => row.id === next.id) ?? null;
    persist({ entry: next, base }); setActive(next); setPending(null);
  }
  function canSave() {
    const base = record.current?.base, stored = entries.find(row => row.id === draft?.id);
    if (base ? JSON.stringify(stored) !== JSON.stringify(base) : !!stored) {
      setError("原模板已被修改或移除，不能覆盖。草稿仍保留，可另存为新模板。"); return false;
    }
    return true;
  }
  return { draft, pending, draftError, setDraft, canSave,
    parkDraft: () => { setPending(record.current); setActive(null); },
    restoreDraft: () => { if (record.current) { setActive(record.current.entry); setPending(null); } },
    forkDraft: () => {
      if (!draft) return;
      const entry = { ...draft, id: uid(), title: draft.title + " · 草稿副本" };
      persist({ entry, base: null }); setActive(entry);
    },
  };
}
