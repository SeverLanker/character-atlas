import { useState } from "react";
import type { Library } from "../model";
import { defaultImportChoice, type ImportChoices, type ImportChoice } from "../merge";
import { parseLibraryImport, type LibraryImport } from "../storage";

export function ImportPanel({ current, onImport }: { current: Library; onImport: (base: Library, payload: LibraryImport, choices: ImportChoices) => Promise<void> }) {
  const [payload, setPayload] = useState<LibraryImport | null>(null);
  const [base, setBase] = useState<Library | null>(null);
  const [choices, setChoices] = useState<ImportChoices>({});
  const [limit, setLimit] = useState(20);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const rows = payload?.library.characters ?? [];
  const sameIds = new Set(base?.characters.map((row) => row.id));
  const sameNames = new Set(base?.characters.map((row) => row.name));
  const count = rows.filter((row) => choices[row.id] !== "skip").length;
  return <section className="import-panel" aria-label="追加导入角色">
    <h2>追加导入角色</h2>
    <p className="editor-help">支持角色库 JSON 和完整 ZIP。相同 ID 默认跳过；同名而 ID 不同的角色作为独立角色保留。图片会生成新编号，不覆盖当前图片。</p>
    <label className="field"><span>选择追加导入文件</span><input type="file" accept=".json,.zip" disabled={busy} onChange={(e) => {
      const file = e.target.files?.[0]; e.target.value = "";
      if (!file) return;
      setPayload(null); setBase(null); setMessage(""); setBusy(true);
      void (async () => {
        if (file.size > 256 * 1024 * 1024) throw new Error("文件超过 256 MB");
        const parsed = parseLibraryImport(new Uint8Array(await file.arrayBuffer()), file.name);
        setBase(structuredClone(current)); setPayload(parsed); setLimit(20);
        setChoices(Object.fromEntries(parsed.library.characters.map((row) => [row.id, defaultImportChoice(current, row)])));
      })().catch((error) => setMessage(String(error))).finally(() => setBusy(false));
    }} /></label>
    {payload && base && <div className="import-preview">
      <h3>导入预览：选中 {count} / {rows.length} 个角色</h3>
      <p>另包含 {payload.library.catalog?.length ?? 0} 个条目库模板。同 ID 同内容模板跳过，不同内容保留为新模板。</p>
      <div className="import-character-list">{rows.slice(0, limit).map((row) => <label className="field" key={row.id}>
        <span>{row.name} · {row.versions.length} 个版本 {sameIds.has(row.id) ? "（ID 冲突）" : sameNames.has(row.name) ? "（同名，ID 不同）" : "（新增）"}</span>
        <select aria-label={`导入处理：${row.name}`} value={choices[row.id]} disabled={busy} onChange={(e) => setChoices({ ...choices, [row.id]: e.target.value as ImportChoice })}>
          <option value="skip">跳过，保留现有角色</option>
          <option value="copy">{sameIds.has(row.id) ? "作为独立副本添加" : "添加为独立角色"}</option>
          {sameIds.has(row.id) && <option value="replace">用导入角色替换相同 ID 的角色（全部版本）</option>}
        </select>
      </label>)}</div>
      {rows.length > limit && <button className="text-button" onClick={() => setLimit(limit + 20)}>再显示 20 个角色</button>}
      {Object.values(choices).includes("replace") && <p className="backup-overdue">替换会覆盖该角色的全部版本与秘密档案，请确认已有备份。</p>}
      <div className="coc-edit-actions"><button className="button primary small" disabled={busy} onClick={() => {
        setBusy(true); setMessage("");
        void onImport(base, payload, choices).then(() => { setPayload(null); setMessage("追加导入完成，未选中的原有角色保持不变。"); }).catch((error) => setMessage(String(error))).finally(() => setBusy(false));
      }}>确认追加导入</button><button className="button small" disabled={busy} onClick={() => setPayload(null)}>取消导入</button></div>
    </div>}
    {busy && <p role="status">正在检查或导入，请稍候…</p>}
    {message && <p role="status">{message}</p>}
  </section>;
}
