import { describe, expect, it } from "vitest";
import { advance, aim, atRest, createRig, drag, dropIn, flipKick, pose, release, STEP, TUNING } from "./physics";

const run = (rig = createRig(200), seconds = 1) => { let r = rig; for (let i = 0; i < seconds * 60; i++) r = advance(r, 1 / 60); return r; };

describe("lanyard physics", () => {
  it("a resting card stays at rest", () => {
    expect(atRest(run(createRig(200), 2))).toBe(true);
  });
  it("drop-in swings, then settles", () => {
    const start = dropIn(createRig(220));
    expect(start.stretch).toBeLessThan(0);
    const mid = run(start, 0.5);
    expect(atRest(mid)).toBe(false);
    expect(atRest(run(start, 14))).toBe(true);
  });
  it("period follows the tuning, independent of strap length", () => {
    const crossings = (length: number) => {
      let r = { ...createRig(length), angle: 0.1 }, last = r.angle, t = 0; const times: number[] = [];
      while (t < 4) { r = advance(r, STEP); t += STEP; if (Math.sign(r.angle) !== Math.sign(last)) times.push(t); last = r.angle; }
      return (times[2] - times[0]);
    };
    expect(crossings(120)).toBeCloseTo(crossings(400), 2);
    expect(crossings(200)).toBeGreaterThan(TUNING.period * 0.95);
    expect(crossings(200)).toBeLessThan(TUNING.period * 1.15);
  });
  it("frame time is clamped and stepped at a fixed rate", () => {
    const a = advance(dropIn(createRig(200)), 5), b = advance(dropIn(createRig(200)), 1 / 30);
    expect(a.stretch).toBeCloseTo(b.stretch, 6);
    let c = dropIn(createRig(200)); for (let i = 0; i < 4; i++) c = advance(c, 1 / 120);
    let d = dropIn(createRig(200)); d = advance(d, 1 / 60); d = advance(d, 1 / 60);
    expect(c.angle).toBeCloseTo(d.angle, 9);
  });
  it("drag follows the pointer, clamps the angle and rubber-bands the strap", () => {
    let r = drag(createRig(200), 0, 200, 1 / 60);
    expect(r.dragging).toBe(true); expect(r.angle).toBeCloseTo(0);
    r = drag(r, 5000, 10, 1 / 60);
    expect(r.angle).toBeCloseTo(TUNING.maxAngle);
    expect(r.stretch).toBeLessThanOrEqual(60);
    expect(drag(createRig(200), 0, 10, 1 / 60).stretch).toBeGreaterThanOrEqual(-70);
  });
  it("release carries the throw, capped", () => {
    let r = drag(createRig(200), 0, 200, 1 / 60);
    r = drag(r, 120, 180, 1 / 120);
    const thrown = release(r);
    expect(thrown.dragging).toBe(false);
    expect(thrown.omega).toBeGreaterThan(0);
    expect(Math.abs(thrown.omega)).toBeLessThanOrEqual(6);
    expect(run(thrown, 0.2).angle).not.toBeCloseTo(thrown.angle, 2);
  });
  it("the card hinge stays bounded even after a hard throw", () => {
    let r = { ...release({ ...drag(createRig(200), 0, 200, 1 / 60), omega: 50 }) }, worst = 0;
    for (let i = 0; i < 600; i++) { r = advance(r, 1 / 60); worst = Math.max(worst, Math.abs(r.hinge)); }
    expect(worst).toBeLessThanOrEqual(0.45);
  });
  it("flip kick turns in from edge-on and lands flat", () => {
    const r = flipKick(createRig(200));
    expect(r.flip).toBe(90);
    const settled = run(r, 4);
    expect(Math.abs(settled.flip)).toBeLessThan(0.5);
  });
  it("tilt follows the pointer and returns flat; pose stays bounded", () => {
    let r = aim(createRig(200), { x: 1, y: 0 });
    r = run(r, 1);
    expect(r.rx).toBeCloseTo(7, 0); expect(r.ry).toBeCloseTo(9, 0);
    const p = pose(r);
    expect(p.holo).toBeGreaterThan(0.5); expect(p.holo).toBeLessThanOrEqual(1);
    r = run(aim(r, null), 2);
    expect(atRest(r)).toBe(true);
    expect(pose({ ...r, omega: 100 }).bend).toBe(-24);
  });
});
