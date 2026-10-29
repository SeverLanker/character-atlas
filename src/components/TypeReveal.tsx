import { useEffect, useState } from "react";
import { reducedMotion } from "../motion";

/** Keys already typed this session, so re-renders, remounts and edits never replay. */
const typed = new Set<string>();
const TICK = 40, MAX_STEPS = 24;

/** Typewriter reveal on first display only. The full text is always in the DOM for screen readers and copying. */
export function TypeReveal({ text, id }: { text: string; id: string }) {
  const [shown, setShown] = useState(() => (typed.has(id) || !text || reducedMotion() ? -1 : 0));
  useEffect(() => {
    if (shown < 0) return;
    typed.add(id);
    const step = Math.ceil(text.length / MAX_STEPS);
    const timer = setInterval(() => setShown(n => (n < 0 || n + step >= text.length ? -1 : n + step)), TICK);
    return () => clearInterval(timer);
    // Start once; later text changes finish the effect instead of restarting it.
  }, [id]);
  const [start] = useState(text);
  // An edit while typing shows the new value at once.
  if (shown < 0 || text !== start) return <>{text}</>;
  return (
    <span className="type-reveal">
      <span className="visually-hidden">{text}</span>
      <span aria-hidden="true">{text.slice(0, shown)}<span className="type-caret" /></span>
    </span>
  );
}

/** Test helper. */
export function resetTypeReveal() { typed.clear(); }
