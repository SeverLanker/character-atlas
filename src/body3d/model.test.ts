import { Box3, Raycaster, Vector3 } from "three";
import { describe, expect, it, vi } from "vitest";
import { bodyTypes, parseBodyValidatorJson } from "../body";
import { createBodyStudy, disposeBodyStudy, pickedArea, updateBodyMaterials } from "./model";

describe("original 3D body geometry", () => {
  it.each(bodyTypes)("%s keeps finite bounds and outward-facing selectable surfaces", type => {
    for (const headScale of [.5, 1, 2]) {
      const body = parseBodyValidatorJson(JSON.stringify({ schema: "bodyval.character/1", body_type: type, height_cm: 170, head_scale: headScale, leg_length: headScale === 2 ? 1 : -1 }));
      const { group, parts } = createBodyStudy(body);
      const bounds = new Box3().setFromObject(group);
      expect(bounds.min.y).toBeGreaterThan(-.05); expect(bounds.max.y).toBeLessThan(3.7);
      expect(bounds.min.x).toBeGreaterThan(-.8); expect(bounds.max.x).toBeLessThan(.8);
      for (const mesh of parts) {
        expect(Array.from(mesh.geometry.getAttribute("position").array).every(Number.isFinite)).toBe(true);
        expect(Array.from(mesh.geometry.getAttribute("normal").array).every(Number.isFinite)).toBe(true);
        expect(mesh.geometry.index!.count).toBeLessThan(6000);
      }
      const torso = parts.find(p => p.userData.area === "躯干")!;
      const cy = torso.userData.waist + .12;
      const front = new Raycaster(new Vector3(0, cy, 5), new Vector3(0, 0, -1)).intersectObject(torso)[0];
      const back = new Raycaster(new Vector3(0, cy, -5), new Vector3(0, 0, 1)).intersectObject(torso)[0];
      expect(front).toBeTruthy(); expect(back).toBeTruthy();
      expect(pickedArea(torso, front.point, front.face!.normal.z)).toBe("胸部");
      expect(pickedArea(torso, back.point, back.face!.normal.z)).toBe("背部");
      expect(pickedArea(torso, new Vector3(0, torso.userData.waist - .03, .1))).toBe("腹部");
      for (const side of ["左", "右"]) {
        const arm = parts.find(p => p.userData.area === side + "臂")!;
        const center = new Box3().setFromObject(arm).getCenter(new Vector3());
        const result = new Raycaster(new Vector3(center.x, center.y, 5), new Vector3(0, 0, -1)).intersectObjects(parts)[0];
        expect(pickedArea(result.object as typeof arm, result.point)).toBe(side + "臂");
      }
      disposeBodyStudy(parts);
    }
  });
  it("applies current-record severity and selection without altering records, then releases resources", () => {
    const { parts } = createBodyStudy();
    const left = parts.find(p => p.userData.area === "左臂")!, right = parts.find(p => p.userData.area === "右臂")!;
    const records = [{ id: "one", title: "观察", area: "左臂", text: "", severity: "danger" as const }];
    const before = JSON.stringify(records);
    updateBodyMaterials(parts, records, "全部"); expect(left.material.color.getHexString()).toBe("b95e51");
    expect(right.material.color.getHexString()).toBe("dcd8c8");
    updateBodyMaterials(parts, records, "左臂"); expect(left.material.color.getHexString()).toBe("567d72");
    updateBodyMaterials(parts, [], "全部"); expect(left.material.color.getHexString()).toBe("dcd8c8");
    expect(JSON.stringify(records)).toBe(before);
    const geometry = vi.spyOn(left.geometry, "dispose"), material = vi.spyOn(left.material, "dispose");
    disposeBodyStudy(parts); expect(geometry).toHaveBeenCalledOnce(); expect(material).toHaveBeenCalledOnce();
  });
});
