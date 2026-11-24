import { useState } from "react";
import { docStyleOptions, saveDocStyle, useDocStyle, type DocStyle } from "../doc-style";

export function DocStyleToggle() {
  const value = useDocStyle();
  const [error, setError] = useState(false);
  return <section className="doc-style-preference" aria-label="证件样式">
    <h3>证件样式</h3>
    <label className="field"><span>证件外观</span>
      <select value={value} onChange={(event) => setError(!saveDocStyle(event.target.value as DocStyle))}>
        {docStyleOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </label>
    <p className="app-theme-note">「镂空视频」把一段循环视频垫在证件下，姓名大字被抠空后由视频填充；开启「减少动态效果」时视频静止。只影响显示，不改证件资料。</p>
    {error && <p role="status">本次已生效，但未能保存到本机。</p>}
  </section>;
}
