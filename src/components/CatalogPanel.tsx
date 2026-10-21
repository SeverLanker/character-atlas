import type { HistoryAction } from "../useLibraryHistory";
import { catalogKey, normalizeCatalogName } from "../catalog-key";
import { CatalogTransfer } from "./CatalogTransfer";
import { useEffect, useId, useMemo, useState, type KeyboardEvent } from "react";
import { emptyFilter, filterCatalog, isFiltered, pageItems, paginate, PAGE_SIZES, quickTags, readCatalogPrefs, scopeEntries, tagCounts, toggle, writeCatalogPrefs, type CatalogFilter, type CatalogSort } from "../catalog-filter";
import { uid, type CatalogEntry, type CatalogKind, type Overrides, type Profile } from "../model";

const labels: Record<CatalogKind, string> = { skill: "技能", spell: "法术", specialty: "专长", item: "物品" };
export function CatalogPanel({ entries, onChange, profile, onPatch, historyAction }: {
  historyAction?: HistoryAction;
  entries: CatalogEntry[]; onChange: (entries: CatalogEntry[]) => void;
  profile?: Profile; onPatch?: (patch: Overrides) => void;
}) {
  const worldListId = useId();
  const [filter, setFilterState] = useState<CatalogFilter>(() => emptyFilter("skill"));
  const { kind, query } = filter;
  const [page, setPage] = useState(1);
  const [prefs, setPrefs] = useState(() => readCatalogPrefs());
  useEffect(() => writeCatalogPrefs(prefs), [prefs]);
  const [tagSearch, setTagSearch] = useState("");
  const [jump, setJump] = useState("");
  const [draft, setDraft] = useState<CatalogEntry | null>(null);
  const [message, setMessage] = useState("");
  /** Any filter change returns to page 1. */
  const setFilter = (patch: Partial<CatalogFilter>) => { setFilterState(current => ({ ...current, ...patch })); setPage(1); };
  const setKind = (next: CatalogKind) => setFilter({ kind: next, query: "", tags: [] });
  const worlds = [...new Map(entries.filter(item => item.world?.trim()).map(item => [normalizeCatalogName(item.world!), item.world!])).entries()];
  const worldFilter = filter.world;
  const rows = useMemo(() => filterCatalog(entries, filter), [entries, filter]);
  const counts = useMemo(() => tagCounts(scopeEntries(entries, kind, filter.world)), [entries, kind, filter.world]);
  const quick = quickTags(counts, prefs.pinned);
  const countOf = new Map(counts.map(row => [row.tag, row.count]));
  const pickable = counts.filter(row => row.tag.toLocaleLowerCase().includes(tagSearch.trim().toLocaleLowerCase()));
  // Clamped every render, so deleting the last rows of a page or importing keeps the page valid.
  const view = paginate(rows.length, page, prefs.pageSize);
  const visible = rows.slice(view.start, view.end);
  const goto = (target: number) => setPage(paginate(rows.length, target, prefs.pageSize).page);
  const pagerKeys = (event: KeyboardEvent) => {
    if ((event.target as HTMLElement).tagName === "INPUT" || (event.target as HTMLElement).tagName === "SELECT") return;
    const target = { ArrowLeft: view.page - 1, ArrowRight: view.page + 1, Home: 1, End: view.pages }[event.key];
    if (target !== undefined) { event.preventDefault(); goto(target); }
  };
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
    <nav className="coc-filters" aria-label="条目类别">{Object.entries(labels).map(([key, label]) => <button key={key} aria-pressed={kind === key} onClick={() => { setKind(key as CatalogKind); setDraft(null); setMessage(''); }}>{label}</button>)}</nav>
    <label className="field"><span>搜索{labels[kind]}库</span><input type="search" value={query} onChange={(e) => setFilter({ query: e.target.value })} /></label>
    <div className="catalog-filters">
      <label>世界／作品 <select aria-label="筛选条目世界" value={worldFilter} onChange={e => setFilter({ world: e.target.value })}><option value="all">全部世界</option><option value="world:">全库通用</option>{worlds.map(([key, name]) => <option key={key} value={`world:${key}`}>{name}</option>)}</select></label>
      <details className="catalog-tag-picker">
        <summary>选择标签{filter.tags.length ? `（已选 ${filter.tags.length}）` : ""}</summary>
        <div className="catalog-tag-popover">
          <input type="search" aria-label="搜索标签" placeholder="搜索标签" value={tagSearch} onChange={e => setTagSearch(e.target.value)}/>
          {!pickable.length && <p className="editor-help">本类{worldFilter === "all" ? "" : "此世界"}暂无{tagSearch ? "匹配的" : ""}标签。</p>}
          <ul>{pickable.map(({ tag, count }) => <li key={tag}>
            <label><input type="checkbox" checked={filter.tags.includes(tag)} onChange={() => setFilter({ tags: toggle(filter.tags, tag) })}/>{tag}<small>{count}</small></label>
            <button type="button" className="text-button" aria-pressed={prefs.pinned.includes(tag)} aria-label={`${prefs.pinned.includes(tag) ? "取消固定" : "固定为快捷标签"} ${tag}`} onClick={() => setPrefs({ ...prefs, pinned: toggle(prefs.pinned, tag) })}>{prefs.pinned.includes(tag) ? "已固定" : "固定"}</button>
          </li>)}</ul>
        </div>
      </details>
      <label><input type="checkbox" checked={filter.favorite} onChange={e => setFilter({ favorite: e.target.checked })}/>只看收藏</label>
      <label>排序 <select aria-label="条目排序" value={filter.sort} onChange={e => setFilter({ sort: e.target.value as CatalogSort })}><option value="original">收录顺序</option><option value="name">名称排序</option><option value="favorite">收藏优先</option></select></label>
      <span>匹配 {rows.length} / 本类 {entries.filter(item => item.kind === kind).length}</span>
      {isFiltered(filter) && <button className="text-button" onClick={() => { setFilter({ ...emptyFilter(kind), sort: filter.sort }); setTagSearch(""); }}>清除筛选</button>}
    </div>
    {!!quick.length && <div className="catalog-quick-tags" role="group" aria-label="常用标签">
      <span>常用标签</span>
      {quick.map(({ tag, count, pinned }) => <button key={tag} type="button" className="catalog-chip" aria-pressed={filter.tags.includes(tag)} aria-label={`快捷标签 ${tag}`} title={pinned ? "已固定的快捷标签" : `本类 ${count} 条`} onClick={() => setFilter({ tags: toggle(filter.tags, tag) })}>{pinned && <span aria-hidden="true">📌</span>}{tag}<small>{count}</small></button>)}
    </div>}
    {!!filter.tags.length && <div className="catalog-selected-tags" role="group" aria-label="已选标签">
      <span className="catalog-tag-mode" role="group" aria-label="标签匹配方式">
        <button type="button" aria-pressed={filter.tagMode === "any"} onClick={() => setFilter({ tagMode: "any" })}>任一</button>
        <button type="button" aria-pressed={filter.tagMode === "all"} onClick={() => setFilter({ tagMode: "all" })}>全部</button>
      </span>
      {filter.tags.map(tag => <button key={tag} type="button" className="catalog-chip selected" aria-label={`移除标签 ${tag}`} onClick={() => setFilter({ tags: filter.tags.filter(item => item !== tag) })}>{tag}<small>{countOf.get(tag) ?? 0}</small><span aria-hidden="true">×</span></button>)}
    </div>}
    <button className="button small" onClick={() => setDraft({ id: uid(), kind, title: "", text: "", rank: "", common: false, world: worlds.find(([key]) => `world:${key}` === worldFilter)?.[1] ?? "" })}>新建{labels[kind]}模板</button>
    {draft && <form className="edit-entry" onSubmit={(e) => {
      e.preventDefault(); if (!draft.title.trim()) return;
      if (entries.some(item => item.id !== draft.id && catalogKey(item) === catalogKey(draft))) {
        setMessage('同类中已有同名模板，请修改名称或编辑原模板。'); return;
      }
      const saved = { ...draft, createdAt: draft.createdAt ?? new Date().toISOString(), updatedAt: new Date().toISOString(), title: draft.title.trim(), world: draft.world?.trim(), tags: [...new Set((draft.tags ?? []).map(t => t.trim()).filter(Boolean))] };
      onChange(entries.some((item) => item.id === saved.id) ? entries.map((item) => item.id === saved.id ? saved : item) : [...entries, saved]);
      if (saved.kind !== kind) setKind(saved.kind);
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
    {visible.map((item) => <article className="edit-entry" key={item.id}>
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
    {rows.length > 0 && <nav className="catalog-pager" aria-label="条目分页" onKeyDown={pagerKeys}>
      <span className="catalog-pager-range">{view.start + 1}–{view.end} / 共 {view.total} 条</span>
      <button type="button" disabled={view.page === 1} aria-label="首页" onClick={() => goto(1)}>«</button>
      <button type="button" disabled={view.page === 1} aria-label="上一页" onClick={() => goto(view.page - 1)}>‹</button>
      {pageItems(view.page, view.pages).map((item, index) => item === "…" ? <span key={`gap-${index}`} aria-hidden="true">…</span> :
        <button type="button" key={item} aria-label={`第 ${item} 页`} aria-current={item === view.page ? "page" : undefined} onClick={() => goto(item)}>{item}</button>)}
      <button type="button" disabled={view.page === view.pages} aria-label="下一页" onClick={() => goto(view.page + 1)}>›</button>
      <button type="button" disabled={view.page === view.pages} aria-label="末页" onClick={() => goto(view.pages)}>»</button>
      {view.pages > 1 && <form onSubmit={e => { e.preventDefault(); if (jump) goto(Number(jump)); setJump(""); }}><label>跳至 <input type="number" min={1} max={view.pages} inputMode="numeric" aria-label="跳转页码" value={jump} onChange={e => setJump(e.target.value)}/> 页</label></form>}
      <label>每页 <select aria-label="每页条数" value={prefs.pageSize} onChange={e => { setPrefs({ ...prefs, pageSize: Number(e.target.value) }); setPage(1); }}>{PAGE_SIZES.map(size => <option key={size} value={size}>{size}</option>)}</select> 条</label>
    </nav>}
    {profile && <details><summary>从当前角色收录{labels[kind]}</summary><p className="editor-help">只收录文字。角色物品的图片仍保存在角色内。</p>
      {source.map((item) => <div className="coc-edit-actions" key={item.id}><span>{item.title || "未命名条目"}</span><button disabled={!item.title.trim()} className="button small" onClick={() => {
        setDraft({ id: uid(), kind, title: item.title, text: item.text, rank: "rank" in item ? item.rank : "", common: "common" in item ? item.common ?? false : false });
      }}>收录为模板</button></div>)}
    </details>}
  </section>;
}
