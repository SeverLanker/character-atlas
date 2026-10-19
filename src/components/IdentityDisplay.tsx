import { useRef, type PointerEvent, type ReactNode } from 'react';

/** The card itself tilts; its buttons retain their usual keyboard behavior. */
export function IdentityDisplay({ hidden, theme, children }: { hidden: boolean; theme: string; children: ReactNode }) {
  const surface = useRef<HTMLDivElement>(null);
  function tilt(event: PointerEvent<HTMLDivElement>) {
    if (event.pointerType !== 'mouse') return;
    const node = surface.current!;
    const rect = node.getBoundingClientRect();
    const x = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width));
    const y = Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height));
    node.style.setProperty('--card-rx', `${(0.5 - y) * 7}deg`);
    node.style.setProperty('--card-ry', `${(x - 0.5) * 9}deg`);
    node.style.setProperty('--light-x', `${x * 100}%`);
    node.style.setProperty('--light-y', `${y * 100}%`);
  }
  function reset() {
    const node = surface.current!;
    node.style.setProperty('--card-rx', '0deg');
    node.style.setProperty('--card-ry', '0deg');
    node.style.setProperty('--light-x', '50%');
    node.style.setProperty('--light-y', '40%');
  }
  return <div ref={surface} data-side={hidden ? 'secret' : 'public'} className={`identity-surface theme-${hidden ? theme : 'ivory'}`} onPointerMove={tilt} onPointerLeave={reset}>
    {children}
  </div>;
}
