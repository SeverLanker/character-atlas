// @vitest-environment happy-dom
import 'fake-indexeddb/auto';
import { useState } from 'react';
import { afterEach, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import App from './App';
import { RelationshipEditor, Relationships } from './components/Relationships';
import { CatalogPanel } from './components/CatalogPanel';
import { blankProfile, createCharacter, duplicateVersion, validateLibrary, type CatalogEntry, type Relationship, type Library } from './model';
import { mergeLibraries } from './merge';
import { buildSearchIndex, searchDocuments } from './search';
import { exportBackup, parseBackup, saveLibrary } from './storage';
afterEach(cleanup);

it('旧文字关系可搜索绑定角色和解除关联，描述始终保留', () => {
  const a = createCharacter('记录者'), b = createCharacter('归来者');
  function Harness() {
    const [items, setItems] = useState<Relationship[]>([{id:'r',title:'旧识',text:'曾在雨中相遇'}]);
    return <><RelationshipEditor items={items} characters={[a,b]} currentId={a.id} onChange={setItems}/><output data-testid="relations">{JSON.stringify(items)}</output></>;
  }
  render(<Harness/>);
  fireEvent.click(screen.getByRole('button',{name:'关联角色'}));
  fireEvent.change(screen.getByLabelText('搜索关联角色'),{target:{value:'归来'}});
  expect(screen.queryByRole('button',{name:/选择 记录者/})).toBeNull();
  fireEvent.click(screen.getByRole('button',{name:/选择 归来者/}));
  expect(JSON.parse(screen.getByTestId('relations').textContent!)[0]).toMatchObject({targetCharacterId:b.id,text:'曾在雨中相遇'});
  fireEvent.click(screen.getByRole('button',{name:'解除关联'}));
  expect(JSON.parse(screen.getByTestId('relations').textContent!)[0]).toEqual({id:'r',title:'旧识',text:'曾在雨中相遇'});
});

it('反向关系仅来自默认公开版本，缺失目标保留原记录', () => {
  const a = createCharacter('当前角色'), b = createCharacter('公开关系'), c = createCharacter('秘密关系'), d = createCharacter('后续关系');
  const relation = {id:'r',title:'旧识',text:'说明',targetCharacterId:a.id};
  b.versions[0].profile.relationships = [relation];
  c.versions[0].secret.enabled = true; c.versions[0].secret.overrides.relationships = [relation];
  const later = duplicateVersion(d.versions[0],'未来'); later.profile.relationships = [relation]; d.versions.push(later);
  render(<Relationships items={[{...relation,targetCharacterId:'missing',text:'不要丢失'}]} currentId={a.id} characters={[a,b,c,d]} onOpen={()=>{}}/>);
  expect(screen.getByText('不要丢失')).toBeTruthy();
  expect(screen.getByText('关联角色不可用，保留原记录')).toBeTruthy();
  expect(screen.getByRole('button',{name:'公开关系 ↗'})).toBeTruthy();
  expect(screen.queryByRole('button',{name:'秘密关系 ↗'})).toBeNull();
  expect(screen.queryByRole('button',{name:'后续关系 ↗'})).toBeNull();
});

it('关联跳转进入目标默认公开版本，返回保持来源剧情版本', async () => {
  const a = createCharacter('起点'), b = createCharacter('终点');
  const later = duplicateVersion(a.versions[0],'来源后期'); a.versions.push(later);
  later.profile.relationships = [{id:'rel',title:'同行',text:'一起旅行',targetCharacterId:b.id}];
  const target = duplicateVersion(b.versions[0],'目标默认'); b.versions.push(target); b.defaultVersionId = target.id;
  target.secret.enabled = true; target.secret.overrides.background = '秘密内容不应出现';
  await saveLibrary({schemaVersion:2,characters:[a,b]});
  render(<App/>);
  fireEvent.click(await screen.findByRole('button',{name:'打开起点的档案'}));
  fireEvent.change(screen.getByLabelText('当前剧情版本'),{target:{value:later.id}});
  fireEvent.click(screen.getByRole('button',{name:'打开 终点 的档案 ↗'}));
  expect((screen.getByLabelText('当前剧情版本') as HTMLSelectElement).value).toBe(target.id);
  expect(screen.queryByText('秘密内容不应出现')).toBeNull();
  fireEvent.click(screen.getByRole('button',{name:'返回 起点'}));
  expect((screen.getByLabelText('当前剧情版本') as HTMLSelectElement).value).toBe(later.id);
});

it('冲突导入为副本时，公开和秘密关联均指向这一批的新副本', () => {
  const a = createCharacter('A'), b = createCharacter('B');
  a.versions[0].profile.relationships = [{id:'ab',title:'伙伴',text:'',targetCharacterId:b.id}];
  b.versions[0].secret.overrides.relationships = [{id:'ba',title:'敌手',text:'',targetCharacterId:a.id}];
  const current: Library = {schemaVersion:2,characters:[a,b]};
  const result = mergeLibraries(current, current, {[a.id]:'copy',[b.id]:'copy'});
  expect(result.characters[2].versions[0].profile.relationships[0].targetCharacterId).toBe(result.characters[3].id);
  expect(result.characters[3].versions[0].secret.overrides.relationships![0].targetCharacterId).toBe(result.characters[2].id);
  expect(current.characters[0].versions[0].profile.relationships[0].targetCharacterId).toBe(b.id);
  const skipped = mergeLibraries(current, current, {[a.id]:'copy',[b.id]:'skip'});
  expect(skipped.characters[2].versions[0].profile.relationships[0].targetCharacterId).toBe(b.id);
});

const template: CatalogEntry = {id:'one',title:'Arcane Light',text:'照亮黑暗',rank:'III',kind:'spell',common:false,tags:['探索','光'],favorite:true};
function CatalogHarness() {
  const [entries,setEntries] = useState<CatalogEntry[]>([template,{...template,id:'two',title:'Fire',favorite:false,tags:['战斗']}]);
  return <><CatalogPanel entries={entries} onChange={setEntries}/><output data-testid="catalog">{JSON.stringify(entries)}</output></>;
}
it('条目库按标签、收藏和多个关键词组合筛选，支持清除筛选', () => {
  render(<CatalogHarness/>);
  fireEvent.click(screen.getByRole('button',{name:'法术'}));
  fireEvent.change(screen.getByLabelText('搜索法术库'),{target:{value:'ARCANE 探索 III'}});
  expect(screen.getByRole('heading',{name:/Arcane Light/})).toBeTruthy();
  expect(screen.queryByRole('heading',{name:/Fire/})).toBeNull();
  fireEvent.change(screen.getByLabelText('筛选条目标签'),{target:{value:'战斗'}});
  expect(screen.queryByRole('heading',{name:/Arcane Light/})).toBeNull();
  fireEvent.click(screen.getByRole('button',{name:'清除筛选'}));
  fireEvent.click(screen.getByRole('checkbox',{name:'只看收藏'}));
  expect(screen.queryByRole('heading',{name:/Fire/})).toBeNull();
  fireEvent.click(screen.getByRole('button',{name:'取消收藏模板 Arcane Light'}));
  expect(screen.queryByRole('heading',{name:/Arcane Light/})).toBeNull();
});
it('复制模板保留标签并独立修改；同类重名保存会提示', () => {
  render(<CatalogHarness/>);
  fireEvent.click(screen.getByRole('button',{name:'法术'}));
  const original = screen.getByRole('heading',{name:/Arcane Light/}).closest('article')!;
  fireEvent.click(within(original).getByRole('button',{name:'复制模板'}));
  fireEvent.change(screen.getByLabelText('模板标签（逗号分隔）'),{target:{value:'探索, 新标签,探索'}});
  fireEvent.click(screen.getByRole('button',{name:'保存模板'}));
  const rows = JSON.parse(screen.getByTestId('catalog').textContent!);
  expect(rows[2].tags).toEqual(['探索','新标签']);
  expect(rows[0].tags).toEqual(['探索','光']);
  expect(rows[2].id).not.toBe(rows[0].id);
  fireEvent.click(screen.getByRole('button',{name:'新建法术模板'}));
  fireEvent.change(screen.getByLabelText('模板名称'),{target:{value:' arcane light '}});
  fireEvent.click(screen.getByRole('button',{name:'保存模板'}));
  expect(screen.getByText('同类中已有同名模板，请修改名称或编辑原模板。').textContent).toContain('已有同名模板');
  expect(JSON.parse(screen.getByTestId('catalog').textContent!)).toHaveLength(3);
});
it('同名同类角色条目阻止重复添加，不阻止不同类能力', () => {
  const p = blankProfile(); p.skills = [{id:'s',title:'arcane light',text:'独立描述',rank:'I',kind:'spell'}];
  let changes = 0;
  render(<CatalogPanel entries={[template]} onChange={()=>{}} profile={p} onPatch={()=>{changes++;}}/>);
  fireEvent.click(screen.getByRole('button',{name:'法术'}));
  const disabled = screen.getByRole('button',{name:'已有同名条目'}) as HTMLButtonElement;
  expect(disabled.disabled).toBe(true);
  fireEvent.click(disabled); expect(changes).toBe(0);
});
it('关联、模板标签和收藏随备份往返，旧资料仍通过校验', async () => {
  const a = createCharacter('A');
  const lib: Library = {schemaVersion:2,characters:[a],catalog:[template]};
  validateLibrary(lib);
  a.versions[0].profile.relationships = [{id:'r',title:'旧识',text:'',targetCharacterId:'not-in-this-library'}];
  expect(parseBackup(await exportBackup(lib)).library).toEqual(lib);
  const bad = structuredClone(lib); (bad.catalog![0] as unknown as {tags:unknown}).tags = [42];
  expect(()=>validateLibrary(bad)).toThrow('条目标签无效');
  const malformed = structuredClone(lib); (malformed.characters[0].versions[0].profile.relationships[0] as unknown as {targetCharacterId:unknown}).targetCharacterId = 42;
  expect(()=>validateLibrary(malformed)).toThrow('关联角色编号无效');
});

it('关联检索跟随角色改名，秘密关联只在主动包含秘密时检索', () => {
  const a = createCharacter('记录者'), b = createCharacter('原名');
  a.versions[0].profile.relationships = [{id:'r',title:'旧识',text:'',targetCharacterId:b.id}];
  b.name = '现在的名字';
  const lib: Library = {schemaVersion:2,characters:[a,b]};
  expect(searchDocuments(buildSearchIndex(lib), '现在的名字').find(group => group.characterId === a.id)?.hits[0].field).toBe('关联角色');
  a.versions[0].profile.relationships = [];
  a.versions[0].secret.enabled = true;
  a.versions[0].secret.overrides.relationships = [{id:'secret',title:'',text:'',targetCharacterId:b.id}];
  expect(searchDocuments(buildSearchIndex(lib), '现在的名字').some(group => group.characterId === a.id)).toBe(false);
  expect(searchDocuments(buildSearchIndex(lib,true), '现在的名字').find(group => group.characterId === a.id)?.hits[0].hidden).toBe(true);
});
