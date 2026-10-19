import { useMemo, useState } from "react";
import type { Library } from "../model";
import { buildSearchIndex, searchDocuments, type SearchHit } from "../search";

function Highlight({ text, query }: { text: string; query: string }) {
  const parts: React.ReactNode[] = [];
  const needle = query.trim().toLocaleLowerCase();
  let start = 0;
  while (needle && start < text.length) {
    const index = text.toLocaleLowerCase().indexOf(needle, start);
    if (index < 0) break;
    parts.push(text.slice(start, index), <mark key={index}>{text.slice(index, index + needle.length)}</mark>);
    start = index + needle.length;
  }
  parts.push(text.slice(start));
  return <>{parts}</>;
}
export function LibrarySearch({ library, onOpen }: { library: Library; onOpen: (hit: SearchHit) => void }) {
  const [query, setQuery] = useState("");
  const [secret, setSecret] = useState(false);
  const [limit, setLimit] = useState(10);
  const [expanded, setExpanded] = useState<string[]>([]);
  const index = useMemo(() => buildSearchIndex(library, secret), [library, secret]);
  const groups = useMemo(() => searchDocuments(index, query), [index, query]);
  return <section className="library-search" aria-label="跨角色内容检索">
    <h2>跨角色内容检索</h2>
    <label className="field"><span>搜索全部角色档案内容</span><input type="search" value={query} placeholder="输入人物、经历、物品或记录中的词…" onChange={(e) => { setQuery(e.target.value); setLimit(10); setExpanded([]); }} /></label>
    <label><input type="checkbox" checked={secret} onChange={(e) => { setSecret(e.target.checked); setLimit(10); setExpanded([]); }} /> 包含已启用的秘密档案（可能揭示剧情）</label>
    {query.trim() && <>
      <p role="status">找到 {groups.length} 个角色中的匹配内容</p>
      {groups.slice(0, limit).map((group) => <article className="search-group" key={group.characterId}>
        <h3>{group.name} <small>{group.total} 处命中</small></h3>
        {group.hits.slice(0, expanded.includes(group.characterId) ? 20 : 3).map((hit, i) => <button className="search-result" key={i} onClick={() => onOpen(hit)}>
          <small>{hit.versionName} · {hit.hidden ? "秘密档案" : "明档"} · {hit.field}</small>
          <span><Highlight text={hit.snippet} query={query} /></span>
        </button>)}
        {group.total > 3 && !expanded.includes(group.characterId) && <button className="text-button" onClick={() => setExpanded([...expanded, group.characterId])}>展开此角色命中片段</button>}
        {group.total > 20 && expanded.includes(group.characterId) && <p className="editor-help">此角色仅显示前 20 处，请缩小关键词范围。</p>}
      </article>)}
      {groups.length > limit && <button className="button small" onClick={() => setLimit(limit + 10)}>再显示 10 个角色</button>}
    </>}
  </section>;
}
