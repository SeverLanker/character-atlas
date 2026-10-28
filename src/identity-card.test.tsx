// @vitest-environment happy-dom
import 'fake-indexeddb/auto';
import { afterEach, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
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
