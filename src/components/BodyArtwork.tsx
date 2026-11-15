import { useId, useState } from "react";
import { areaMatches } from "../body";
import type { Condition } from "../model";
import { BodyDiagram } from "./BodyDiagram";

// Front-facing artwork: the character's right is on the viewer's left.
const regions = [
  { area: "头部", x: 390, y: 150, w: 220, h: 220 },
  { area: "躯干", x: 390, y: 370, w: 220, h: 365 },
  { area: "右臂", x: 12, y: 367, w: 378, h: 78 },
  { area: "左臂", x: 610, y: 367, w: 378, h: 78 },
  { area: "右腿", x: 250, y: 735, w: 250, h: 560 },
  { area: "左腿", x: 500, y: 735, w: 250, h: 560 },
];

/** Built-in illustration only; never writes an image or body measurement to a profile. */
export function BodyArtwork({ conditions, active, onSelect }: {
  conditions: Condition[]; active: string; onSelect: (area: string) => void;
}) {
  const [diagram, setDiagram] = useState(false);
  const [failed, setFailed] = useState(false);
  const descriptionId = useId();
  return <div className="body-artwork">
    {diagram || failed ? <BodyDiagram images={{ front: "", back: "", display: "diagram" }} conditions={conditions} active={active} onSelect={onSelect} /> : <>
      <div className="body-artwork-heading"><span>FIGURE STUDY</span><span>维特鲁威 · 人体习作</span></div>
      <svg className="body-map body-artwork-map" viewBox="0 0 1000 1500" role="group" aria-label="身体部位选择" aria-describedby={descriptionId}>
        <desc id={descriptionId}>绿发角色的动漫风人体比例插图，双臂平展，双腿分开。左右按角色自身方向标记。</desc>
        <image href="/art/body-vitruvian-anime.png" width="1000" height="1500" preserveAspectRatio="xMidYMid meet" onError={() => setFailed(true)} />
        {regions.map(r => {
          const matches = conditions.filter(c => c.area !== "全身" && areaMatches(c.area, r.area));
          const level = matches.some(c => c.severity === "danger") ? "danger" : matches.some(c => c.severity === "notice") ? "notice" : "stable";
          const selected = active === r.area;
          const related = !selected && active !== "全部" && active !== "全身" && areaMatches(active, r.area);
          const select = () => onSelect(selected ? "全部" : r.area);
          return <g key={r.area} className="body-artwork-region" data-area={r.area} data-level={matches.length ? level : undefined} data-related={related || undefined}
            role="button" tabIndex={0} aria-pressed={selected} aria-label={r.area + (matches.length ? `，${matches.length} 条记录` : "")}
            onClick={select} onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); select(); } }}>
            <rect x={r.x} y={r.y} width={r.w} height={r.h} rx="28" />
            {matches.length > 0 && <g className="body-artwork-marker" aria-hidden="true"><circle cx={r.x + r.w / 2} cy={r.y + r.h / 2} r="17" /><circle className="body-artwork-marker-core" cx={r.x + r.w / 2} cy={r.y + r.h / 2} r="6" /></g>}
            <title>{r.area}</title>
          </g>;
        })}
      </svg>
      <p className="body-artwork-caption">{active === "全部" ? "内置插图 · 点击部位查看记录" : "当前筛选 · " + active}</p>
    </>}
    {failed ? <p className="body-diagram-note" role="status">插图暂时无法显示，已使用 SVG 示意。</p> : <button className="text-button body-marker-toggle" aria-pressed={diagram} onClick={() => setDiagram(!diagram)}>{diagram ? "返回动漫插图" : "切换为 SVG 示意"}</button>}
  </div>;
}
