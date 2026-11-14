/**
 * Pure helpers for document motion in the wallet (focus view, card flip,
 * spring tilt). No DOM access here, so every function is unit-testable.
 *
 * Opus 5.5 references (awesome-opus5-5-videos/data/videos.json):
 * - twoclipping-402193 — one element morphing through many states, driven by
 *   closed-form springs ("a value that changes target many times is the sum
 *   of one spring per change"). The tilt below follows that idea: pointer
 *   moves only retarget the spring; a rAF loop integrates it, so the card
 *   settles instead of snapping. No CSS transitions on the tilt path.
 * - ajith-io-615243 — canvas particles. Not used: the ambient-particle scope
 *   was dropped from this branch (see the PR body).
 */

import {
  documentLabel,
  type CharacterDocument,
  type DocumentField,
  type DocumentType,
} from "./documents";

/** One damped-spring integration step (semi-implicit Euler, stable at 60 Hz). */
export function springStep(
  current: number,
  target: number,
  velocity: number,
  stiffness = 170,
  damping = 22,
  dt = 1 / 60,
): { value: number; velocity: number } {
  const accel = -stiffness * (current - target) - damping * velocity;
  const nextVelocity = velocity + accel * dt;
  return { value: current + nextVelocity * dt, velocity: nextVelocity };
}

/** True once a spring is close enough to its target to stop the rAF loop. */
export function springSettled(
  current: number,
  target: number,
  velocity: number,
  epsilon = 0.01,
): boolean {
  return Math.abs(current - target) < epsilon && Math.abs(velocity) < epsilon;
}

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

/**
 * Pointer position inside the card (0..1 on each axis, clamped) -> tilt in
 * degrees plus the gloss position in percent. Mirrors the existing
 * IdentityDisplay ranges (±3.5° X, ±4.5° Y) so the two faces feel alike.
 */
export function tiltFromPointer(
  x: number,
  y: number,
  maxRx = 3.5,
  maxRy = 4.5,
): { rx: number; ry: number; lightX: number; lightY: number } {
  const cx = clamp01(x);
  const cy = clamp01(y);
  return {
    rx: (0.5 - cy) * 2 * maxRx,
    ry: (cx - 0.5) * 2 * maxRy,
    lightX: cx * 100,
    lightY: cy * 100,
  };
}

/**
 * True when a click target is an interactive element — a button, link, form
 * control, or anything with role="button" — and must NOT enter the focus
 * view. The secret triggers (portrait / name / emblem) are all <button>s in
 * DocumentFace, so they are covered by this one guard.
 */
export function isFocusGuardTarget(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  return (
    target.closest(
      "button, a, input, select, textarea, [role='button'], [contenteditable='true']",
    ) !== null
  );
}

/** The focus view may only open when no delete/inherit confirm dialog is open. */
export function canEnterFocus(confirmOpen: boolean): boolean {
  return !confirmOpen;
}

/** Booklet-style documents open around a left spine instead of flipping 180°. */
export function isBookletType(type: DocumentType): boolean {
  return type === "passport" || type === "police";
}

export interface BookletPageRow {
  label: string;
  value: string;
}
export interface BookletPage {
  /** Page heading, e.g. "个人资料页" / "签发页". */
  title: string;
  /** Show the portrait photo on this page. */
  photo: boolean;
  /** Real filled fields only; empty fields are skipped. */
  rows: BookletPageRow[];
  /** Show the MRZ band (passport data page). */
  mrz: boolean;
}

/**
 * Inner pages of an opened booklet. Only fields the document actually has
 * filled are listed — nothing is invented (no visa pages, stamps or records).
 * The issue page is omitted entirely when none of its fields are filled, so
 * empty fields never take up a page.
 */
export function bookletPages(doc: CharacterDocument): BookletPage[] {
  if (!isBookletType(doc.type)) return [];
  const rows = (keys: readonly DocumentField[]): BookletPageRow[] =>
    keys
      .filter((key) => doc.fields[key]?.trim())
      .map((key) => ({
        label: documentLabel(doc.type, key),
        value: doc.fields[key]!,
      }));
  const issue = rows(["issuer", "issued", "expires", "notes"]);
  const pages: BookletPage[] = [
    doc.type === "passport"
      ? {
          title: "个人资料页",
          photo: true,
          rows: rows([
            "holder",
            "romanName",
            "gender",
            "birthday",
            "nationality",
            "birthplace",
            "number",
          ]),
          mrz: true,
        }
      : {
          title: "内页",
          photo: true,
          rows: rows([
            "holder",
            "organization",
            "department",
            "rank",
            "position",
            "number",
          ]),
          mrz: false,
        },
  ];
  if (issue.length > 0) {
    pages.push({ title: "签发页", photo: false, rows: issue, mrz: false });
  }
  return pages;
}
