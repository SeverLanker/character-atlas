import { defaultVersion, type Library } from "./model";

/** 关系图只读取每位角色「默认公开版本」的表层关系，从不读取秘密覆盖。 */
export interface GraphNode { id: string; name: string; collection: string; portrait: string; accent: string }
export interface EdgeLabel { from: string; to: string; title: string }
export interface GraphEdge { id: string; source: string; target: string; labels: EdgeLabel[]; mutual: boolean }
export interface RelationshipGraph { nodes: GraphNode[]; edges: GraphEdge[] }

export function buildRelationshipGraph(library: Library): RelationshipGraph {
  const ids = new Set(library.characters.map((c) => c.id));
  const nodes = library.characters.map((c) => ({
    id: c.id, name: c.name, collection: c.collection, accent: c.accent,
    portrait: defaultVersion(c).profile.portrait,
  }));
  const edges = new Map<string, GraphEdge>();
  for (const c of library.characters) {
    for (const r of defaultVersion(c).profile.relationships) {
      const to = r.targetCharacterId;
      if (!to || to === c.id || !ids.has(to)) continue;
      const [source, target] = c.id < to ? [c.id, to] : [to, c.id];
      const id = source + "|" + target;
      const edge = edges.get(id) ?? { id, source, target, labels: [], mutual: false };
      const title = r.title.trim() || "关联";
      if (!edge.labels.some((l) => l.from === c.id && l.title === title)) edge.labels.push({ from: c.id, to, title });
      edge.mutual = new Set(edge.labels.map((l) => l.from)).size === 2;
      edges.set(id, edge);
    }
  }
  return { nodes, edges: [...edges.values()].sort((a, b) => a.id.localeCompare(b.id)) };
}

export interface GraphFilter { collection: string; hideIsolated: boolean }
export const ALL_COLLECTIONS = "全部世界";
export function filterGraph(graph: RelationshipGraph, { collection, hideIsolated }: GraphFilter): RelationshipGraph {
  let nodes = collection === ALL_COLLECTIONS ? graph.nodes : graph.nodes.filter((n) => n.collection === collection);
  const visible = new Set(nodes.map((n) => n.id));
  const edges = graph.edges.filter((e) => visible.has(e.source) && visible.has(e.target));
  if (hideIsolated) {
    const linked = new Set(edges.flatMap((e) => [e.source, e.target]));
    nodes = nodes.filter((n) => linked.has(n.id));
  }
  return { nodes, edges };
}
export function neighbors(graph: RelationshipGraph, id: string): Set<string> {
  const result = new Set([id]);
  for (const e of graph.edges) {
    if (e.source === id) result.add(e.target);
    if (e.target === id) result.add(e.source);
  }
  return result;
}
export function edgeLabel(edge: GraphEdge, names: Map<string, string>): string {
  if (edge.mutual && new Set(edge.labels.map((l) => l.title)).size === 1) return edge.labels[0].title + " ⇄";
  return edge.labels.map((l) => (edge.labels.length > 1 ? `${names.get(l.from) ?? ""}→${l.title}` : l.title)).join(" / ");
}

export type Positions = Record<string, { x: number; y: number }>;
/**
 * 确定性力导向布局：初始按 id 排序放在圆上，固定迭代次数，无随机数，同样输入得到同样结果。
 * 已有位置（如用户保存的布局）作为固定点。
 */
