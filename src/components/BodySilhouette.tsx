import { useId } from "react";
import { bodyRegions, type BodyProfile } from "../body";

type Curve = [number, number, number, number, number, number];

/** Continuous, mirrored outline. The centre seam is never stroked. */
function outline(start: [number, number], half: Curve[]) {
  const reverse = half.map((curve, i): Curve => {
    const previous = i ? half[i - 1].slice(4) : start;
    return [1000 - curve[2], curve[3], 1000 - curve[0], curve[1], 1000 - previous[0], previous[1]];
  }).reverse();
  return `M${start.join(" ")} ${[...half, ...reverse].map(c => `C${c.join(" ")}`).join(" ")} Z`;
}

/** Neutral archival study; proportions share the same coordinates as the selection regions. */
export function BodySilhouette({ body, view = "front" }: { body?: BodyProfile; view?: "front" | "back" }) {
  const id = useId().replace(/:/g, "");
  const regions = Object.fromEntries(bodyRegions(body).map(region => [region.area, region]));
  const head = regions["头部"], chest = regions["胸部"], belly = regions["腹部"];
  const headTop = head.y * 1500, headH = head.h * 1500, headW = head.w * 500;
  const headEnd = headTop + headH, neck = Math.min(39, Math.max(26, headW * .46));
  const shoulderY = chest.y * 1500, shoulderX = chest.x * 1000 - 16;
  const waistY = belly.y * 1500, hip = (belly.y + belly.h) * 1500;
  const handY = regions["右手"].y * 1500, handEnd = (regions["右手"].y + regions["右手"].h) * 1500;
  const wrist = regions["右手"].x * 1000 + 55, elbow = shoulderY + (handY - shoulderY) * .51;
  const footY = regions["右脚"].y * 1500, bottom = 1455, knee = hip + (footY - hip) * .53;
  const hipX = 376, waistX = Math.max(388, shoulderX + 30);
  const half: Curve[] = [
    [500 - headW * .8, headTop, 500 - headW * 1.06, headTop + headH * .25, 500 - headW * .94, headTop + headH * .58],
    [500 - headW * .92, headTop + headH * .8, 500 - headW * .56, headEnd - 5, 500 - neck, headEnd],
    [500 - neck, headEnd + 13, 500 - neck - 2, shoulderY - 15, 500 - neck - 12, shoulderY - 11],
    [shoulderX + 34, shoulderY - 3, shoulderX - 17, shoulderY - 3, shoulderX - 25, shoulderY + 34],
    [shoulderX - 44, shoulderY + 92, wrist - 22, elbow - 29, wrist - 20, elbow + 16],
    [wrist - 20, elbow + 66, wrist - 14, handY - 27, wrist - 18, handY + 3],
    [wrist - 22, handY + 31, wrist - 37, handEnd - 24, wrist - 27, handEnd - 8],
    [wrist - 18, handEnd + 3, wrist + 6, handEnd + 3, wrist + 13, handEnd - 15],
    [wrist + 18, handEnd - 37, wrist + 15, handY + 73, wrist + 17, handY + 60],
    [wrist + 32, handY + 64, wrist + 37, handY + 43, wrist + 30, handY + 28],
    [wrist + 26, handY + 20, wrist + 21, handY + 18, wrist + 19, handY + 13],
    [wrist + 15, handY - 16, wrist + 32, elbow + 53, wrist + 32, elbow + 10],
    [wrist + 31, elbow - 20, shoulderX + 12, shoulderY + 78, shoulderX + 18, shoulderY + 63],
    [shoulderX + 22, shoulderY + 107, waistX - 13, waistY - 19, waistX, waistY + 11],
    [waistX + 11, waistY + 47, hipX - 9, hip - 36, hipX, hip + 23],
    [hipX - 9, hip + 95, 393, knee - 61, 399, knee + 1],
    [388, knee + 71, 406, footY - 75, 419, footY - 17],
    [422, footY + 6, 404, bottom - 25, 395, bottom - 13],
    [384, bottom + 1, 408, bottom + 2, 431, bottom],
    [455, bottom + 1, 477, bottom - 1, 477, bottom - 13],
    [475, bottom - 31, 468, footY + 1, 470, footY - 22],
    [474, footY - 95, 480, knee + 62, 475, knee],
    [474, knee - 77, 491, hip + 73, 500, hip + 37],
  ];
  const contour = outline([500, headTop], half);
  const chestLine = view === "front"
    ? `M${shoulderX + 36} ${shoulderY + 39} Q448 ${shoulderY + 27} 488 ${shoulderY + 45} M512 ${shoulderY + 45} Q552 ${shoulderY + 27} ${1000 - shoulderX - 36} ${shoulderY + 39}`
    : `M${shoulderX + 38} ${shoulderY + 44} Q450 ${shoulderY + 55} 462 ${waistY - 40} M${1000 - shoulderX - 38} ${shoulderY + 44} Q550 ${shoulderY + 55} 538 ${waistY - 40} M500 ${shoulderY + 26} C491 ${waistY - 14} 509 ${waistY + 17} 500 ${hip - 23}`;
  return <g className="body-silhouette body-silhouette-study" data-view={view} aria-hidden="true">
    <defs>
      <linearGradient id={`${id}-porcelain`} x1="0" y1="0" x2="1" y2=".18">
        <stop offset="0" className="silhouette-shade" /><stop offset=".32" className="silhouette-light" />
        <stop offset=".53" className="silhouette-paper" /><stop offset=".77" className="silhouette-light" />
        <stop offset="1" className="silhouette-shade" />
      </linearGradient>
      <linearGradient id={`${id}-wash`} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="currentColor" stopOpacity=".025" /><stop offset="1" stopColor="currentColor" stopOpacity=".11" />
      </linearGradient>
      <clipPath id={`${id}-contour`}><path d={contour} /></clipPath>
    </defs>
    <path className="silhouette-contour" d={contour} fill={`url(#${id}-porcelain)`} />
    <g className="silhouette-volume" clipPath={`url(#${id}-contour)`} fill={`url(#${id}-wash)`}>
      <path d={`M${500 - neck} ${headEnd - 7} Q500 ${headEnd + 6} ${500 + neck} ${headEnd - 7} L${500 + neck} ${headEnd + 11} Q500 ${headEnd + 22} ${500 - neck} ${headEnd + 11}Z`} />
      <path d={`M${hipX} ${hip - 4} Q416 ${hip + 51} 430 ${knee} Q412 ${footY} 431 ${bottom} H300 V${hip - 4}Z`} />
      <path d={`M${1000 - hipX} ${hip - 4} Q584 ${hip + 51} 570 ${knee} Q588 ${footY} 569 ${bottom} H700 V${hip - 4}Z`} />
    </g>
    <g className="silhouette-lines">
      <path className="silhouette-detail" d={chestLine} />
      {view === "front" && <path className="silhouette-detail" d={`M500 ${headTop + headH * .48} l-5 ${headH * .18} 9 0 M488 ${headTop + headH * .81} q12 5 24 0 M500 ${waistY + 23} v13`} />}
      {view === "back" && <path className="silhouette-detail" d={`M${500 - neck - 11} ${headEnd - 12} Q500 ${headEnd - 22} ${500 + neck + 11} ${headEnd - 12}`} />}
      {[false, true].map(mirror => <g key={String(mirror)} transform={mirror ? "translate(1000 0) scale(-1 1)" : undefined}>
        <path className="silhouette-detail" d={`M${wrist - 11} ${elbow + 8} q14 8 26 0 M${wrist - 9} ${handY + 5} q11 4 23 0 M408 ${knee + 3} q26 ${view === "front" ? -18 : 8} 51 0 M424 ${footY - 9} q19 7 38 0`} />
        <path className="silhouette-fine" d={`M${wrist - 16} ${handEnd - 29} l-1 20 M${wrist - 6} ${handEnd - 28} l1 22 M${wrist + 4} ${handEnd - 27} l1 18 M411 ${bottom - 14} l-1 12 M423 ${bottom - 14} v13 M436 ${bottom - 13} v13`} />
      </g>)}
    </g>
  </g>;
}
