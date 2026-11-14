import { useState } from "react";
import { bodyTypeLabels, parseBodyValidatorJson, type BodyProfile } from "../body";

/** Optional body-validator parameters; independent artwork is edited above. */
export function BodyImport({ body, hidden, onChange, onInherit }: {
  body?: BodyProfile;
  hidden: boolean;
  onChange: (body: BodyProfile | undefined) => void;
  onInherit?: () => void;
}) {
  const [json, setJson] = useState<File | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function run() {
    if (!json) return;
    setBusy(true); setError("");
    try {
      const parsed = parseBodyValidatorJson(await json.text());
      parsed.front = body?.front ?? "";
      parsed.back = body?.back ?? "";
      onChange(parsed);
      setJson(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally { setBusy(false); }
  }
  return (
    <details className="edit-section body-parameter-import" aria-label="body-validator 体型">
      <summary>导入 Body Validator 参数（可选）</summary>
      <p className="editor-help">导入角色 JSON（bodyval.character/1–3）以读取身高与体型参数；正／背面图片可在上方直接替换。叙册不运行 Godot。{hidden ? "当前在秘密档案中编辑，导入后整体覆盖表层体型。" : ""}</p>
      {body && <p className="editor-help">当前：{body.name || "未命名"} · {bodyTypeLabels[body.body_type]} · {body.height_cm} cm · 头 {body.head_scale} · 腿长 {body.leg_length} · 正面图{body.front ? "已导入" : "无"} · 背面图{body.back ? "已导入" : "无"}</p>}
      <label className="field"><span>角色 JSON</span><input aria-label="body-validator 角色 JSON" type="file" accept=".json,application/json" onChange={(e) => setJson(e.target.files?.[0] ?? null)} /></label>
      <div className="coc-edit-actions">
        <button className="button small" disabled={!json || busy} onClick={run}>{busy ? "正在导入…" : "导入 body-validator 角色"}</button>
        {body && !json && <>
          {!hidden && <button className="text-button" onClick={() => onChange(undefined)}>移除体型数据</button>}
        </>}
        {hidden && onInherit && <button className="text-button" onClick={onInherit}>沿用表层体型</button>}
      </div>
      {error && <p className="editor-help" role="alert">导入失败：{error}</p>}
    </details>
  );
}
