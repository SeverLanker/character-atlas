import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { bodyRegionAreas, regionHasCondition, type BodyProfile } from "../body";
import type { Condition } from "../model";
import type { BodyViewer, BodyView } from "../body3d/viewer";

export function BodyStudy3D({ body, conditions, active, onSelect, fallback }: {
  body?: BodyProfile; conditions: Condition[]; active: string; onSelect: (area: string) => void; fallback: ReactNode;
}) {
  const host = useRef<HTMLDivElement>(null), viewer = useRef<BodyViewer | null>(null);
  const current = useRef({ conditions, active, onSelect });
  const [state, setState] = useState<"loading" | "ready" | "failed">("loading");
  const [hover, setHover] = useState("");
  useLayoutEffect(() => {
    current.current = { conditions, active, onSelect };
    viewer.current?.update(conditions, active);
  }, [conditions, active, onSelect]);
  useEffect(() => {
    let alive = true;
    let mounted: BodyViewer | undefined;
    const element = host.current;
    setState("loading"); setHover("");
    void import("../body3d/viewer").then(({ mountBodyViewer }) => {
      if (!alive || !element) return;
      mounted = mountBodyViewer(element, {
        body,
        onSelect: area => { const latest = current.current; latest.onSelect(latest.active === area ? "全部" : area); },
        onHover: area => { if (alive) setHover(area); },
        onLost: () => { if (alive) { mounted?.dispose(); viewer.current = null; setState("failed"); } },
      });
      viewer.current = mounted;
      mounted.update(current.current.conditions, current.current.active);
      setState("ready");
    }).catch(() => { if (alive) { mounted?.dispose(); viewer.current = null; setState("failed"); } });
    return () => { alive = false; mounted?.dispose(); viewer.current = null; };
  }, [body?.body_type, body?.head_scale, body?.leg_length]);
  const view = (value: BodyView) => viewer.current?.view(value);
  return <section className="body-study" aria-label="风格化三维人体">
    <header className="body-study-heading"><div><small>BODY STUDY / 3D</small><h3>瓷质人体</h3></div><span>部位记录示意</span></header>
    {state === "failed" && <><p role="status" className="body-study-message">3D 暂不可用，已显示备用人体图。</p>{fallback}</>}
    <div className="body-study-content" hidden={state === "failed"}>
      <div className="body-study-tools" role="group" aria-label="三维视角">
        {([["front", "正面"], ["back", "背面"], ["left", "左侧"], ["right", "右侧"]] as const).map(([value, label]) => <button className="button small" disabled={state !== "ready"} key={value} onClick={() => view(value)}>{label}</button>)}
        <button className="icon-button" aria-label="放大人体" disabled={state !== "ready"} onClick={() => viewer.current?.zoom(1.2)}>＋</button>
        <button className="icon-button" aria-label="缩小人体" disabled={state !== "ready"} onClick={() => viewer.current?.zoom(1 / 1.2)}>－</button>
        <button className="text-button" disabled={state !== "ready"} onClick={() => view("front")}>复位</button>
      </div>
      <div className="body-study-stage" ref={host} aria-label="拖动旋转人体，点击部位查看记录">
        <span className="body-study-orbit" aria-hidden="true" />
        <span className="body-study-caption" aria-hidden="true">{hover || (active === "全部" ? "拖动旋转 · 点击部位" : active)}</span>
        {state === "loading" && <p role="status" className="body-study-message">正在准备三维人体…</p>}
      </div>
      <div className="body-study-legend"><span data-level="stable">有记录</span><span data-level="notice">需关注</span><span data-level="danger">异常</span><span data-level="active">选中</span></div>
      <div className="body-study-regions" role="group" aria-label="三维人体部位快捷选择">
        {bodyRegionAreas.map(area => {
          const count = conditions.filter(c => regionHasCondition(area, c.area)).length;
          return <button key={area} aria-pressed={active === area} onClick={() => onSelect(active === area ? "全部" : area)}>{area}{count ? ` · ${count}` : ""}</button>;
        })}
      </div>
      <p className="body-study-note">拖动旋转，滚轮或双指缩放；也可用上方视角和部位按钮操作。颜色来自当前档案的状态记录。</p>
    </div>
    <p className="body-study-note">风格化比例示意，并非角色肖像或精确解剖；不代表 Body Validator 模型。图片和 SVG 仍可在编辑中选择。</p>
  </section>;
}
