import { useState } from "react";
import { applyReduceMotion, readReduceMotion, writeReduceMotion } from "../motion";

/** 「减少动态效果」: stops the hanging card and shortens animations, on top of the system setting. */
export function MotionToggle() {
  const [on, setOn] = useState(readReduceMotion);
  return <label className="motion-toggle">
    <input type="checkbox" checked={on} onChange={e => { const next = e.target.checked; setOn(next); writeReduceMotion(next); applyReduceMotion(next); }} />
    <span><strong>减少动态效果</strong><small>身份卡不再摆动，界面动画缩短；系统已开启「减少动态效果」时始终生效。</small></span>
  </label>;
}
