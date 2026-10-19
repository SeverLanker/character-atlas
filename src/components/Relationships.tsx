import { useState } from 'react';
import { defaultVersion, uid, type Character, type Relationship } from '../model';
import { ReadingText } from './ReadingView';

export function RelationshipEditor({ items, characters, currentId, onChange }: {
  items: Relationship[]; characters: Character[]; currentId: string; onChange: (items: Relationship[]) => void;
}) {
  const [linking, setLinking] = useState('');
  const [query, setQuery] = useState('');
  const patch = (id: string, value: Partial<Relationship>) => onChange(items.map(row => row.id === id ? { ...row, ...value } : row));
  const matches = characters.filter(c => c.id !== currentId && `${c.name} ${c.collection}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()));
  return <section className="edit-section" aria-label="人际关系编辑">
    <div className="edit-section-title"><h3>人际关系</h3><button className="text-button" onClick={() => onChange([...items, { id: uid(), title: '', text: '' }])}>添加</button></div>
    <p className="editor-help">关系描述属于当前版本。关联后可打开对方的默认公开档案；不会自动替对方编写关系。</p>
    {items.map((row, i) => {
      const target = characters.find(c => c.id === row.targetCharacterId);
      return <article className="edit-entry" key={row.id}>
        <div className="edit-entry-top"><small>关系 {i + 1}</small><button className="text-button" onClick={() => onChange(items.filter(r => r.id !== row.id))}>删除关系</button></div>
        <label className="field"><span>关系标题</span><input value={row.title} onChange={e => patch(row.id, { title: e.target.value })}/></label>
        <label className="field"><span>关系描述</span><textarea rows={3} value={row.text} onChange={e => patch(row.id, { text: e.target.value })}/></label>
        <div className="coc-edit-actions"><span>{target ? `已关联：${target.name}` : row.targetCharacterId ? '关联角色已不在资料库中，原描述仍保留。' : '尚未关联角色'}</span>
          <button className="button small" onClick={() => { setLinking(linking === row.id ? '' : row.id); setQuery(''); }}>关联角色</button>
          {row.targetCharacterId && <button className="text-button" onClick={() => patch(row.id, { targetCharacterId: undefined })}>解除关联</button>}
        </div>
        {linking === row.id && <div className="relationship-picker"><label className="field"><span>搜索关联角色</span><input type="search" value={query} onChange={e => setQuery(e.target.value)}/></label>
          {matches.slice(0, 8).map(c => <button key={c.id} className="button small" onClick={() => { patch(row.id, { targetCharacterId: c.id }); setLinking(''); }}>选择 {c.name} · {c.collection || '未分组'}</button>)}
          <p className="editor-help">{matches.length ? `找到 ${matches.length} 位角色${matches.length > 8 ? '，请继续输入缩小范围。' : '。'}` : '没有匹配角色。'}</p>
        </div>}
      </article>;
    })}
    {!items.length && <p className="editor-empty">暂无关系，点击添加开始记录。</p>}
  </section>;
}

export function Relationships({ items, characters, currentId, onOpen }: {
  items: Relationship[]; characters: Character[]; currentId: string; onOpen?: (character: Character) => void;
}) {
  const incoming = characters.filter(c => c.id !== currentId && defaultVersion(c).profile.relationships.some(r => r.targetCharacterId === currentId));
  if (!items.length && !incoming.length) return null;
  return <div className="prose-block"><small>CONNECTIONS</small><h3>人际关系</h3>
    {items.map(row => {
      const target = characters.find(c => c.id === row.targetCharacterId);
      return <div key={row.id} className="relationship"><h4>{row.title || target?.name || '未命名关系'}</h4>
        {target && onOpen ? <button className="text-button character-link" onClick={() => onOpen(target)}>打开 {target.name} 的档案 ↗</button> : row.targetCharacterId ? <small>关联角色不可用，保留原记录</small> : null}
        <ReadingText text={row.text}/>
      </div>;
    })}
    {!!incoming.length && <details className="incoming-relations"><summary>谁关联了此角色 · {incoming.length}</summary><p>来自其他角色默认公开版本的关联。</p>{incoming.map(c => <button className="button small" key={c.id} onClick={() => onOpen?.(c)}>{c.name} ↗</button>)}</details>}
  </div>;
}
