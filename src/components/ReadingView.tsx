import { useEffect, useRef, useState, type ReactNode } from 'react';
import { pageMeta, type Page } from '../model';
type Position = { page: Page; heading: number };
function readPosition(key: string): Position | null {
  try {
    const value = JSON.parse(localStorage.getItem(key) ?? 'null');
    return value && pageMeta.some(p => p.id === value.page) && Number.isInteger(value.heading) && value.heading >= 0 ? value : null;
  } catch { return null; }
}
export function ReadingView({ storageKey, page, onPage, children, revision }: { storageKey: string; page: Page; onPage: (page: Page) => void; children: ReactNode; revision?: string }) {
  const key = 'atlas-reading:' + storageKey;
  const root = useRef<HTMLDivElement>(null);
  const pending = useRef<number | null>(null);
  const [saved, setSaved] = useState(() => readPosition(key));
  const [headings, setHeadings] = useState<string[]>([]);
  const [active, setActive] = useState(-1);
  function jump(index: number) {
    const heading = root.current?.querySelectorAll<HTMLElement>('h2, .prose-block > h3')[index];
    if (!heading) return;
    heading.tabIndex = -1;
    heading.scrollIntoView?.({ block: 'start', behavior: 'instant' });
    heading.focus({ preventScroll: true });
    remember(index);
  }
  function remember(heading: number) {
    const position = { page, heading };
    setActive(heading); setSaved(position);
    try { localStorage.setItem(key, JSON.stringify(position)); } catch { /* 阅读仍可继续。 */ }
  }
  useEffect(() => {
    const nodes = [...root.current!.querySelectorAll<HTMLElement>('h2, .prose-block > h3')];
    setHeadings(nodes.map(h => h.textContent ?? ''));
    setActive(-1);
    if (pending.current !== null) { jump(pending.current); pending.current = null; }
    let timer: ReturnType<typeof setTimeout>;
    const onScroll = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        let index = -1;
        nodes.forEach((node, i) => { if (node.getBoundingClientRect().top <= 180) index = i; });
        if (index >= 0 && root.current!.getBoundingClientRect().bottom > 0) remember(index);
      }, 180);
    };
    window.addEventListener('scroll', onScroll, true);
    return () => { clearTimeout(timer); window.removeEventListener('scroll', onScroll, true); };
  // Content is remounted by page. Keep the position isolated to this version and identity.
  }, [page, key, revision]);
  return <>
    <nav className="reading-controls" aria-label="页内目录">
      <span>本页</span>{headings.map((title, i) => <button key={i} className={'button small ' + (active === i ? 'active' : '')} onClick={() => jump(i)}>{title}</button>)}
      {saved && <button className="button small resume-reading" onClick={() => { if (saved.page === page) jump(saved.heading); else { pending.current = saved.heading; onPage(saved.page); } }}>继续上次阅读 · {pageMeta.find(p => p.id === saved.page)?.name}</button>}
    </nav>
    <div ref={root} className="book-spread" key={page}>{children}</div>
  </>;
}

export function ReadingText({ text, className }: { text: string; className?: string }) {
  const [expanded, setExpanded] = useState(false);
  if (text.length <= 360) return <p className={className}>{text}</p>;
  return <div className={className}><p className={expanded ? '' : 'reading-text-collapsed'}>{text}</p><button className="text-button reading-expand" aria-expanded={expanded} onClick={() => setExpanded(!expanded)}>{expanded ? '收起长文' : `展开全文 · ${text.length} 字`}</button></div>;
}
