// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen } from '@testing-library/react';
import { Portrait } from './components/Portrait';
import { imageUrl } from './storage';
vi.mock('./storage', () => ({ imageUrl: vi.fn() }));
afterEach(() => { cleanup(); vi.resetAllMocks(); });
it('切换上传照片时不会暂时显示上一身份图片，迟到的加载结果不覆盖当前身份', async () => {
  const resolvers = new Map<string, (url: string) => void>();
  vi.mocked(imageUrl).mockImplementation(ref => new Promise(resolve => { resolvers.set(ref,resolve); }));
  const view = render(<Portrait image="public.png"/>);
  await act(async () => resolvers.get('public.png')!('blob:public'));
  expect(screen.getByRole('img').getAttribute('src')).toBe('blob:public');
  view.rerender(<Portrait image="secret.png"/>);
  expect(screen.queryByRole('img')).toBeNull();
  view.rerender(<Portrait image="latest.png"/>);
  await act(async () => resolvers.get('secret.png')!('blob:secret'));
  expect(screen.queryByRole('img')).toBeNull();
  await act(async () => resolvers.get('latest.png')!('blob:latest'));
  expect(screen.getByRole('img').getAttribute('src')).toBe('blob:latest');
});
