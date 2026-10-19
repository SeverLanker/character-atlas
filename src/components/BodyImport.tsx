import { useState } from "react";
import { bodyTypeLabels, parseBodyValidatorJson, type BodyProfile } from "../body";

/** 编辑器：导入 body-validator 角色 JSON 与可选正 / 背面图。图片经由 onUpload（现有白名单 asset 写入）保存。 */
export function BodyImport({ body, hidden, onChange, onInherit, onUpload }: {
  body?: BodyProfile;
  hidden: boolean;
  onChange: (body: BodyProfile | undefined) => void;
  onInherit?: () => void;
  onUpload: (file: File) => Promise<string>;
}) {
  const [json, setJson] = useState<File | null>(null);
  const [front, setFront] = useState<File | null>(null);
  const [back, setBack] = useState<File | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function run() {
    if (!json) return;
    setBusy(true); setError("");
    try {
      const parsed = parseBodyValidatorJson(await json.text());
      parsed.front = front ? await onUpload(front) : body?.front ?? "";
      parsed.back = back ? await onUpload(back) : body?.back ?? "";
      onChange(parsed);
      setJson(null); setFront(null); setBack(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally { setBusy(false); }
  }
  async function replaceImage(side: "front" | "back", file: File) {
    if (!body) return;
    try { onChange({ ...body, [side]: await onUpload(file) }); } catch (e) { setError(String(e)); }
  }
  return (
    <section className="edit-section" aria-label="body-validator 体型">
      <div className="edit-section-title"><h3>体型与人体图（body-validator）</h3></div>
      <p className="editor-help">导入 body-validator 保存的角色 JSON（bodyval.character/1–3），可附正面 / 背面 PNG。叙册只保存参数和图片，不运行 Godot。{hidden ? "当前在秘密档案中编辑，导入后整体覆盖表层体型。" : ""}</p>
      {body && <p className="editor-help">当前：{body.name || "未命名"} · {bodyTypeLabels[body.body_type]} · {body.height_cm} cm · 头 {body.head_scale} · 腿长 {body.leg_length} · 正面图{body.front ? "已导入" : "无"} · 背面图{body.back ? "已导入" : "无"}</p>}
      <label className="field"><span>角色 JSON</span><input aria-label="body-validator 角色 JSON" type="file" accept=".json,application/json" onChange={(e) => setJson(e.target.files?.[0] ?? null)} /></label>
      <label className="field"><span>正面图（可选）</span><input aria-label="正面图" type="file" accept="image/png,image/jpeg,image/webp" onChange={(e) => setFront(e.target.files?.[0] ?? null)} /></label>
      <label className="field"><span>背面图（可选）</span><input aria-label="背面图" type="file" accept="image/png,image/jpeg,image/webp" onChange={(e) => setBack(e.target.files?.[0] ?? null)} /></label>
      <div className="coc-edit-actions">
        <button className="button small" disabled={!json || busy} onClick={run}>{busy ? "正在导入…" : "导入 body-validator 角色"}</button>
        {body && !json && <>
          <label className="button small">更换正面图<input hidden type="file" accept="image/png,image/jpeg,image/webp" onChange={(e) => { const f = e.target.files?.[0]; if (f) void replaceImage("front", f); e.target.value = ""; }} /></label>
          <label className="button small">更换背面图<input hidden type="file" accept="image/png,image/jpeg,image/webp" onChange={(e) => { const f = e.target.files?.[0]; if (f) void replaceImage("back", f); e.target.value = ""; }} /></label>
          {!hidden && <button className="text-button" onClick={() => onChange(undefined)}>移除体型数据</button>}
        </>}
        {hidden && onInherit && <button className="text-button" onClick={onInherit}>沿用表层体型</button>}
      </div>
      {error && <p className="editor-help" role="alert">导入失败：{error}</p>}
    </section>
  );
}
