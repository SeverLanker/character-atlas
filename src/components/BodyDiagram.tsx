import { useEffect, useState } from "react";
import { bodyRegions, bodyTypeLabels, regionHasCondition, type BodyProfile } from "../body";
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
export function BodySilhouette({ body }: { body: BodyProfile }) {
  const r = Object.fromEntries(bodyRegions(body).map((x) => [x.area, x]));
  const px = (n: number) => n * W, py = (n: number) => n * H;
  const head = r["头部"], chest = r["胸部"], belly = r["腹部"];
  const limb = (a: string) => <rect key={a} x={px(r[a].x) + 8} y={py(r[a].y)} width={px(r[a].w) - 16} height={py(r[a].h)} rx="40" />;
  return (
    <g className="body-silhouette" aria-hidden="true">
      <ellipse cx={W / 2} cy={py(head.y + head.h / 2)} rx={px(head.w) / 2} ry={py(head.h) / 2} />
      <rect x={px(r["颈部"].x)} y={py(r["颈部"].y) - 4} width={px(r["颈部"].w)} height={py(r["颈部"].h) + 8} rx="20" />
      <rect x={px(chest.x)} y={py(chest.y)} width={px(chest.w)} height={py(chest.h + belly.h)} rx="70" />
      {["左臂", "右臂", "左手", "右手", "左腿", "右腿", "左脚", "右脚"].map(limb)}
    </g>
  );
}

export function BodyDiagram({ body, conditions, active, onSelect }: {
  body: BodyProfile; conditions: Condition[]; active: string; onSelect: (area: string) => void;
}) {
  const [view, setView] = useState<"front" | "back">("front");
  const ref = view === "back" ? body.back : body.front;
  const url = useAssetUrl(ref);
  const regions = bodyRegions(body, view);
  return (
    <div className="body-diagram">
      <div className="body-diagram-tools">
        <span>{bodyTypeLabels[body.body_type]} · {Math.round(body.height_cm)} cm{body.name ? " · " + body.name : ""}</span>
        <span role="group" aria-label="人体图朝向">
          <button className={view === "front" ? "active" : ""} aria-pressed={view === "front"} onClick={() => setView("front")}>正面</button>
          <button className={view === "back" ? "active" : ""} aria-pressed={view === "back"} onClick={() => setView("back")}>背面</button>
        </span>
      </div>
      <svg className="body-map" viewBox={`0 0 ${W} ${H}`} role="group" aria-label="身体部位选择" data-view={view}>
        {url ? <image href={url} width={W} height={H} preserveAspectRatio="xMidYMid meet" /> : <BodySilhouette body={body} />}
        {regions.map((r) => {
          const matches = conditions.filter((c) => regionHasCondition(r.area, c.area));
          const level = matches.some((c) => c.severity === "danger") ? "danger" : matches.some((c) => c.severity === "notice") ? "notice" : matches.length ? "stable" : "";
          const select = () => onSelect(active === r.area ? "全部" : r.area);
          return (
            <g key={r.area + r.x} tabIndex={0} role="button" aria-label={r.area + (matches.length ? `，${matches.length} 条记录` : "")}
              data-area={r.area} data-level={level || undefined}
              className={"body-region " + (active === r.area ? "selected " : "") + (level ? "has-condition " + level : "")}
              onClick={select}
              onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); select(); } }}>
              <rect x={r.x * W} y={r.y * H} width={r.w * W} height={r.h * H} rx="18" />
            </g>
          );
        })}
      </svg>
      {!url && <small className="body-diagram-note">{ref ? "图片无法读取，显示内置剪影" : "未导入" + (view === "back" ? "背面" : "正面") + "图，显示内置剪影"}</small>}
    </div>
  );
}
