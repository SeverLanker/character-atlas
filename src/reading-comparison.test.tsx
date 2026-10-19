// @vitest-environment happy-dom
import { afterEach, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { createCharacter, duplicateVersion } from './model';
import { compareVersions } from './compare';
import { VersionCompare } from './components/VersionCompare';
import { ReadingText, ReadingView } from './components/ReadingView';
afterEach(() => { cleanup(); localStorage.clear(); });
it('版本差异忽略版本元数据，并按条目身份追踪修改、新增与移除', () => {
  const a = createCharacter('旅人').versions[0];
  a.profile.events = [{id:'one',title:'相遇',text:'旧记忆'}, {id:'gone',title:'离去',text:'离开'}];
  const b = duplicateVersion(a, '后来');
  b.profile.events = [{id:'new',title:'归来',text:'回来'}, {id:'one',title:'相遇',text:'新记忆'}];
  const changes = compareVersions(a,b);
  expect(changes).toContainEqual({path:'经历 / 相遇 / 说明',before:'旧记忆',after:'新记忆'});
  expect(changes.some(c => c.path.includes('离去') && !c.after)).toBe(true);
  expect(changes.some(c => c.path.includes('归来') && !c.before)).toBe(true);
  expect(compareVersions(a,duplicateVersion(a,'元数据变化'))).toEqual([]);
});
it('公开对比不泄露秘密；秘密对比使用继承后的实际资料', () => {
  const a = createCharacter('旅人').versions[0], b = duplicateVersion(a, '后来');
  b.secret.enabled = true; b.secret.overrides.background = '秘密经历';
  expect(compareVersions(a,b)).toEqual([]);
  expect(compareVersions(a,b,true)).toContainEqual({path:'背景',before:'',after:'秘密经历'});
  const role = createCharacter('测试'); role.versions = [a,b];
  render(<VersionCompare character={role} currentId={b.id}/>);
  expect(screen.queryByText('秘密经历')).toBeNull();
  fireEvent.click(screen.getByRole('checkbox', {name:'对比秘密身份'}));
  fireEvent.click(screen.getByText(/修改|新增|移除/));
  expect(screen.getByText('秘密经历')).toBeTruthy();
});
it('长文默认折叠，可展开再收起，短文保持完整', () => {
  render(<ReadingText text={'长篇故事。'.repeat(100)}/>);
  const expand = screen.getByRole('button',{name:/展开全文/});
  expect(expand.getAttribute('aria-expanded')).toBe('false');
  fireEvent.click(expand);
  expect(screen.getByRole('button',{name:'收起长文'}).getAttribute('aria-expanded')).toBe('true');
});
it('阅读目录保存位置并在重新打开后恢复，秘密身份位置隔离', () => {
  const view = render(<ReadingView storageKey="public" page="archive" onPage={()=>{}}><section><h2>详细档案</h2><div className="prose-block"><h3>背景故事</h3></div></section></ReadingView>);
  fireEvent.click(screen.getByRole('button',{name:'背景故事'}));
  expect(JSON.parse(localStorage.getItem('atlas-reading:public')!).heading).toBe(1);
  view.unmount();
  const reopened = render(<ReadingView storageKey="public" page="archive" onPage={()=>{}}><section><h2>详细档案</h2><div className="prose-block"><h3>背景故事</h3></div></section></ReadingView>);
  fireEvent.click(screen.getByRole('button',{name:/继续上次阅读/}));
  expect(document.activeElement?.textContent).toBe('背景故事');
  reopened.unmount();
  render(<ReadingView storageKey="secret" page="archive" onPage={()=>{}}><h2>秘密档案</h2></ReadingView>);
  expect(screen.queryByRole('button',{name:/继续上次阅读/})).toBeNull();
});
it('跨页恢复读取已保存的栏目', () => {
  localStorage.setItem('atlas-reading:test', JSON.stringify({page:'status',heading:0}));
  let selected = '';
  const view = render(<ReadingView storageKey="test" page="archive" onPage={p=>{selected=p;}}><h2>档案</h2></ReadingView>);
  fireEvent.click(screen.getByRole('button',{name:/继续上次阅读/}));
  expect(selected).toBe('status');
  view.rerender(<ReadingView storageKey="test" page="status" onPage={()=>{}}><h2>身体状态</h2></ReadingView>);
  expect(document.activeElement?.textContent).toBe('身体状态');
});
