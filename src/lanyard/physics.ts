/**
 * Hanging identity card: a damped pendulum (strap) with a stretch spring, a hinge
 * spring where the card hangs from the clip, a flip spring and a pointer-tilt spring.
 * Pure and deterministic; the component only feeds input and reads state.
 * Ideas (fixed 120 Hz step, gravity from a target period, throw velocity on release,
 * 6 px drag threshold) follow xu-yaoting/hanging-pass (MIT); this is a much smaller
 * single-pendulum model, not its Verlet rope.
 */
export const STEP = 1 / 120;
export const MAX_FRAME = 1 / 30;
export const DRAG_THRESHOLD = 6;

export interface Rig {
  length: number; // strap length, px
  angle: number; omega: number; // strap angle (rad) and angular velocity
  stretch: number; vStretch: number; // extra strap length, px
  hinge: number; vHinge: number; // card swing relative to the strap, rad
  flip: number; vFlip: number; // card rotateY, deg
  rx: number; ry: number; vrx: number; vry: number; // pointer tilt, deg
  tx: number; ty: number; // tilt targets
  dragging: boolean;
  accumulator: number;
}
export interface Tuning { period: number; damping: number; stretchK: number; stretchC: number; hingeK: number; hingeC: number; flipK: number; flipC: number; tiltK: number; tiltC: number; maxAngle: number }
export const TUNING: Tuning = { period: 1.9, damping: 1.1, stretchK: 140, stretchC: 9, hingeK: 90, hingeC: 7, flipK: 120, flipC: 13, tiltK: 160, tiltC: 18, maxAngle: 0.95 };

export function createRig(length: number): Rig {
  return { length, angle: 0, omega: 0, stretch: 0, vStretch: 0, hinge: 0, vHinge: 0, flip: 0, vFlip: 0, rx: 0, ry: 0, vrx: 0, vry: 0, tx: 0, ty: 0, dragging: false, accumulator: 0 };
}
/** Entrance: the card starts above its rest point and slightly to one side, then drops in. */
export function dropIn(rig: Rig): Rig {
  return { ...rig, stretch: -Math.min(rig.length * 0.9, 260), vStretch: 0, angle: 0.32, omega: -0.6, hinge: -0.15 };
}
/** Secret identity switch: the card turns in edge-on and gets a push. */
export function flipKick(rig: Rig, direction: 1 | -1 = 1): Rig {
  return { ...rig, flip: 90 * direction, vFlip: 0, omega: rig.omega + 1.4 * direction };
}

function substep(r: Rig, t: Tuning) {
  const dt = STEP;
  if (!r.dragging) {
    const g = (2 * Math.PI / t.period) ** 2; // g / L, so the period does not depend on pixel length
    const alpha = -g * Math.sin(r.angle) - t.damping * r.omega;
    r.omega += alpha * dt; r.angle += r.omega * dt;
    if (Math.abs(r.angle) > t.maxAngle) { r.angle = Math.sign(r.angle) * t.maxAngle; r.omega *= -0.3; }
    const a = -t.stretchK * r.stretch - t.stretchC * r.vStretch;
    r.vStretch += a * dt; r.stretch += r.vStretch * dt;
    // The card lags the strap: its hinge is driven by the strap's angular acceleration.
    const h = -t.hingeK * r.hinge - t.hingeC * r.vHinge - Math.max(-40, Math.min(40, alpha)) * 0.25;
    r.vHinge += h * dt; r.hinge += r.vHinge * dt;
    if (Math.abs(r.hinge) > 0.45) { r.hinge = Math.sign(r.hinge) * 0.45; r.vHinge = 0; }
  }
  const f = -t.flipK * r.flip - t.flipC * r.vFlip;
  r.vFlip += f * dt; r.flip += r.vFlip * dt;
  const x = t.tiltK * (r.tx - r.rx) - t.tiltC * r.vrx, y = t.tiltK * (r.ty - r.ry) - t.tiltC * r.vry;
  r.vrx += x * dt; r.rx += r.vrx * dt; r.vry += y * dt; r.ry += r.vry * dt;
}
/** Advances by a real frame time using fixed steps; long frames are clamped so the card never jumps. */
export function advance(rig: Rig, frame: number, tuning: Tuning = TUNING): Rig {
  const r = { ...rig };
  r.accumulator += Math.min(Math.max(frame, 0), MAX_FRAME);
  while (r.accumulator >= STEP) { substep(r, tuning); r.accumulator -= STEP; }
  return r;
}
export function atRest(r: Rig, epsilon = 0.002) {
  return !r.dragging && [r.angle, r.omega, r.hinge, r.vHinge, r.stretch / 100, r.vStretch / 100, r.flip / 90, r.vFlip / 90, (r.rx - r.tx) / 10, (r.ry - r.ty) / 10, r.vrx / 10, r.vry / 10].every(v => Math.abs(v) < epsilon);
}

/** Pointer relative to the pivot (px, y downwards). */
export function drag(rig: Rig, x: number, y: number, dt: number, tuning: Tuning = TUNING): Rig {
  const angle = Math.max(-tuning.maxAngle, Math.min(tuning.maxAngle, Math.atan2(x, Math.max(1, y))));
  const reach = Math.hypot(x, y) - rig.length;
  // Rubber band: stretching gets harder, compression is limited.
  const stretch = reach > 0 ? 60 * Math.tanh(reach / 120) : Math.max(reach, -rig.length * 0.35);
  const step = Math.max(dt, 1 / 240);
  const omega = rig.dragging ? 0.6 * rig.omega + 0.4 * (angle - rig.angle) / step : 0;
  const vStretch = rig.dragging ? 0.6 * rig.vStretch + 0.4 * (stretch - rig.stretch) / step : 0;
  return { ...rig, dragging: true, angle, omega, stretch, vStretch, hinge: rig.hinge * 0.8, vHinge: 0 };
}
/** Release keeps the throw, capped so a flick cannot spin the card over the clip. */
export function release(rig: Rig): Rig {
  const cap = 6;
  return { ...rig, dragging: false, omega: Math.max(-cap, Math.min(cap, rig.omega)), vStretch: Math.max(-1500, Math.min(1500, rig.vStretch)) };
}
/** Pointer position over the card, 0–1 on both axes, sets the tilt target; null returns to flat. */
export function aim(rig: Rig, point: { x: number; y: number } | null): Rig {
  if (!point) return { ...rig, tx: 0, ty: 0 };
  const x = Math.max(0, Math.min(1, point.x)), y = Math.max(0, Math.min(1, point.y));
  return { ...rig, tx: (0.5 - y) * 14, ty: (x - 0.5) * 18 };
}
/** Values the view writes to CSS. */
export function pose(r: Rig) {
  const deg = 180 / Math.PI;
  const holo = Math.min(1, Math.hypot(r.rx, r.ry) / 12 + Math.abs(r.omega) / 6);
  return {
    swing: r.angle * deg, hinge: r.hinge * deg, drop: r.stretch, flip: r.flip, rx: r.rx, ry: r.ry,
    lightX: 50 + r.ry * 2.6 - r.angle * 40, lightY: 40 - r.rx * 2.6, holo,
    bend: Math.max(-24, Math.min(24, -r.omega * 7)),
  };
}
