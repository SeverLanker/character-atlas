import { useState } from "react";
import { readReduceMotion, saveReduceMotion } from "../motion";

export function MotionToggle() {
  const [checked, setChecked] = useState(readReduceMotion);
  const [error, setError] = useState(false);
  return <section className="motion-preference" aria-label="动态效果">
    <label className="app-theme-follow"><input type="checkbox" checked={checked} onChange={event => {
      setChecked(event.target.checked); setError(!saveReduceMotion(event.target.checked));
    }} />减少动态效果</label>
    <p className="app-theme-note">关闭翻转、倾斜和入场动画，保留证件翻面与翻页功能。系统的减少动态效果设置始终优先。</p>
    {error && <p role="status">本次已生效，但未能保存到本机；下次打开后请重新设置。</p>}
  </section>;
}
