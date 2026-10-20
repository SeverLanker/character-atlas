import { useState } from "react";
import { Modal } from "../views/Modal";
import { uid, type CatalogEntry, type CatalogKind, type Overrides, type Profile } from "../model";

export interface PickerEntry {
  id: string;
  title: string;
  description: string;
  meta?: string;
  category?: string;
  disabled?: boolean;
}

export function LibraryPicker({ title, entries, categories, onAdd, onCustom, onClose }: {
  title: string; entries: PickerEntry[];
  categories?: { id: string; label: string }[];
  onAdd: (id: string) => void; onCustom: (category: string) => void; onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState(categories?.[0]?.id ?? "");
  const [selected, setSelected] = useState("");
  const [limit, setLimit] = useState(8);
  const tokens = query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
  const rows = entries.filter(row => (!category || row.category === category) && tokens.every(token => `${row.title} ${row.description} ${row.meta ?? ""}`.toLocaleLowerCase().includes(token)));
  const current = rows.find(row => row.id === selected && !row.disabled);
  return <Modal title={title} className="library-picker-modal" onClose={onClose}>
    <p className="editor-help">从库中选取一项，确认后添加到当前档案；添加后可独立编辑。</p>
    {categories && <nav className="coc-filters" aria-label="选择条目类别">{categories.map(item => <button type="button" key={item.id} aria-pressed={category === item.id} onClick={() => { setCategory(item.id); setSelected(""); setQuery(""); setLimit(8); }}>{item.label}</button>)}</nav>}
    <label className="picker-search">搜索库中条目<input type="search" placeholder="输入名称、说明或标签…" value={query} onChange={e => { setQuery(e.target.value); setSelected(""); setLimit(8); }}/></label>
    <p className="picker-count" role="status">找到 {rows.length} 项 · 已添加的条目不可重复选取</p>
    <div className="picker-results" aria-label="库中条目">
      {rows.slice(0, limit).map(row => <button type="button" key={row.id} className="picker-option" disabled={row.disabled} aria-pressed={selected === row.id} onClick={() => setSelected(row.id)}>
        <strong>{row.title}</strong><small>{row.disabled ? "已添加" : row.meta || "可添加"}</small>
      </button>)}
      {!rows.length && <p className="editor-help">没有匹配的条目。可换个关键词，或新建自定义记录。</p>}
      {rows.length > limit && <button type="button" className="text-button" onClick={() => setLimit(limit + 8)}>再显示 8 项（剩余 {rows.length - limit} 项）</button>}
    </div>
    <div className="picker-preview" aria-label="条目预览">{current ? <><strong>{current.title}</strong><p>{current.description || "暂无说明，添加后可补充。"}</p></> : <p>选择条目后，在这里查看完整说明。</p>}</div>
    <footer className="picker-actions"><button type="button" className="text-button" onClick={() => onCustom(category)}>新建自定义记录</button><button type="button" className="button" onClick={onClose}>取消</button><button type="button" className="button primary" disabled={!current} onClick={() => current && onAdd(current.id)}>添加选中条目</button></footer>
  </Modal>;
}

const labels: Record<CatalogKind, string> = { skill: "技能", spell: "法术", specialty: "专长", item: "物品" };
export function CatalogPicker({ mode, catalog, profile, onPatch, onClose }: {
  mode: "skills" | "items"; catalog: CatalogEntry[]; profile: Profile;
  onPatch: (patch: Overrides) => void; onClose: () => void;
}) {
  const entries = catalog.filter(row => mode === "items" ? row.kind === "item" : row.kind !== "item");
  function add(item?: CatalogEntry, category = mode === "items" ? "item" : "skill") {
    const kind = (item?.kind ?? category) as CatalogKind;
    const copy = { id: uid(), title: item?.title ?? "", text: item?.text ?? "" };
    if (kind === "item") onPatch({ items: [...profile.items, { ...copy, image: "" }] });
    else onPatch({ skills: [...profile.skills, { ...copy, kind, rank: item?.rank ?? "", common: item?.common ?? false }] });
    onClose();
  }
  return <LibraryPicker title={mode === "items" ? "从物品库添加" : "从技能、法术与专长库添加"}
    categories={mode === "skills" ? ["skill", "spell", "specialty"].map(id => ({ id, label: labels[id as CatalogKind] })) : undefined}
    entries={entries.map(row => ({ id: row.id, title: row.title, description: row.text, category: row.kind, meta: [row.rank, ...(row.tags ?? [])].filter(Boolean).join(" · "), disabled: (row.kind === "item" ? profile.items : profile.skills.filter(item => (item.kind ?? "skill") === row.kind)).some(item => item.title.trim().toLocaleLowerCase() === row.title.trim().toLocaleLowerCase()) }))}
    onAdd={id => { const item = entries.find(row => row.id === id); if (item) add(item); }} onCustom={category => add(undefined, category || "item")} onClose={onClose}/>;
}
