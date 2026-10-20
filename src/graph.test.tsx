// @vitest-environment happy-dom
import "fake-indexeddb/auto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { createCharacter, duplicateVersion, type Library, type Relationship } from "./model";
import { ALL_COLLECTIONS, buildRelationshipGraph, edgeLabel, filterGraph, layoutGraph, loadSavedPositions, neighbors, savePositions } from "./graph";
import { RelationshipGraphView } from "./views/RelationshipGraphView";
import App from "./App";
import { saveLibrary } from "./storage";

afterEach(() => { cleanup(); localStorage.clear(); });
const rel = (title: string, targetCharacterId?: string, id = title): Relationship => ({ id, title, text: "", targetCharacterId });

function sample() {
  const a = createCharacter("阿岚", "雾港"), b = createCharacter("白榆", "雾港"), c = createCharacter("辰", "星渊"), d = createCharacter("独行者", "星渊");
  a.versions[0].profile.relationships = [rel("搭档", b.id), rel("搭档", b.id, "dup"), rel("旧识", "missing"), rel("自己", a.id), rel("纯文字")];
  b.versions[0].profile.relationships = [rel("搭档", a.id)];
  c.versions[0].profile.relationships = [rel("宿敌", a.id)];
  // 秘密关系与非默认版本不得出现
  d.versions[0].secret.enabled = true;
  d.versions[0].secret.overrides.relationships = [rel("秘密主人", a.id)];
  const later = duplicateVersion(d.versions[0], "后期");
  later.profile.relationships = [rel("后来结识", b.id)];
  d.versions.push(later);
  const library: Library = { schemaVersion: 2, characters: [a, b, c, d] };
  return { library, a, b, c, d };
}

describe("关系图数据", () => {
  it("边去重、双向合并、忽略失效目标、自指和纯文字关系", () => {
    const { library, a, b, c } = sample();
    const g = buildRelationshipGraph(library);
    expect(g.nodes).toHaveLength(4);
    expect(g.edges).toHaveLength(2);
    const ab = g.edges.find((e) => [e.source, e.target].sort().join() === [a.id, b.id].sort().join())!;
    expect(ab.mutual).toBe(true);
    expect(ab.labels).toHaveLength(2);
    const names = new Map(g.nodes.map((n) => [n.id, n.name]));
    expect(edgeLabel(ab, names)).toBe("搭档 ⇄");
    const ac = g.edges.find((e) => e.source === c.id || e.target === c.id)!;
    expect(ac.mutual).toBe(false);
    expect(edgeLabel(ac, names)).toBe("宿敌");
  });
  it("不读取秘密覆盖或非默认版本的关系", () => {
    const { library, d } = sample();
    const g = buildRelationshipGraph(library);
    expect(g.edges.some((e) => e.source === d.id || e.target === d.id)).toBe(false);
    expect(JSON.stringify(g)).not.toContain("秘密主人");
    expect(JSON.stringify(g)).not.toContain("后来结识");
  });
  it("默认版本切换后使用新默认版本的关系", () => {
    const { library, d } = sample();
    d.defaultVersionId = d.versions[1].id;
    expect(buildRelationshipGraph(library).edges.some((e) => e.labels.some((l) => l.title === "后来结识"))).toBe(true);
  });
  it("按世界观筛选并可隐藏孤立角色", () => {
    const { library, a, d } = sample();
    const g = buildRelationshipGraph(library);
    const fog = filterGraph(g, { collection: "雾港", hideIsolated: false });
    expect(fog.nodes.map((n) => n.name).sort()).toEqual(["白榆", "阿岚"].sort());
    expect(fog.edges).toHaveLength(1);
    const star = filterGraph(g, { collection: "星渊", hideIsolated: true });
    expect(star.nodes).toHaveLength(0);
    const all = filterGraph(g, { collection: ALL_COLLECTIONS, hideIsolated: true });
    expect(all.nodes.some((n) => n.id === d.id)).toBe(false);
    expect([...neighbors(all, a.id)]).toHaveLength(3);
  });
  it("布局可复现、在画布内，保存的位置作为固定点", () => {
    const { library, a } = sample();
    const g = buildRelationshipGraph(library);
    const p1 = layoutGraph(g), p2 = layoutGraph(g);
    expect(p1).toEqual(p2);
    for (const p of Object.values(p1)) { expect(p.x).toBeGreaterThanOrEqual(40); expect(p.x).toBeLessThanOrEqual(960); }
    expect(layoutGraph(g, { [a.id]: { x: 123, y: 456 } })[a.id]).toEqual({ x: 123, y: 456 });
  });
  it("节点位置只存为本机偏好，坏数据被忽略", () => {
    savePositions({ x1: { x: 1, y: 2 } });
    expect(loadSavedPositions()).toEqual({ x1: { x: 1, y: 2 } });
    localStorage.setItem("atlas-graph-positions", '{"bad":{"x":"1"},"ok":{"x":3,"y":4}}');
    expect(loadSavedPositions()).toEqual({ ok: { x: 3, y: 4 } });
    savePositions(null);
    expect(loadSavedPositions()).toEqual({});
  });
});

