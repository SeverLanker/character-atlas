import { DirectionalLight, HemisphereLight, Mesh, MeshBasicMaterial, OrthographicCamera, Raycaster, RingGeometry, Scene, SRGBColorSpace, Vector2, WebGLRenderer } from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import type { BodyProfile } from "../body";
import type { Condition } from "../model";
import { createBodyStudy, disposeBodyStudy, pickedArea, updateBodyMaterials } from "./model";

export type BodyView = "front" | "back" | "left" | "right";
export interface BodyViewer {
  view: (view: BodyView) => void;
  zoom: (factor: number) => void;
  update: (conditions: Condition[], active: string) => void;
  dispose: () => void;
}
export interface ViewerOptions {
  body?: BodyProfile;
  onSelect: (area: string) => void;
  onHover: (area: string) => void;
  onLost: () => void;
}

/** One offline scene. Only resize, navigation and state updates request a frame. */
export function mountBodyViewer(host: HTMLElement, options: ViewerOptions): BodyViewer {
  const renderer = new WebGLRenderer({ antialias: true, alpha: true, powerPreference: "low-power" });
  let frame = 0, disposed = false;
  const cleanups: (() => void)[] = [() => { renderer.dispose(); renderer.forceContextLoss(); renderer.domElement.remove(); }];
  const dispose = () => {
    if (disposed) return;
    disposed = true; cancelAnimationFrame(frame);
    for (const cleanup of cleanups.reverse()) cleanup();
  };
  try {
    const canvas = renderer.domElement;
    renderer.setPixelRatio(Math.min(globalThis.devicePixelRatio || 1, 1.75));
    renderer.outputColorSpace = SRGBColorSpace;
    renderer.setClearColor(0x000000, 0);
    canvas.setAttribute("aria-hidden", "true");
    const scene = new Scene(), camera = new OrthographicCamera(-1.5, 1.5, 2.02, -2.02, .1, 30);
    const { group, parts } = createBodyStudy(options.body);
    cleanups.push(() => disposeBodyStudy(parts));
    scene.add(group, new HemisphereLight(0xfff9e6, 0x697e78, 2.5));
    const key = new DirectionalLight(0xffefd9, 3); key.position.set(-3, 6, 5); scene.add(key);
    const rim = new DirectionalLight(0xb6d8dc, 2); rim.position.set(3, 4, -4); scene.add(rim);
    const ring = new Mesh(new RingGeometry(.58, .59, 64), new MeshBasicMaterial({ color: 0x9b9276, transparent: true, opacity: .5 }));
    cleanups.push(() => { ring.geometry.dispose(); ring.material.dispose(); });
    ring.rotation.x = -Math.PI / 2; ring.position.y = .025; scene.add(ring);
    const controls = new OrbitControls(camera, canvas);
    cleanups.push(() => controls.dispose());
    controls.target.set(0, 1.8, 0); controls.enablePan = false; controls.enableDamping = false;
    controls.minZoom = .65; controls.maxZoom = 2.8;
    controls.minPolarAngle = Math.PI * .24; controls.maxPolarAngle = Math.PI * .74;
    let down: { x: number; y: number; id: number } | undefined;
    let multiTouch = false;
    const pointers = new Set<number>();
    const draw = () => { frame = 0; if (!disposed) renderer.render(scene, camera); };
    const invalidate = () => { if (!disposed && !frame && !document.hidden) frame = requestAnimationFrame(draw); };
    const resize = () => {
      const width = host.clientWidth || 320, height = host.clientHeight || 480;
      const halfWidth = 2.02 * width / height;
      camera.left = -halfWidth; camera.right = halfWidth; camera.updateProjectionMatrix();
      renderer.setSize(width, height); invalidate();
    };
    const ray = new Raycaster(), pointer = new Vector2();
    const hit = (event: PointerEvent) => {
      const bounds = canvas.getBoundingClientRect();
      if (!bounds.width || !bounds.height) return "";
      pointer.set((event.clientX - bounds.left) / bounds.width * 2 - 1, 1 - (event.clientY - bounds.top) / bounds.height * 2);
      camera.updateMatrixWorld(); group.updateMatrixWorld(true);
      ray.setFromCamera(pointer, camera);
      const result = ray.intersectObjects(parts, false)[0];
      return result ? pickedArea(result.object as typeof parts[number], result.point, result.face?.normal.z) : "";
    };
    const press = (event: PointerEvent) => {
      pointers.add(event.pointerId);
      if (pointers.size > 1) { multiTouch = true; down = undefined; }
      else if (event.button === 0) { multiTouch = false; down = { x: event.clientX, y: event.clientY, id: event.pointerId }; }
    };
    const move = (event: PointerEvent) => {
      if (down && Math.hypot(event.clientX - down.x, event.clientY - down.y) > 5) down = undefined;
      if (!pointers.size && event.pointerType !== "touch") options.onHover(hit(event));
    };
    const release = (event: PointerEvent) => {
      if (down?.id === event.pointerId && !multiTouch && Math.hypot(event.clientX - down.x, event.clientY - down.y) <= 5) {
        const area = hit(event); if (area) options.onSelect(area);
      }
      pointers.delete(event.pointerId); down = undefined;
    };
    const cancel = (event: PointerEvent) => { pointers.delete(event.pointerId); down = undefined; };
    const leave = () => { options.onHover(""); };
    const lost = (event: Event) => { event.preventDefault(); options.onLost(); };
    const observer = new ResizeObserver(resize);
    cleanups.push(() => observer.disconnect());
    cleanups.push(() => {
      controls.removeEventListener("change", invalidate); document.removeEventListener("visibilitychange", invalidate);
      canvas.removeEventListener("pointerdown", press); canvas.removeEventListener("pointermove", move);
      canvas.removeEventListener("pointerup", release); canvas.removeEventListener("pointercancel", cancel);
      canvas.removeEventListener("pointerleave", leave); canvas.removeEventListener("webglcontextlost", lost);
    });
    const api: BodyViewer = {
      view(view) {
        const positions = { front: [0, 8], back: [0, -8], left: [8, 0], right: [-8, 0] };
        camera.position.set(positions[view][0], 1.8, positions[view][1]); camera.zoom = 1;
        camera.updateProjectionMatrix(); controls.update(); invalidate();
      },
      zoom(factor) { camera.zoom = Math.max(.65, Math.min(2.8, camera.zoom * factor)); camera.updateProjectionMatrix(); controls.update(); invalidate(); },
      update(conditions, active) { updateBodyMaterials(parts, conditions, active); invalidate(); },
      dispose,
    };
    host.append(canvas); observer.observe(host); controls.addEventListener("change", invalidate);
    canvas.addEventListener("pointerdown", press); canvas.addEventListener("pointermove", move);
    canvas.addEventListener("pointerup", release); canvas.addEventListener("pointercancel", cancel);
    canvas.addEventListener("pointerleave", leave); canvas.addEventListener("webglcontextlost", lost);
    document.addEventListener("visibilitychange", invalidate);
    api.view("front"); resize();
    return api;
  } catch (error) { dispose(); throw error; }
}
