import { useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { Maximize2, Minus, Network, Plus, Search } from "lucide-react";
import type { Character, Library } from "../model";
import { Portrait } from "../components/Portrait";
import {
  ALL_COLLECTIONS, buildRelationshipGraph, edgeLabel, filterGraph, layoutGraph, loadSavedPositions, neighbors, savePositions, type Positions,
} from "../graph";

const SIZE = 1000, R = 34;
type Drag = { kind: "pan"; x: number; y: number; tx: number; ty: number } | { kind: "node"; id: string; x: number; y: number; moved: boolean };

/** 只读关系图：节点为角色，边来自各角色默认公开版本中带关联角色的关系。 */
export function RelationshipGraphView({ library, onOpen }: { library: Library; onOpen: (character: Character) => void }) {
  const full = useMemo(() => buildRelationshipGraph(library), [library]);
  const collections = useMemo(() => [...new Set(library.characters.map((c) => c.collection))], [library]);
  const [collection, setCollection] = useState(ALL_COLLECTIONS);
  const [hideIsolated, setHideIsolated] = useState(false);
  const [query, setQuery] = useState("");
  const [focus, setFocus] = useState("");
  const [hover, setHover] = useState("");
  const [saved, setSaved] = useState<Positions>(() => loadSavedPositions());
  const [manual, setManual] = useState<Positions>({});
  const [view, setView] = useState({ tx: 0, ty: 0, scale: 1 });
  const svg = useRef<SVGSVGElement>(null);
  const drag = useRef<Drag | null>(null);
  const graph = useMemo(() => filterGraph(full, { collection, hideIsolated }), [full, collection, hideIsolated]);
  const base = useMemo(() => layoutGraph(graph, saved, SIZE), [graph, saved]);
  const pos = { ...base, ...manual };
  const names = new Map(full.nodes.map((n) => [n.id, n.name]));
  const active = hover || focus;
  const lit = active ? neighbors(graph, active) : null;
  const characters = new Map(library.characters.map((c) => [c.id, c]));
  const matches = query.trim() ? graph.nodes.filter((n) => n.name.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase())) : [];

  function toWorld(e: { clientX: number; clientY: number }) {
    const rect = svg.current?.getBoundingClientRect();
    const sx = rect && rect.width ? SIZE / rect.width : 1, sy = rect && rect.height ? SIZE / rect.height : 1;
    return { x: ((e.clientX - (rect?.left ?? 0)) * sx - view.tx) / view.scale, y: ((e.clientY - (rect?.top ?? 0)) * sy - view.ty) / view.scale };
  }
  function zoom(factor: number) {
    setView((v) => {
      const scale = Math.min(3, Math.max(0.4, v.scale * factor));
      const c = SIZE / 2;
      return { scale, tx: c - ((c - v.tx) / v.scale) * scale, ty: c - ((c - v.ty) / v.scale) * scale };
    });
  }
  function center(id: string) {
    const p = pos[id]; if (!p) return;
    setFocus(id);
    setView((v) => ({ ...v, tx: SIZE / 2 - p.x * v.scale, ty: SIZE / 2 - p.y * v.scale }));
  }
  function move(id: string, p: { x: number; y: number }) { setManual((m) => ({ ...m, [id]: p })); }
  function onPointerDown(e: ReactPointerEvent<SVGSVGElement>) {
    const node = (e.target as Element).closest("[data-node]")?.getAttribute("data-node");
    drag.current = node ? { kind: "node", id: node, x: e.clientX, y: e.clientY, moved: false } : { kind: "pan", x: e.clientX, y: e.clientY, tx: view.tx, ty: view.ty };
    svg.current?.setPointerCapture?.(e.pointerId);
  }
  function onPointerMove(e: ReactPointerEvent<SVGSVGElement>) {
    const d = drag.current; if (!d) return;
    if (d.kind === "pan") {
      const rect = svg.current?.getBoundingClientRect(); const s = rect && rect.width ? SIZE / rect.width : 1;
      setView((v) => ({ ...v, tx: d.tx + (e.clientX - d.x) * s, ty: d.ty + (e.clientY - d.y) * s }));
    } else if (d.moved || Math.hypot(e.clientX - d.x, e.clientY - d.y) > 4) {
      d.moved = true; move(d.id, toWorld(e));
    }
  }
  function onPointerUp() {
    const d = drag.current; drag.current = null;
    if (d?.kind === "node" && !d.moved) { const c = characters.get(d.id); if (c) onOpen(c); }
  }

  if (!library.characters.length)
    return <section className="relationship-graph empty"><Network size={30} /><h2>资料库还没有角色</h2><p>创建角色后，可以在「人际关系」中关联其他角色，这里会画出关系网。</p></section>;
  return (
    <section className="relationship-graph" aria-label="角色关系图">
      <div className="graph-toolbar">
        <label className="sort-control"><span>世界观</span>
          <select aria-label="按世界观筛选" value={collection} onChange={(e) => { setCollection(e.target.value); setFocus(""); }}>
            <option value={ALL_COLLECTIONS}>{ALL_COLLECTIONS}</option>
            {collections.map((c) => <option key={c} value={c}>{c || "未分类"}</option>)}
          </select>
        </label>
        <label className="graph-check"><input type="checkbox" checked={hideIsolated} onChange={(e) => setHideIsolated(e.target.checked)} />隐藏没有关系的角色</label>
        <label className="search-input"><Search size={15} />
          <input aria-label="搜索并定位角色" placeholder="定位角色…" value={query} onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && matches[0]) center(matches[0].id); }} />
        </label>
        <span className="graph-zoom" role="group" aria-label="缩放">
          <button className="icon-button" aria-label="缩小" onClick={() => zoom(1 / 1.2)}><Minus size={15} /></button>
          <button className="icon-button" aria-label="放大" onClick={() => zoom(1.2)}><Plus size={15} /></button>
          <button className="icon-button" aria-label="重置视图" onClick={() => setView({ tx: 0, ty: 0, scale: 1 })}><Maximize2 size={15} /></button>
        </span>
        <button className="button small" onClick={() => { const next = { ...saved, ...pos }; savePositions(next); setSaved(next); setManual({}); }}>保存布局</button>
        <button className="text-button" onClick={() => { savePositions(null); setSaved({}); setManual({}); }}>重置布局</button>
      </div>
      {!!matches.length && <div className="graph-matches">{matches.slice(0, 8).map((n) => <button key={n.id} className="button small" onClick={() => center(n.id)}>定位 {n.name}</button>)}</div>}
      {!graph.edges.length && <p className="graph-empty-note">{full.edges.length ? "当前筛选下没有关系。" : "还没有关联角色的关系。在编辑档案 →「人际关系」中点「关联角色」，这里就会出现连线。"}</p>}
      <svg ref={svg} className="graph-canvas" viewBox={`0 0 ${SIZE} ${SIZE}`} role="group" aria-label="关系网络"
        onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={() => (drag.current = null)}
        onWheel={(e) => zoom(e.deltaY < 0 ? 1.1 : 1 / 1.1)}>
        <g transform={`translate(${view.tx} ${view.ty}) scale(${view.scale})`}>
          {graph.edges.map((e) => {
            const a = pos[e.source], b = pos[e.target]; if (!a || !b) return null;
            const dim = lit && !(lit.has(e.source) && lit.has(e.target) && (e.source === active || e.target === active));
            return <g key={e.id} className={"graph-edge" + (e.mutual ? " mutual" : "") + (dim ? " dim" : lit ? " lit" : "")} data-edge={e.id}>
              <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} />
              <text x={(a.x + b.x) / 2} y={(a.y + b.y) / 2 - 6} textAnchor="middle">{edgeLabel(e, names)}</text>
            </g>;
          })}
          {graph.nodes.map((n) => {
            const p = pos[n.id]; if (!p) return null;
            const dim = lit && !lit.has(n.id);
            return <g key={n.id} data-node={n.id} transform={`translate(${p.x} ${p.y})`} tabIndex={0} role="button"
              aria-label={`${n.name}，${n.collection || "未分类"}，打开档案`}
              className={"graph-node" + (dim ? " dim" : "") + (active === n.id ? " active" : "")}
              style={{ ["--node-accent" as string]: n.accent }}
              onPointerEnter={() => setHover(n.id)} onPointerLeave={() => setHover("")}
              onFocus={() => setFocus(n.id)} onBlur={() => setFocus((f) => (f === n.id ? "" : f))}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") { e.preventDefault(); const c = characters.get(n.id); if (c) onOpen(c); }
                const step = { ArrowUp: [0, -20], ArrowDown: [0, 20], ArrowLeft: [-20, 0], ArrowRight: [20, 0] }[e.key];
                if (step) { e.preventDefault(); e.stopPropagation(); move(n.id, { x: p.x + step[0], y: p.y + step[1] }); }
              }}>
              <circle r={R + 4} className="graph-node-ring" />
              <foreignObject x={-R} y={-R} width={R * 2} height={R * 2}><Portrait image={n.portrait} className="graph-portrait" /></foreignObject>
              <text y={R + 22} textAnchor="middle">{n.name}</text>
            </g>;
          })}
        </g>
      </svg>
      <p className="graph-help">拖动空白处平移，滚轮或 ± 缩放，拖动头像调整位置，点击头像打开档案。键盘：Tab 选中角色，Enter 打开，方向键移动。关系来自各角色默认公开版本，不含秘密档案。</p>
    </section>
  );
}
