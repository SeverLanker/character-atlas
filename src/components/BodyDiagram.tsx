import { useEffect, useState } from "react";
import { bodyRegions, bodyTypeLabels, regionHasCondition, type BodyProfile, type BodyImages } from "../body";
import type { Condition } from "../model";
import { imageUrl } from "../storage";
import { BodyStudy3D } from "./BodyStudy3D";
import { BodySilhouette } from "./BodySilhouette";

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

type DiagramProps = {
  body?: BodyProfile; images?: BodyImages; conditions: Condition[]; active: string; onSelect: (area: string) => void;
};
export function BodyDiagram(props: DiagramProps) {
  return props.images?.model === "porcelain" ? <BodyStudy3D {...props} fallback={<BodyDiagram2D {...props} />} /> : <BodyDiagram2D {...props} />;
}

function BodyDiagram2D({ body, images, conditions, active, onSelect }: DiagramProps) {
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
      <svg className={"body-map" + (!url ? " body-map-vector" : "")} viewBox={`0 0 ${W} ${H}`} role="group" aria-label="身体部位选择" data-view={view}>
        <g className="body-diagram-guides" aria-hidden="true"><path d="M500 15V1485 M160 1455H840 M180 45H820V1455H180Z" /><ellipse cx="500" cy="750" rx="350" ry="660" /></g>
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
              {matches.length > 0 && <circle className="body-region-dot" cx={(r.x + r.w / 2) * W} cy={(r.y + r.h / 2) * H} r="8" aria-hidden="true" />}
              <title>{r.area}</title>
            </g>
          );
        })}
      </svg>
      {!url && <div className="body-diagram-legend" aria-label="身体记录图例"><span data-level="stable">稳定</span><span data-level="notice">关注</span><span data-level="danger">异常</span><span>{active === "全部" ? "点击部位筛选" : "已选 · " + active}</span></div>}
      {url && <button className="text-button body-marker-toggle" aria-pressed={markers} onClick={() => setMarkers(!markers)}>{markers ? "隐藏部位示意" : "显示部位示意"}</button>}
      {!url && <small className="body-diagram-note">{diagram ? "SVG 人体示意 · 可点击部位筛选记录" : ref ? "图片载入中或不可用，暂显示 SVG 人体示意" : "未导入" + (view === "back" ? "背面" : "正面") + "图，显示 SVG 人体示意"}</small>}
      <small className="body-diagram-note">部位位置为比例示意；自定义图片的姿势可能不同，也可使用右侧筛选。</small>
    </div>
  );
}