export function layoutGraph(graph: RelationshipGraph, fixed: Positions = {}, size = 1000): Positions {
  const sorted = [...graph.nodes].sort((a, b) => a.id.localeCompare(b.id));
  const linkedIds = new Set(graph.edges.flatMap((e) => [e.source, e.target]));
  const linked = sorted.filter((n) => linkedIds.has(n.id));
  const isolated = sorted.filter((n) => !linkedIds.has(n.id));
  const pos: Positions = {};
  // 孤立角色排在底部一行或几行，不参与力导向。
  const band = isolated.length ? size * 0.16 : 0;
  const perRow = Math.max(1, Math.floor((size - 80) / 130));
  isolated.forEach((node, i) => {
    const row = Math.floor(i / perRow), col = i % perRow, count = Math.min(perRow, isolated.length - row * perRow);
    pos[node.id] = fixed[node.id] ? { ...fixed[node.id] } : { x: size / 2 + (col - (count - 1) / 2) * 130, y: size - 60 - row * 110 };
  });
  const area = size - band;
  const n = linked.length, c = size / 2, cy = area / 2, radius = area * 0.35;
  linked.forEach((node, i) => {
    pos[node.id] = fixed[node.id] ? { ...fixed[node.id] } : { x: c + radius * Math.cos((2 * Math.PI * i) / n), y: cy + radius * Math.sin((2 * Math.PI * i) / n) };
  });
  if (n >= 2) {
    const k = Math.sqrt((size * area) / n) * 0.6;
    for (let iter = 0; iter < 300; iter++) {
      const temp = size * 0.1 * (1 - iter / 300);
      const disp: Record<string, { x: number; y: number }> = {};
      for (const a of linked) {
        disp[a.id] = { x: (c - pos[a.id].x) * 0.05, y: (cy - pos[a.id].y) * 0.05 };
        for (const b of linked) {
          if (a === b) continue;
          const dx = pos[a.id].x - pos[b.id].x, dy = pos[a.id].y - pos[b.id].y;
          const d = Math.max(Math.hypot(dx, dy), 1);
          disp[a.id].x += (dx / d) * (k * k) / d; disp[a.id].y += (dy / d) * (k * k) / d;
        }
      }
      for (const e of graph.edges) {
        const dx = pos[e.source].x - pos[e.target].x, dy = pos[e.source].y - pos[e.target].y;
        const d = Math.max(Math.hypot(dx, dy), 1), f = (d * d) / k;
        disp[e.source].x -= (dx / d) * f; disp[e.source].y -= (dy / d) * f;
        disp[e.target].x += (dx / d) * f; disp[e.target].y += (dy / d) * f;
      }
      for (const a of linked) {
        if (fixed[a.id]) continue;
        const d = Math.max(Math.hypot(disp[a.id].x, disp[a.id].y), 1e-6);
        pos[a.id].x += (disp[a.id].x / d) * Math.min(d, temp);
        pos[a.id].y += (disp[a.id].y / d) * Math.min(d, temp);
      }
    }
    // 没有固定点时把结果等比缩放并居中到上方区域，避免整体偏向一侧。
    if (!linked.some((node) => fixed[node.id])) {
      const xs = linked.map((node) => pos[node.id].x), ys = linked.map((node) => pos[node.id].y);
      const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
      const margin = size * 0.12, span = Math.max(maxX - minX, maxY - minY, 1);
      const scale = Math.min((area - margin * 2) / span, 2.5);
      const ox = (size - (maxX - minX) * scale) / 2, oy = (area - (maxY - minY) * scale) / 2;
      for (const node of linked) pos[node.id] = { x: ox + (pos[node.id].x - minX) * scale, y: oy + (pos[node.id].y - minY) * scale };
    }
  } else if (n === 1 && !fixed[linked[0].id]) pos[linked[0].id] = { x: c, y: cy };
  for (const id in pos) pos[id] = {
    x: Math.round(Math.min(size - 40, Math.max(40, pos[id].x)) * 10) / 10,
    y: Math.round(Math.min(size - 40, Math.max(40, pos[id].y)) * 10) / 10,
  };
  return pos;
}

const STORAGE_KEY = "atlas-graph-positions";
/** 节点位置只作为本机 UI 偏好保存在 localStorage，不写入角色资料，也不进入备份。 */
export function loadSavedPositions(): Positions {
  try {
    const value = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}");
    if (!value || typeof value !== "object") return {};
    const out: Positions = {};
    for (const [id, p] of Object.entries(value as Record<string, { x: unknown; y: unknown }>))
      if (typeof p?.x === "number" && typeof p?.y === "number" && Number.isFinite(p.x) && Number.isFinite(p.y)) out[id] = { x: p.x, y: p.y };
    return out;
  } catch { return {}; }
}
export function savePositions(positions: Positions | null): void {
  try { if (positions) localStorage.setItem(STORAGE_KEY, JSON.stringify(positions)); else localStorage.removeItem(STORAGE_KEY); } catch { /* 偏好保存失败不影响使用 */ }
}
