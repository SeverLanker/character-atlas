import { useLayoutEffect, useRef, useState } from "react";
import type { BodyImages } from "../body";
import { Portrait } from "./Portrait";

const emptyImages: BodyImages = { front: "", back: "" };
export function BodyImageEditor({ images = emptyImages, context, hidden, onChange, onInherit, onUpload }: {
  images?: BodyImages; context: string; hidden: boolean;
  onChange: (images: BodyImages) => void; onInherit?: () => void;
  onUpload: (file: File) => Promise<string>;
}) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const pending = useRef(false), mounted = useRef(false);
  const current = useRef({ images, context, onChange });
  useLayoutEffect(() => { current.current = { images, context, onChange }; });
  useLayoutEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  async function upload(side: keyof BodyImages, file: File) {
    if (pending.current) return;
    pending.current = true; setBusy(true); setMessage("");
    const before = current.current;
    try {
      const ref = await onUpload(file);
      if (!mounted.current) return;
      const latest = current.current;
      if (latest.context !== before.context || latest.images.front !== before.images.front || latest.images.back !== before.images.back || latest.images.display !== before.images.display) {
        setMessage("身体图或当前档案已变化，未覆盖新内容，请重新选择图片。"); return;
      }
      latest.onChange({ ...latest.images, [side]: ref, display: "image" });
      setMessage((side === "front" ? "正面" : "背面") + "图已更新。");
    } catch (error) {
      if (mounted.current) setMessage("上传失败：" + (error instanceof Error ? error.message : String(error)));
    } finally {
      pending.current = false;
      if (mounted.current) setBusy(false);
    }
  }
  return <section className="edit-section body-image-editor" aria-label="身体图编辑">
    <div className="edit-section-title"><h3>身体图</h3></div>
    <p className="editor-help">可直接上传 PNG、JPEG 或 WebP，也可使用 Body Validator 导出的正／背面图，无需先导入参数。图片随当前剧情版本保存。{hidden ? "当前编辑秘密档案，修改后独立保存。" : ""}</p>
    <fieldset disabled={busy} className="body-image-fields" aria-busy={busy}>
      <legend className="sr-only">替换正面与背面图片</legend>
      <label className="field body-image-style"><span>身体图样式</span><select value={images.display ?? "image"} onChange={event => onChange({ ...images, display: event.target.value as BodyImages["display"] })}>
        <option value="image">自定义图片</option><option value="diagram">SVG 人体示意</option>
      </select><small>SVG 为部位记录示意；切换样式会保留已上传图片。</small></label>
      {(["front", "back"] as const).map(side => {
        const label = side === "front" ? "正面" : "背面";
        return <div className="body-image-slot" key={side}>
          <h4>{label}图</h4>
          {images[side] ? <Portrait image={images[side]} className="body-image-preview" label={label + "身体图预览"} /> : <div className="body-image-empty">尚未添加{label}图</div>}
          <label className="field"><span>上传{label}图</span><input type="file" accept="image/png,image/jpeg,image/webp" onChange={event => {
            const file = event.target.files?.[0]; event.target.value = "";
            if (file) void upload(side, file);
          }} /></label>
          <button className="text-button" disabled={!images[side]} onClick={() => { onChange({ ...images, [side]: "" }); setMessage(label + "图已清除。"); }}>清除{label}图</button>
        </div>;
      })}
      {onInherit && <button className="button small" onClick={() => { onInherit(); setMessage("已恢复沿用公开身体图。"); }}>沿用公开身体图</button>}
    </fieldset>
    {(busy || message) && <p className="editor-help" role="status">{busy ? "正在保存身体图…" : message}</p>}
  </section>;
}
