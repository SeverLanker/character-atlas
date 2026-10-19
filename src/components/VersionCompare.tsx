import { useState } from 'react';
import { compareVersions } from '../compare';
import type { Character } from '../model';
export function VersionCompare({ character, currentId, characters = [] }: { character: Character; currentId: string; characters?: Character[] }) {
  const [leftId, setLeft] = useState(currentId);
  const [rightId, setRight] = useState(character.versions.find(v => v.id !== currentId)?.id ?? currentId);
  const [secret, setSecret] = useState(false);
  const left = character.versions.find(v => v.id === leftId) ?? character.versions[0];
  const right = character.versions.find(v => v.id === rightId) ?? character.versions[0];
  const changes = compareVersions(left, right, secret);
  const display = (path: string, value: string) => !value ? '未记录' : path.endsWith('关联角色') ? characters.find(c => c.id === value)?.name ?? '关联角色不可用' : value;
  return <section className="version-comparison" aria-label="剧情版本对比">
    <div className="reading-controls">
      <label>此前 <select aria-label="对比起始版本" value={left.id} onChange={e => setLeft(e.target.value)}>{character.versions.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}</select></label>
      <span>→</span>
      <label>此后 <select aria-label="对比目标版本" value={right.id} onChange={e => setRight(e.target.value)}>{character.versions.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}</select></label>
      <label><input type="checkbox" checked={secret} onChange={e => setSecret(e.target.checked)} />对比秘密身份</label>
    </div>
    {secret && <p>显示秘密身份合并后的资料；未启用秘密身份的版本使用公开资料。</p>}
    <p role="status">{changes.length ? `${changes.length} 项字段变化` : '两份资料没有内容差异。'}</p>
    <div className="comparison-list">{changes.map((change, i) => <details key={i} className="comparison-change"><summary><b>{change.before ? change.after ? '修改' : '移除' : '新增'}</b> {change.path}</summary><div className="comparison-values"><div><small>此前 · {left.name}</small><p>{display(change.path, change.before)}</p></div><div><small>此后 · {right.name}</small><p>{display(change.path, change.after)}</p></div></div></details>)}</div>
  </section>;
}
