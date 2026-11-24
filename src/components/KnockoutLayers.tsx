import { useEffect, useRef, type CSSProperties } from "react";
import { reducedMotion } from "../motion";
import { koVideoSrc, wordWidthEm, type DocStyle } from "../doc-style";

/**
 * 镂空视频层（纯装饰，aria-hidden）：
 *  video  —— 垫在最下面；
 *  group  —— 白纸 + 黑色大字，整组 mix-blend-mode: screen，字形处透出视频；
 *  glare  —— 跟随倾斜光点的高光。
 * 大字文本通过 data-word + ::after 渲染，不产生文本节点，避免与证件正文重复。
 */
export function KnockoutLayers({ style, word }: { style: DocStyle; word: string }) {
  const video = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const el = video.current;
    if (!el) return;
    el.muted = true;
    if (reducedMotion()) { el.pause?.(); return; }
    try { void el.play?.()?.catch(() => undefined); } catch { /* autoplay blocked */ }
  }, [style]);
  const text = word.trim() || "—";
  return (
    <>
      <video ref={video} className="doc-ko-video" src={koVideoSrc(style)} muted loop autoPlay playsInline preload="auto" aria-hidden="true" tabIndex={-1} />
      <span className="doc-ko-group" aria-hidden="true">
        <span className="doc-ko-word" data-word={text} style={{ "--ko-n": wordWidthEm(text) } as CSSProperties} />
      </span>
      <span className="doc-ko-glare" aria-hidden="true" />
    </>
  );
}
