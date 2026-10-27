import { useEffect, useId, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode, type CSSProperties } from 'react';
import { advance, aim, atRest, createRig, drag, DRAG_THRESHOLD, dropIn, flipKick, pose, release, type Rig } from '../lanyard/physics';
import { motionReduced } from '../motion';

function useReducedMotion() {
  const [reduced, setReduced] = useState(() => motionReduced());
  useEffect(() => {
    const update = () => setReduced(motionReduced());
    const media = typeof matchMedia === 'function' ? matchMedia('(prefers-reduced-motion: reduce)') : null;
    media?.addEventListener?.('change', update); document.addEventListener('atlas-motion-change', update);
    return () => { media?.removeEventListener?.('change', update); document.removeEventListener('atlas-motion-change', update); };
  }, []);
  return reduced;
}
const STRAP_TEXT = 'CHARACTER ATLAS · 叙册 · ';

/**
 * The identity card hangs from a lanyard: it drops in, swings, can be dragged and flung,
 * tilts toward the pointer and turns in when the secret identity is shown.
 * Motion runs only while the card moves; with reduced motion it simply hangs still.
 * Inspired by xu-yaoting/hanging-pass (MIT).
 */
export function IdentityDisplay({ hidden, theme, children }: { hidden: boolean; theme: string; children: ReactNode }) {
  const surface = useRef<HTMLDivElement>(null), swing = useRef<HTMLDivElement>(null), card = useRef<HTMLDivElement>(null), strapPaths = useRef<SVGSVGElement>(null);
  const reduced = useReducedMotion();
  const rig = useRef<Rig>(createRig(200)), frame = useRef(0), last = useRef(0);
  const pointer = useRef<{ id: number; x: number; y: number; moved: boolean; t: number; grab?: { x: number; y: number } } | null>(null), suppressClick = useRef(false);
  const [length, setLength] = useState(200);
  const side = useRef(hidden), strapId = `lanyard-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;

  const paint = () => {
    const node = surface.current, p = pose(rig.current);
    if (!node) return;
    node.style.setProperty('--swing', `${p.swing}deg`);
    node.style.setProperty('--hinge', `${p.hinge}deg`);
    node.style.setProperty('--drop', `${p.drop}px`);
    node.style.setProperty('--flip', `${p.flip}deg`);
    node.style.setProperty('--card-rx', `${p.rx}deg`);
    node.style.setProperty('--card-ry', `${p.ry}deg`);
    node.style.setProperty('--light-x', `${p.lightX}%`);
    node.style.setProperty('--light-y', `${p.lightY}%`);
    node.style.setProperty('--holo', p.holo.toFixed(3));
    const L = rig.current.length + p.drop;
    const d = `M 30 0 Q ${30 + p.bend} ${L / 2} 30 ${Math.max(0, L)}`;
    for (const path of strapPaths.current?.querySelectorAll('path') ?? []) path.setAttribute('d', d);
  };
  const loop = (time: number) => {
    const dt = last.current ? (time - last.current) / 1000 : 1 / 60;
    last.current = time;
    rig.current = advance(rig.current, dt);
    paint();
    if (atRest(rig.current)) { frame.current = 0; last.current = 0; return; }
    frame.current = requestAnimationFrame(loop);
  };
  const wake = () => { if (!reduced && !frame.current) { last.current = 0; frame.current = requestAnimationFrame(loop); } };

  // The strap reaches the top of the window, as if clipped above the screen.
  useEffect(() => {
    const measure = () => {
      const top = (surface.current?.getBoundingClientRect().top ?? 200) + parseFloat(getComputedStyle(surface.current!).paddingTop || '0');
      const next = Math.round(Math.max(90, Math.min(460, top + 24)));
      setLength(next); rig.current = { ...rig.current, length: next }; paint();
    };
    measure();
    // The centred modal moves when the portrait loads or the window resizes.
    const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(measure) : null;
    const modal = surface.current?.closest('.modal');
    if (modal) observer?.observe(modal);
    const late = window.setTimeout(measure, 400);
    window.addEventListener('resize', measure);
    return () => { observer?.disconnect(); window.clearTimeout(late); window.removeEventListener('resize', measure); };
  }, []);
  useEffect(() => {
    if (reduced) { cancelAnimationFrame(frame.current); frame.current = 0; rig.current = createRig(rig.current.length); paint(); return; }
    rig.current = dropIn(rig.current); paint(); wake();
    return () => { cancelAnimationFrame(frame.current); frame.current = 0; };
  }, [reduced]);
  useEffect(() => {
    if (side.current === hidden) return;
    side.current = hidden;
    if (reduced) return;
    rig.current = flipKick(rig.current, hidden ? 1 : -1); wake();
  }, [hidden, reduced]);

  const pivot = () => {
    const node = surface.current!, r = node.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + parseFloat(getComputedStyle(node).paddingTop || '0') - rig.current.length };
  };
  function down(event: ReactPointerEvent<HTMLDivElement>) {
    if (reduced || event.button > 0) return;
    pointer.current = { id: event.pointerId, x: event.clientX, y: event.clientY, moved: false, t: event.timeStamp };
    suppressClick.current = false;
  }
  function move(event: ReactPointerEvent<HTMLDivElement>) {
    if (reduced) return;
    const active = pointer.current;
    if (active && active.id === event.pointerId) {
      if (!active.moved && Math.hypot(event.clientX - active.x, event.clientY - active.y) < DRAG_THRESHOLD) return;
      if (!active.moved) { active.moved = true; card.current?.setPointerCapture?.(event.pointerId); surface.current?.classList.add('is-dragging'); }
      // The grab point keeps its offset from the clip, so the card does not jump to the pointer.
      const origin = pivot();
      if (!active.grab) { const r = rig.current, reach = r.length + r.stretch; active.grab = { x: active.x - (origin.x + reach * Math.sin(r.angle)), y: active.y - (origin.y + reach * Math.cos(r.angle)) }; }
      const dt = Math.max(1 / 240, (event.timeStamp - active.t) / 1000); active.t = event.timeStamp;
      rig.current = drag(rig.current, event.clientX - active.grab.x - origin.x, event.clientY - active.grab.y - origin.y, dt);
      wake(); return;
    }
    if (event.pointerType !== 'mouse') return;
    const rect = card.current!.getBoundingClientRect();
    rig.current = aim(rig.current, { x: (event.clientX - rect.left) / rect.width, y: (event.clientY - rect.top) / rect.height });
    wake();
  }
  function up(event: ReactPointerEvent<HTMLDivElement>) {
    const active = pointer.current;
    if (!active || active.id !== event.pointerId) return;
    pointer.current = null;
    if (active.moved) { suppressClick.current = true; rig.current = release(rig.current); surface.current?.classList.remove('is-dragging'); wake(); }
  }
  function leave() { if (!pointer.current) { rig.current = aim(rig.current, null); wake(); } }

  return <div ref={surface} data-side={hidden ? 'secret' : 'public'} data-motion={reduced ? 'still' : 'live'} className={`identity-surface lanyard-surface theme-${hidden ? theme : 'ivory'}`} style={{ '--strap': `${length}px` } as CSSProperties}>
    <div ref={swing} className="lanyard-swing">
      <svg ref={strapPaths} className="lanyard-strap" width="60" height={length + 80} aria-hidden="true" focusable="false">
        <path className="lanyard-band" d={`M 30 0 L 30 ${length}`} />
        <path className="lanyard-stitch" d={`M 30 0 L 30 ${length}`} />
        <path id={strapId} className="lanyard-line" d={`M 30 0 L 30 ${length}`} />
        <text className="lanyard-print"><textPath href={`#${strapId}`}>{STRAP_TEXT.repeat(Math.ceil(length / 90))}</textPath></text>
      </svg>
      <div className="lanyard-clip" aria-hidden="true"><span /></div>
      <div ref={card} className="lanyard-card" onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} onPointerLeave={leave}
        onClickCapture={event => { if (suppressClick.current) { suppressClick.current = false; event.stopPropagation(); event.preventDefault(); } }}>
        {children}
        <span className="lanyard-holo" aria-hidden="true" />
      </div>
    </div>
  </div>;
}
