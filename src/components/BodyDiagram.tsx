import { useEffect, useState } from "react";
import { bodyRegions, bodyTypeLabels, regionHasCondition, type BodyProfile, type BodyImages } from "../body";
import type { Condition } from "../model";
import { imageUrl } from "../storage";

const W = 1000, H = 1500;

function useAssetUrl(ref: string): string {
  const [state, setState] = useState({ ref: "", url: "" });
  useEffect(() => {
    let alive = true;
    if (ref) imageUrl(ref).then((url) => { if (alive) setState({ ref, url }); }).catch(() => { if (alive) setState({ ref, url: "" }); });
    return () => { alive = false; };
  }, [ref]);
  return state.ref === ref ? state.url : "";
}

/** 无导出图时的内置剪影，按体型 / 头身比 / 腿长使用与热区相同的比例。 */
export function BodySilhouette({ body, view = "front" }: { body?: BodyProfile; view?: "front" | "back" }) {
  const r = Object.fromEntries(bodyRegions(body).map((x) => [x.area, x]));
  const px = (n: number) => n * W, py = (n: number) => n * H;
  const head = r["头部"], chest = r["胸部"], belly = r["腹部"];
  const limb = (a: string) => {
    const x = px(r[a].x) + 8, y = py(r[a].y), w = px(r[a].w) - 16, h = py(r[a].h);
    return <path key={a} d={`M${x + w * .25},${y} Q${x + w / 2},${y - 10} ${x + w * .8},${y}
      Q${x + w},${y + h * .3} ${x + w * .7},${y + h * .67} L${x + w * .66},${y + h * .94}
      Q${x + w / 2},${y + h * 1.03} ${x + w * .3},${y + h * .94} L${x + w * .22},${y + h * .67}
      Q${x},${y + h * .3} ${x + w * .25},${y}Z`} />;
  };
  const left = px(chest.x), right = px(chest.x + chest.w), top = py(chest.y), waist = py(belly.y), hip = py(belly.y + belly.h);
  return (
    <g className="body-silhouette" aria-hidden="true">
      <ellipse cx={W / 2} cy={py(head.y + head.h / 2)} rx={px(head.w) / 2} ry={py(head.h) / 2} />
      <rect x={px(r["颈部"].x)} y={py(r["颈部"].y) - 4} width={px(r["颈部"].w)} height={py(r["颈部"].h) + 8} rx="20" />
      <path d={`M450,${top - 12} Q${left},${top - 16} ${left},${top + 35}
        C${left},${waist - 30} ${left + 30},${waist} ${left + 20},${waist + 30}
        Q${left - 5},${hip - 10} 500,${hip + 15} Q${right + 5},${hip - 10} ${right - 20},${waist + 30}
        C${right - 30},${waist} ${right},${waist - 30} ${right},${top + 35} Q${right},${top - 16} 550,${top - 12}Z`} />
      {["左臂", "右臂", "左手", "右手", "左腿", "右腿", "左脚", "右脚"].map(limb)}
      <path className="body-detail-line" d={view === "back" ? `M500,${top + 22} V${hip - 18}` : `M${left + 24},${top + 30} Q500,${top + 60} ${right - 24},${top + 30} M500,${waist - 18} v28`} />
    </g>
  );
}

export function BodyDiagram({ body, images, conditions, active, onSelect }: {
  body?: BodyProfile; images?: BodyImages; conditions: Condition[]; active: string; onSelect: (area: string) => void;
}) {
  const pictures = images ?? body;
  const [view, setView] = useState<"front" | "back">(() => !pictures?.front && pictures?.back ? "back" : "front");
  const [markers, setMarkers] = useState(false);
  const [failed, setFailed] = useState("");
  const ref = pictures?.[view] ?? "";
  const assetUrl = useAssetUrl(images?.display === "diagram" ? "" : ref);
  const url = failed !== ref ? assetUrl : "";
  const diagram = images?.display === "diagram";
  const regions = bodyRegions(body, view);
  return (
    <div className="body-diagram">
      <div className="body-diagram-tools">
        <span>{body ? <>{bodyTypeLabels[body.body_type]} · {Math.round(body.height_cm)} cm{body.name ? " · " + body.name : ""}</> : diagram ? "SVG 人体示意" : "自定义身体图"}</span>
        <span role="group" aria-label="人体图朝向">
          <button className={view === "front" ? "active" : ""} aria-pressed={view === "front"} onClick={() => setView("front")}>正面</button>
          <button className={view === "back" ? "active" : ""} aria-pressed={view === "back"} onClick={() => setView("back")}>背面</button>
        </span>
      </div>
      <svg className="body-map" viewBox={`0 0 ${W} ${H}`} role="group" aria-label="身体部位选择" data-view={view}>
        <g className="body-diagram-guides" aria-hidden="true"><path d="M500 15V1485 M160 1455H840" /><circle cx="500" cy="640" r="440" /></g>
        {url ? <image href={url} width={W} height={H} preserveAspectRatio="xMidYMid meet" onError={() => setFailed(ref)} /> : <BodySilhouette body={body} view={view} />}
        {(!url || markers) && regions.map((r) => {
          const matches = conditions.filter((c) => regionHasCondition(r.area, c.area));
          const level = matches.some((c) => c.severity === "danger") ? "danger" : matches.some((c) => c.severity === "notice") ? "notice" : matches.length ? "stable" : "";
          const select = () => onSelect(active === r.area ? "全部" : r.area);
          return (
            <g key={r.area + r.x} tabIndex={0} role="button" aria-pressed={active === r.area} aria-label={r.area + (matches.length ? `，${matches.length} 条记录` : "")}
              data-area={r.area} data-level={level || undefined}
              className={"body-region " + (active === r.area ? "selected " : "") + (level ? "has-condition " + level : "")}
              onClick={select}
              onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); select(); } }}>
              <rect x={r.x * W} y={r.y * H} width={r.w * W} height={r.h * H} rx="18" />
              <title>{r.area}</title>
            </g>
          );
        })}
      </svg>
      {url && <button className="text-button body-marker-toggle" aria-pressed={markers} onClick={() => setMarkers(!markers)}>{markers ? "隐藏部位示意" : "显示部位示意"}</button>}
      {!url && <small className="body-diagram-note">{diagram ? "SVG 人体示意 · 可点击部位筛选记录" : ref ? "图片载入中或不可用，暂显示 SVG 人体示意" : "未导入" + (view === "back" ? "背面" : "正面") + "图，显示 SVG 人体示意"}</small>}
      <small className="body-diagram-note">部位位置为比例示意；自定义图片的姿势可能不同，也可使用右侧筛选。</small>
    </div>
  );
}
