// @vitest-environment happy-dom
import 'fake-indexeddb/auto';
import { afterEach, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { IdentityCard } from './components/BookPages';
import { blankProfile, createCharacter } from './model';
import { saveLibrary } from './storage';
import App from './App';

afterEach(cleanup);

it('书架身份卡保持简洁并尊重核心信息的隐藏设置', () => {
  const profile = blankProfile('公开姓名');
  Object.assign(profile.basics, { age: '22', occupation: '学生', birthday: '五月初九', residence: '白塔街 12 号', affiliation: '大学档案室', blood: 'AB' });
  profile.display = { hideEmpty: true, hiddenBasics: ['age'] };
  const view = render(<IdentityCard profile={profile} hidden={false} />);
  expect(screen.getByText('公开姓名')).toBeTruthy();
  expect(screen.getByText('学生')).toBeTruthy();
  for (const value of ['22', '五月初九', '白塔街 12 号', '大学档案室', 'AB']) expect(screen.queryByText(value)).toBeNull();
  profile.display = { hideEmpty: false, hiddenBasics: ['code'] };
  view.rerender(<IdentityCard profile={profile} hidden={false} />);
  expect(screen.getByText('未记录')).toBeTruthy();
  expect(screen.queryByText(profile.basics.code)).toBeNull();
});

it('书架只显示默认版本公开信息，浮动卡切换整份登记信息后可以返回公开身份', async () => {
  const character = createCharacter('身份卡回归角色');
  const version = character.versions[0];
  Object.assign(version.profile.basics, { name: '学生身份', residence: '校园宿舍', occupation: '学生', birthday: '九月一日' });
  version.secret.enabled = true;
  version.secret.trigger = 'emblem';
  version.secret.overrides = { basics: { name: '囚犯身份', residence: '第七监区', occupation: '囚犯', birthday: '身份不明' } };
  await saveLibrary({ schemaVersion: 2, characters: [character] });
  render(<App />);
  const shelfCard = await screen.findByRole('button', { name: '打开身份卡回归角色的档案' });
  expect(shelfCard.textContent).not.toContain('校园宿舍');
  expect(shelfCard.textContent).not.toContain('第七监区');
  expect(shelfCard.querySelector('button')).toBeNull();
  fireEvent.click(shelfCard);
  fireEvent.click(screen.getByRole('button', { name: '证件夹' }));
  const card = within(screen.getByRole('dialog', { name: '证件夹' }));
  fireEvent.click(card.getByRole('button', { name: '切换身份档案' }));
  expect(card.getByText('第七监区')).toBeTruthy();
  expect(card.getByText('身份不明')).toBeTruthy();
  expect(card.queryByText('校园宿舍')).toBeNull();
  fireEvent.click(card.getByRole('button', { name: '切换身份档案' }));
  expect(card.getByText('校园宿舍')).toBeTruthy();
  expect(card.queryByText('第七监区')).toBeNull();
  fireEvent.click(card.getByRole('button', { name: '关闭窗口' }));
  expect(screen.queryByRole('dialog', { name: '证件夹' })).toBeNull();
});

it('书架卡片不重复证件姓名；证件不显示姓名时仍保留可见名称，网格和列表都能用键盘打开', async () => {
  const shown = createCharacter('浅上常', '新迦南市·京极家');
  shown.versions[0].name = '京极时期';
  shown.versions[0].profile.basics.name = '浅上常';
  shown.versions[0].profile.basics.occupation = '家主';

  const hidden = createCharacter('回退管理名', '无证件名分组');
  hidden.versions[0].name = '隐藏时期';
  hidden.versions[0].profile.basics.name = '不应出现的证件名';
  hidden.versions[0].profile.display = { hideEmpty: true, hiddenBasics: ['name'] };

  const blank = createCharacter('空证件名', '空名分组');
  blank.versions[0].profile.basics.name = '   ';

  const placeholder = createCharacter('只有管理名', '明示空名');
  placeholder.versions[0].profile.basics.name = '';
  placeholder.versions[0].profile.display = { hideEmpty: false, hiddenBasics: [] };

  const ghost = createCharacter('临时名', '空白管理名');
  ghost.name = '   ';
  ghost.versions[0].profile.basics.name = '';
  ghost.versions[0].profile.display = { hideEmpty: true, hiddenBasics: ['name'] };

  await saveLibrary({ schemaVersion: 2, characters: [shown, hidden, blank, placeholder, ghost] });
  const user = userEvent.setup();
  render(<App />);

  const shownCard = await screen.findByRole('button', { name: '打开浅上常的档案' });
  expect(shownCard.querySelectorAll('.id-name')).toHaveLength(1);
  expect(shownCard.querySelector('.id-name')!.textContent).toBe('浅上常');
  expect(shownCard.querySelector('.identity-card-caption strong')).toBeNull();
  expect(shownCard.textContent).toContain('新迦南市·京极家');
  expect(shownCard.textContent).toContain('京极时期');
  expect(shownCard.textContent).toContain('1 个版本');
  expect(shownCard.textContent).toContain('家主');
  expect(shownCard.textContent!.split('浅上常').length - 1).toBe(1);
  expect(screen.getByRole('button', { name: '收藏浅上常' })).toBeTruthy();

  const hiddenCard = screen.getByRole('button', { name: '打开回退管理名的档案' });
  expect(hiddenCard.querySelector('.id-name')).toBeNull();
  expect(hiddenCard.textContent).not.toContain('不应出现的证件名');
  expect(hiddenCard.querySelector('.identity-card-caption strong')!.textContent).toBe('回退管理名');
  expect(hiddenCard.textContent).toContain('无证件名分组');
  expect(hiddenCard.textContent).toContain('隐藏时期');

  const blankCard = screen.getByRole('button', { name: '打开空证件名的档案' });
  expect(blankCard.querySelector('.id-name')).toBeNull();
  expect(blankCard.querySelector('.identity-card-caption strong')!.textContent).toBe('空证件名');

  const placeholderCard = screen.getByRole('button', { name: '打开只有管理名的档案' });
  expect(placeholderCard.querySelector('.id-name')!.textContent).toBe('未命名');
  expect(placeholderCard.querySelector('.identity-card-caption strong')).toBeNull();

  const ghostCard = within(document.querySelector('.character-grid') as HTMLElement).getByText('空白管理名').closest('button')!;
  expect(ghostCard.querySelector('.id-name')).toBeNull();
  expect(ghostCard.querySelector('.identity-card-caption strong')!.textContent).toBe('未命名');
  expect(ghostCard.getAttribute('aria-label')).toBe('打开   的档案');

  fireEvent.click(screen.getByRole('button', { name: '列表视图' }));
  const listed = screen.getByRole('button', { name: '打开浅上常的档案' });
  expect(listed.closest('.character-list')).toBeTruthy();
  expect(listed.querySelectorAll('.id-name')).toHaveLength(1);
  expect(listed.querySelector('.identity-card-caption strong')).toBeNull();
  expect(screen.getByRole('button', { name: '打开回退管理名的档案' }).querySelector('.identity-card-caption strong')!.textContent).toBe('回退管理名');

  listed.focus();
  await user.keyboard('{Enter}');
  expect(await screen.findByRole('button', { name: '返回书架' })).toBeTruthy();
  expect(screen.getByRole('heading', { name: '浅上常' })).toBeTruthy();
});
