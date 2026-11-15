import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { BODY_SCHEMA, bodyTypes, type BodyProfile } from "./body";
import { BodySilhouette } from "./components/BodySilhouette";

describe("SVG 人体示意", () => {
  it("所有体型及比例边界都输出封闭连续、位于画布内的有限轮廓", () => {
    for (const body_type of bodyTypes) for (const head_scale of [.5, 1, 2]) for (const leg_length of [-1, 0, 1]) {
      const body: BodyProfile = { schema: BODY_SCHEMA, body_type, head_scale, leg_length, height_cm: 170, name: "", notes: "", morphs: {}, front: "", back: "" };
      for (const view of ["front", "back"] as const) {
        const markup = renderToStaticMarkup(<svg><BodySilhouette body={body} view={view} /></svg>);
        expect(markup).not.toMatch(/NaN|Infinity|undefined/);
        const contour = markup.match(/class="silhouette-contour" d="([^"]+)"/)?.[1];
        expect(contour).toMatch(/^M.+Z$/);
        const points = contour!.match(/-?\d+(?:\.\d+)?/g)!.map(Number);
        points.forEach(value => expect(value).toBeGreaterThanOrEqual(0));
        points.forEach((value, i) => expect(value).toBeLessThanOrEqual(i % 2 ? 1500 : 1000));
      }
    }
  });

  it("正背面的线稿不同，同时渲染多张时渐变引用不冲突，不依赖图片", () => {
    const front = renderToStaticMarkup(<svg><BodySilhouette /></svg>);
    const back = renderToStaticMarkup(<svg><BodySilhouette view="back" /></svg>);
    expect(front.match(/class="silhouette-detail" d="([^"]+)"/)?.[1]).not.toEqual(back.match(/class="silhouette-detail" d="([^"]+)"/)?.[1]);
    const pair = renderToStaticMarkup(<svg><BodySilhouette /><BodySilhouette view="back" /></svg>);
    const ids = [...pair.matchAll(/\bid="([^"]+)"/g)].map(match => match[1]);
    expect(new Set(ids).size).toBe(ids.length);
    for (const match of pair.matchAll(/url\(#([^)]+)\)/g)) expect(ids).toContain(match[1]);
    expect(pair).not.toMatch(/<image|<animate|<script/);
  });
});
