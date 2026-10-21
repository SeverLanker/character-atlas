import { useEffect, useRef, type ReactNode } from "react";
import { X } from "lucide-react";
export interface Confirm {
  title: string;
  message: string;
  action: () => void | Promise<void>;
  label?: string;
  danger?: boolean;
}
export function Modal({
  title,
  children,
  onClose,
  className = "",
  bare = false,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  className?: string;
  bare?: boolean;
}) {
  const content = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const root = content.current;
    const focusable = () =>
      Array.from(
        root?.querySelectorAll<HTMLElement>(
          'button:not(:disabled),input,select,textarea,[tabindex="0"]',
        ) ?? [],
      );
    if (!root?.contains(document.activeElement)) {
      if (bare) root?.focus();
      else focusable()[0]?.focus();
    }
    function key(e: KeyboardEvent) {
      if (e.key === "Tab") {
        const nodes = focusable();
        const first = nodes[0],
          last = nodes.at(-1);
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last?.focus();
        } else if (!e.shiftKey && (document.activeElement === last || document.activeElement === root)) {
          e.preventDefault();
          first?.focus();
        }
      }
    }
    root?.addEventListener("keydown", key);
    return () => {
      root?.removeEventListener("keydown", key);
      previous?.focus();
    };
  }, [bare]);
  return (
    <div
      className={"modal-backdrop" + (bare ? " identity-overlay" : "")}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={content}
        className={"modal " + className}
        role="dialog"
        aria-modal="true"
        onKeyDown={(e) => { if (e.key === "Escape") { e.stopPropagation(); onClose(); } }}
        aria-label={title}
        tabIndex={-1}
      >
        {bare ? <button className="identity-dismiss" aria-label="关闭窗口" onClick={onClose}><X size={18} /></button> : <header>
          <div>
            <small>CHARACTER ATLAS</small>
            <h2>{title}</h2>
          </div>
          <button
            className="icon-button"
            aria-label="关闭窗口"
            onClick={onClose}
          >
            <X size={20} />
          </button>
        </header>}
        {children}
      </div>
    </div>
  );
}
