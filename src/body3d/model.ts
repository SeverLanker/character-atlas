import { BufferGeometry, CatmullRomCurve3, Color, Float32BufferAttribute, Group, Mesh, MeshStandardMaterial, SphereGeometry, Vector3 } from "three";
import { bodyRegions, regionHasCondition, type BodyProfile } from "../body";
import type { Condition } from "../model";

export type BodyPartMesh = Mesh<BufferGeometry, MeshStandardMaterial>;
type Ring = [x: number, y: number, z: number, width: number, depth: number];
const ivory = new Color("#dcd8c8"), selected = new Color("#567d72");
const ink = { danger: "#b95e51", notice: "#bc9653", stable: "#779788" };

/** Original smooth elliptical lofts. No upstream anatomy meshes or textures. */
function loft(rings: Ring[]): BufferGeometry {
  const center = new CatmullRomCurve3(rings.map(r => new Vector3(r[0], r[1], r[2])));
  const radius = new CatmullRomCurve3(rings.map((r, i) => new Vector3(r[3], i, r[4])));
  const positions: number[] = [], indices: number[] = [];
  const steps = 32, sides = 24;
  for (let i = 0; i <= steps; i++) {
    const c = center.getPoint(i / steps), r = radius.getPoint(i / steps);
    for (let j = 0; j <= sides; j++) {
      const angle = j / sides * Math.PI * 2;
      positions.push(c.x + Math.cos(angle) * Math.max(.002, r.x), c.y, c.z + Math.sin(angle) * Math.max(.002, r.z));
      if (i < steps && j < sides) {
        const a = i * (sides + 1) + j, b = a + sides + 1;
        indices.push(a, a + 1, b, b, a + 1, b + 1);
      }
    }
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices); geometry.computeVertexNormals();
  return geometry;
}

export function createBodyStudy(body?: BodyProfile): { group: Group; parts: BodyPartMesh[] } {
  const group = new Group(), parts: BodyPartMesh[] = [];
  const regions = Object.fromEntries(bodyRegions(body).map(r => [r.area, r]));
  const y = (n: number) => (1 - n) * 3.6;
  const shoulder = y(regions["胸部"].y), waist = y(regions["腹部"].y), hip = y(regions["左腿"].y);
  const foot = y(regions["左脚"].y), wrist = y(regions["左手"].y);
  const broad = body?.body_type.endsWith("male") && !body.body_type.endsWith("female") ? 1.12 : 1;
  const add = (area: string, geometry: BufferGeometry): BodyPartMesh => {
    const mesh = new Mesh(geometry, new MeshStandardMaterial({ color: ivory, roughness: .56, metalness: .08 }));
    mesh.userData.area = area; group.add(mesh); parts.push(mesh); return mesh;
  };
  const oval = (area: string, x: number, cy: number, z: number, rx: number, ry: number, rz: number) => {
    const mesh = add(area, new SphereGeometry(1, 32, 24));
    mesh.position.set(x, cy, z); mesh.scale.set(rx, ry, rz); return mesh;
  };
  // The featureless head and clothed-mannequin contour suit arbitrary characters.
  const head = regions["头部"], headHeight = head.h * 3.6;
  oval("头部", 0, y(head.y + head.h / 2), .025, headHeight * .37, headHeight * .51, headHeight * .39);
  oval("颈部", 0, (shoulder + y(head.y + head.h)) / 2, 0, .105, .13, .10);
  const torso = add("躯干", loft([
    [0, shoulder + .03, 0, .13, .10], [0, shoulder - .06, 0, .34 * broad, .15],
    [0, shoulder - .21, .01, .31 * broad, .18], [0, waist, .01, .235, .15],
    [0, hip + .10, 0, .29, .18], [0, hip - .02, 0, .22, .15], [0, hip - .07, 0, .03, .03],
  ]));
  torso.userData.waist = waist;
  for (const side of [-1, 1]) {
    const label = side < 0 ? "右" : "左", sx = .34 * broad;
    add(label + "臂", loft([
      [side * sx, shoulder - .045, 0, .02, .02], [side * (sx + .045), shoulder - .13, 0, .105, .11],
      [side * (sx + .10), (shoulder + wrist) / 2, -.015, .072, .075],
      [side * (sx + .15), wrist + .07, .01, .052, .05], [side * (sx + .15), wrist, .01, .04, .038],
    ]));
    oval(label + "手", side * (sx + .16), wrist - .12, .015, .063, .155, .04);
    add(label + "腿", loft([
      [side * .14, hip + .05, 0, .10, .115], [side * .16, hip - .13, 0, .145, .15],
      [side * .17, (hip + foot) / 2, .015, .085, .09],
      [side * .18, (hip + foot) / 2 - .20, -.015, .10, .105],
      [side * .18, foot + .04, 0, .051, .055], [side * .18, foot - .025, 0, .035, .04],
    ]));
    oval(label + "脚", side * .18, foot - .06, .07, .075, .075, .16);
  }
  group.updateMatrixWorld(true);
  return { group, parts };
}

/** A single torso surface avoids seams. Front/back selection follows hit normal. */
export function pickedArea(mesh: BodyPartMesh, point: Vector3, normalZ = 1): string {
  if (mesh.userData.area !== "躯干") return mesh.userData.area;
  return normalZ < 0 ? "背部" : point.y < mesh.userData.waist ? "腹部" : "胸部";
}

export function updateBodyMaterials(parts: BodyPartMesh[], conditions: Condition[], active: string): void {
  for (const mesh of parts) {
    const areas = mesh.userData.area === "躯干" ? ["胸部", "腹部", "背部", "躯干"] : [mesh.userData.area as string];
    const matches = conditions.filter(c => areas.some(a => regionHasCondition(a, c.area)));
    const level = matches.some(c => c.severity === "danger") ? "danger" : matches.some(c => c.severity === "notice") ? "notice" : matches.length ? "stable" : undefined;
    const isActive = areas.includes(active) || (active === "全身");
    mesh.material.color.copy(isActive ? selected : level ? new Color(ink[level]) : ivory);
    mesh.material.emissive.copy(isActive ? selected : ivory).multiplyScalar(isActive ? .11 : 0);
  }
}

export function disposeBodyStudy(parts: BodyPartMesh[]): void {
  for (const mesh of parts) { mesh.geometry.dispose(); mesh.material.dispose(); }
}