describe("关系图视图", () => {
  it("空库与无关系时显示空状态", () => {
    const { rerender } = render(<RelationshipGraphView library={{ schemaVersion: 2, characters: [] }} onOpen={() => {}} />);
    expect(screen.getByText("资料库还没有角色")).toBeTruthy();
    rerender(<RelationshipGraphView library={{ schemaVersion: 2, characters: [createCharacter("孤")] }} onOpen={() => {}} />);
    expect(screen.getByText(/还没有关联角色的关系/)).toBeTruthy();
  });
  it("点击、Enter 打开档案；筛选与搜索定位；秘密标签不渲染", () => {
    const { library, a, c } = sample();
    const onOpen = vi.fn();
    const { container } = render(<RelationshipGraphView library={library} onOpen={onOpen} />);
    expect(container.querySelectorAll("[data-edge]")).toHaveLength(2);
    expect(screen.queryByText(/秘密主人/)).toBeNull();
    const node = screen.getByRole("button", { name: /^阿岚/ });
    fireEvent.pointerDown(node, { clientX: 10, clientY: 10, pointerId: 1 });
    fireEvent.pointerUp(node, { clientX: 10, clientY: 10, pointerId: 1 });
    expect(onOpen).toHaveBeenLastCalledWith(a);
    fireEvent.keyDown(screen.getByRole("button", { name: /^辰/ }), { key: "Enter" });
    expect(onOpen).toHaveBeenLastCalledWith(c);
    fireEvent.change(screen.getByLabelText("按世界观筛选"), { target: { value: "雾港" } });
    expect(screen.queryByRole("button", { name: /^辰/ })).toBeNull();
    fireEvent.change(screen.getByLabelText("搜索并定位角色"), { target: { value: "白" } });
    fireEvent.click(screen.getByRole("button", { name: "定位 白榆" }));
    expect(container.querySelector(".graph-node.active")?.getAttribute("aria-label")).toMatch(/^白榆/);
    fireEvent.click(screen.getByLabelText("隐藏没有关系的角色"));
    expect(container.querySelectorAll("[data-node]")).toHaveLength(2);
  });
  it("从侧栏进入关系图，点击节点进入该角色档案", async () => {
    const { library } = sample();
    await saveLibrary(library);
    render(<App />);
    const entries = await screen.findAllByRole("button", { name: "关系图" });
    expect(entries.length).toBe(2); // 侧栏与书架标题各一个入口
    fireEvent.click(entries[0]);
    const node = await screen.findByRole("button", { name: /^白榆，/ });
    fireEvent.pointerDown(node, { clientX: 5, clientY: 5, pointerId: 1 });
    fireEvent.pointerUp(node, { clientX: 5, clientY: 5, pointerId: 1 });
    await waitFor(() => expect(screen.getByText("白榆的设定册")).toBeTruthy());
  });
});
