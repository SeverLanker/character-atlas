import type { HistoryAction } from "../useLibraryHistory";
import { catalogKey, normalizeCatalogName } from "../catalog-key";
import { CatalogTransfer } from "./CatalogTransfer";
import { useId, useState } from "react";
import { uid, type CatalogEntry, type CatalogKind, type Overrides, type Profile } from "../model";

const labels: Record<CatalogKind, string> = { skill: "技能", spell: "法术", specialty: "专长", item: "物品" };
export function CatalogPanel({ entries, onChange, profile, onPatch, historyAction }: {
  historyAction?: HistoryAction;
  entries: CatalogEntry[]; onChange: (entries: CatalogEntry[]) => void;
  profile?: Profile; onPatch?: (patch: Overrides) => void;
}) {
  const worldListId = useId();
  const [kind, setKind] = useState<CatalogKind>("skill");
  const [query, setQuery] = useState("");
  const [draft, setDraft] = useState<CatalogEntry | null>(null);
  const [limit, setLimit] = useState(8);
  const [message, setMessage] = useState("");
  const [tag, setTag] = useState('');
  const [onlyFavorites, setOnlyFavorites] = useState(false);
  const [worldFilter, setWorldFilter] = useState("all");
  const worlds = [...new Map(entries.filter(item => item.world?.trim()).map(item => [normalizeCatalogName(item.world!), item.world!])).entries()];
  const [sort, setSort] = useState('original');
  const tokens = query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
  const tags = [...new Set(entries.filter(item => item.kind === kind).flatMap(item => item.tags ?? []))].sort((a, b) => a.localeCompare(b, 'zh-CN'));
  const rows = entries.filter((item) => item.kind === kind && (worldFilter === "all" || `world:${normalizeCatalogName(item.world ?? "")}` === worldFilter) && (!tag || item.tags?.includes(tag)) && (!onlyFavorites || item.favorite) && tokens.every(token => `${item.title} ${item.world ?? ""} ${item.text} ${item.rank} ${(item.tags ?? []).join(' ')}`.toLocaleLowerCase().includes(token)))
    .sort((a, b) => sort === 'name' ? a.title.localeCompare(b.title, 'zh-CN') : sort === 'favorite' ? Number(!!b.favorite) - Number(!!a.favorite) : 0);
  const source = !profile ? [] : kind === "item" ? profile.items : profile.skills.filter((item) => (item.kind ?? "skill") === kind);
  const alreadyAdded = (item: CatalogEntry) => !!profile && (item.kind === 'item' ? profile.items : profile.skills.filter(row => (row.kind ?? 'skill') === item.kind)).some(row => normalizeCatalogName(row.title) === normalizeCatalogName(item.title));
  function applyEntry(item: CatalogEntry) {
    if (!profile || !onPatch || alreadyAdded(item)) return;
    if (item.kind === "item") onPatch({ items: [...profile.items, { id: uid(), title: item.title, text: item.text, image: "" }] });
    else onPatch({ skills: [...profile.skills, { id: uid(), title: item.title, text: item.text, rank: item.rank, kind: item.kind, common: item.common }] });
    setMessage(`已将“${item.title}”复制到当前版本${item.kind === "item" ? "的收藏与影像" : "的属性与技能"}。`);
  }
  return <section aria-label="共享条目库" className="catalog-panel">
    <h3>技能、法术、专长与物品库</h3>
    <p className="editor-help">全库角色共用，随完整备份保存。添加到角色时复制为独立条目，后续修改互不影响。数值技能使用属性页的规则技能选取器；这里保存可复用的文字设定。</p>
    <CatalogTransfer historyAction={historyAction} entries={entries} kind={kind} onChange={onChange}/>
    <nav className="coc-filters" aria-label="条目类别">{Object.entries(labels).map(([key, label]) => <button key={key} aria-pressed={kind === key} onClick={() => { setKind(key as CatalogKind); setQuery(""); setTag(''); setLimit(8); setDraft(null); setMessage(''); }}>{label}</button>)}</nav>
    <label className="field"><span>搜索{labels[kind]}库</span><input type="search" value={query} onChange={(e) => { setQuery(e.target.value); setLimit(8); }} /></label>
    <div className="catalog-filters">
      <label>世界／作品 <select aria-label="筛选条目世界" value={worldFilter} onChange={e => { setWorldFilter(e.target.value); setLimit(8); }}><option value="all">全部世界</option><option value="world:">全库通用</option>{worlds.map(([key, name]) => <option key={key} value={`world:${key}`}>{name}</option>)}</select></label>
      <label>标签 <select aria-label="筛选条目标签" value={tag} onChange={e => { setTag(e.target.value); setLimit(8); }}><option value="">全部标签</option>{tags.map(t => <option key={t} value={t}>{t}</option>)}</select></label>
      <label><input type="checkbox" checked={onlyFavorites} onChange={e => { setOnlyFavorites(e.target.checked); setLimit(8); }}/>只看收藏</label>
      <label>排序 <select aria-label="条目排序" value={sort} onChange={e => { setSort(e.target.value); setLimit(8); }}><option value="original">收录顺序</option><option value="name">名称排序</option><option value="favorite">收藏优先</option></select></label>
      <span>匹配 {rows.length} / 本类 {entries.filter(item => item.kind === kind).length}</span>
      {(query || tag || onlyFavorites || worldFilter !== "all") && <button className="text-button" onClick={() => { setQuery(''); setTag(''); setOnlyFavorites(false); setWorldFilter('all'); setLimit(8); }}>清除筛选</button>}
    </div>
    <button className="button small" onClick={() => setDraft({ id: uid(), kind, title: "", text: "", rank: "", common: false, world: worlds.find(([key]) => `world:${key}` === worldFilter)?.[1] ?? "" })}>新建{labels[kind]}模板</button>
    {draft && <form className="edit-entry" onSubmit={(e) => {
      e.preventDefault(); if (!draft.title.trim()) return;
      if (entries.some(item => item.id !== draft.id && catalogKey(item) === catalogKey(draft))) {
        setMessage('同类中已有同名模板，请修改名称或编辑原模板。'); return;
      }
      const saved = { ...draft, createdAt: draft.createdAt ?? new Date().toISOString(), updatedAt: new Date().toISOString(), title: draft.title.trim(), world: draft.world?.trim(), tags: [...new Set((draft.tags ?? []).map(t => t.trim()).filter(Boolean))] };
      onChange(entries.some((item) => item.id === saved.id) ? entries.map((item) => item.id === saved.id ? saved : item) : [...entries, saved]);
      if (saved.kind !== kind) { setKind(saved.kind); setTag(''); setQuery(''); }
      setDraft(null); setMessage("模板已保存。");
    }}>
      <label className="field"><span>模板名称</span><input required value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} /></label>
      <label className="field"><span>模板类别</span><select value={draft.kind} onChange={e => setDraft({ ...draft, kind: e.target.value as CatalogKind })}>{Object.entries(labels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
      <label className="field"><span>世界／作品</span><input aria-label="模板世界／作品" maxLength={200} list={worldListId} value={draft.world ?? ""} placeholder="留空表示全库通用" onChange={e => setDraft({ ...draft, world: e.target.value })}/><datalist id={worldListId}>{worlds.map(([key, name]) => <option key={key} value={name}/>)}</datalist></label>
      <label className="field"><span>模板标签（逗号分隔）</span><input maxLength={1000} value={(draft.tags ?? []).join(',')} onChange={e => setDraft({ ...draft, tags: e.target.value.split(/[,，]/).slice(0, 50).map(t => t.slice(0, 100)) })}/></label>
      <label className="field"><span>模板内容</span><textarea rows={4} value={draft.text} onChange={(e) => setDraft({ ...draft, text: e.target.value })} /></label>
      {draft.kind !== "item" && <><label className="field"><span>模板等级</span><input value={draft.rank} onChange={(e) => setDraft({ ...draft, rank: e.target.value })} /></label>
        <label><input type="checkbox" checked={draft.common} onChange={(e) => setDraft({ ...draft, common: e.target.checked })} /> 通用能力（阅读默认收起）</label></>}
      <div className="coc-edit-actions"><button className="button primary small">保存模板</button><button type="button" className="button small" onClick={() => setDraft(null)}>取消</button></div>
    </form>}
    <p role="status">{message}</p>
    {rows.slice(0, limit).map((item) => <article className="edit-entry" key={item.id}>
      <h4>{item.title} <small>{item.rank}</small></h4>
      <div className="catalog-tags"><span>{item.world || "全库通用"}</span>{(item.tags ?? []).map((t, i) => <span key={i}>{t}</span>)}{item.common && <span>通用</span>}</div>
      {item.text.length > 200 ? <details><summary>查看说明 · {item.text.length} 字</summary><p className="catalog-description">{item.text}</p></details> : <p className="catalog-description">{item.text}</p>}
      <div className="coc-edit-actions">{profile && onPatch && <button disabled={alreadyAdded(item)} className="button small" onClick={() => applyEntry(item)}>{alreadyAdded(item) ? '已有同名条目' : '添加到当前版本'}</button>}
        <button className="text-button" aria-label={`${item.favorite ? '取消收藏' : '收藏'}模板 ${item.title}`} aria-pressed={!!item.favorite} onClick={() => onChange(entries.map(row => row.id === item.id ? { ...row, favorite: !row.favorite } : row))}>{item.favorite ? '★ 已收藏' : '☆ 收藏'}</button>
        <button className="button small" onClick={() => setDraft({ ...item })}>编辑模板</button>
        <button className="button small" onClick={() => { setDraft({ ...item, id: uid(), title: item.title + ' · 副本', tags: [...(item.tags ?? [])] }); setMessage('复制为新模板，保存后生效。'); }}>复制模板</button>
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
