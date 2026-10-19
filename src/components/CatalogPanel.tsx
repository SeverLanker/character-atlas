import { useState } from "react";
import { uid, type CatalogEntry, type CatalogKind, type Overrides, type Profile } from "../model";

const labels: Record<CatalogKind, string> = { skill: "技能", spell: "法术", specialty: "专长", item: "物品" };
export function CatalogPanel({ entries, onChange, profile, onPatch }: {
  entries: CatalogEntry[]; onChange: (entries: CatalogEntry[]) => void;
  profile?: Profile; onPatch?: (patch: Overrides) => void;
}) {
  const [kind, setKind] = useState<CatalogKind>("skill");
  const [query, setQuery] = useState("");
  const [draft, setDraft] = useState<CatalogEntry | null>(null);
  const [limit, setLimit] = useState(8);
  const [message, setMessage] = useState("");
  const rows = entries.filter((item) => item.kind === kind && `${item.title} ${item.text}`.includes(query.trim()));
  const source = !profile ? [] : kind === "item" ? profile.items : profile.skills.filter((item) => (item.kind ?? "skill") === kind);
  function useEntry(item: CatalogEntry) {
    if (!profile || !onPatch) return;
    if (item.kind === "item") onPatch({ items: [...profile.items, { id: uid(), title: item.title, text: item.text, image: "" }] });
    else onPatch({ skills: [...profile.skills, { id: uid(), title: item.title, text: item.text, rank: item.rank, kind: item.kind, common: item.common }] });
    setMessage(`已将“${item.title}”复制到当前版本${item.kind === "item" ? "的收藏与影像" : "的属性与技能"}。`);
  }
  return <section aria-label="共享条目库" className="catalog-panel">
    <h3>技能、法术、专长与物品库</h3>
    <p className="editor-help">全库角色共用，随完整备份保存。添加到角色时复制为独立条目，后续修改互不影响。数值技能使用属性页的规则技能选取器；这里保存可复用的文字设定。</p>
    <nav className="coc-filters" aria-label="条目类别">{Object.entries(labels).map(([key, label]) => <button key={key} aria-pressed={kind === key} onClick={() => { setKind(key as CatalogKind); setQuery(""); setLimit(8); setDraft(null); }}>{label}</button>)}</nav>
    <label className="field"><span>搜索{labels[kind]}库</span><input type="search" value={query} onChange={(e) => { setQuery(e.target.value); setLimit(8); }} /></label>
    <button className="button small" onClick={() => setDraft({ id: uid(), kind, title: "", text: "", rank: "", common: false })}>新建{labels[kind]}模板</button>
    {draft && <form className="edit-entry" onSubmit={(e) => {
      e.preventDefault(); if (!draft.title.trim()) return;
      const saved = { ...draft, title: draft.title.trim() };
      onChange(entries.some((item) => item.id === saved.id) ? entries.map((item) => item.id === saved.id ? saved : item) : [...entries, saved]);
      setDraft(null); setMessage("模板已保存。");
    }}>
      <label className="field"><span>模板名称</span><input required value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} /></label>
      <label className="field"><span>模板内容</span><textarea rows={4} value={draft.text} onChange={(e) => setDraft({ ...draft, text: e.target.value })} /></label>
      {kind !== "item" && <><label className="field"><span>模板等级</span><input value={draft.rank} onChange={(e) => setDraft({ ...draft, rank: e.target.value })} /></label>
        <label><input type="checkbox" checked={draft.common} onChange={(e) => setDraft({ ...draft, common: e.target.checked })} /> 通用能力（阅读默认收起）</label></>}
      <div className="coc-edit-actions"><button className="button primary small">保存模板</button><button type="button" className="button small" onClick={() => setDraft(null)}>取消</button></div>
    </form>}
    <p role="status">{message}</p>
    {rows.slice(0, limit).map((item) => <article className="edit-entry" key={item.id}>
      <h4>{item.title} <small>{item.rank}</small></h4><p className="catalog-description">{item.text}</p>
      <div className="coc-edit-actions">{profile && onPatch && <button className="button small" onClick={() => useEntry(item)}>添加到当前版本</button>}
        <button className="button small" onClick={() => setDraft({ ...item })}>编辑模板</button>
        <button className="text-button" onClick={() => onChange(entries.filter((row) => row.id !== item.id))}>删除模板</button></div>
    </article>)}
    {!rows.length && <p className="editor-empty">{profile ? "暂无匹配模板，可新建或从当前角色收录。" : "暂无匹配模板，点击上方新建开始整理。"}</p>}
    {rows.length > limit && <button className="button small" onClick={() => setLimit(limit + 8)}>再显示 8 个模板</button>}
    {profile && <details><summary>从当前角色收录{labels[kind]}</summary><p className="editor-help">只收录文字。角色物品的图片仍保存在角色内。</p>
      {source.map((item) => <div className="coc-edit-actions" key={item.id}><span>{item.title || "未命名条目"}</span><button disabled={!item.title.trim()} className="button small" onClick={() => {
        setDraft({ id: uid(), kind, title: item.title, text: item.text, rank: "rank" in item ? item.rank : "", common: "common" in item ? item.common ?? false : false });
      }}>收录为模板</button></div>)}
    </details>}
  </section>;
}
