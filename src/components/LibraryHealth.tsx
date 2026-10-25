import { useState } from "react";
import { assetRefs, type Library } from "../model";
import { listAssetFiles, listSnapshots, snapshotLibrary } from "../storage";
import { inspectLibraryHealth } from "../library-health";
export function LibraryHealth({ library, disabled }: { library: Library; disabled: boolean }) {
  const [result, setResult] = useState<{ base: Library; report: ReturnType<typeof inspectLibraryHealth>; unreadable: number } | null>(null);
  const [busy, setBusy] = useState(false), [error, setError] = useState(""), [secret, setSecret] = useState(false);
  async function scan() {
    setBusy(true); setError(""); setResult(null);
    try {
      const files = await listAssetFiles(), refs: string[] = []; let unreadable = 0;
      for (const snapshot of await listSnapshots()) {
        try { refs.push(...assetRefs(await snapshotLibrary(snapshot, false))); }
        catch { unreadable++; }
      }
      setResult({ base: library, report: inspectLibraryHealth(library, files, refs), unreadable });
    } catch (error) { setError(error instanceof Error ? error.message : String(error)); }
    finally { setBusy(false); }
  }
  const report = result?.report;
  return <section className="recovery-panel" aria-label="资料健康检查">
    <h2>资料健康检查</h2>
    <p className="editor-help">只检查，不修改或删除文件。检查图片缺失、失效关联、同世界同类别重名，以及当前资料和可读历史备份都未引用的图片。</p>
    <button className="button small" disabled={disabled || busy} onClick={() => void scan()}>{busy ? "正在检查…" : "开始健康检查"}</button>
    {error && <p role="alert">{error}</p>}
    {result && report && <>
      {result.base !== library && <p role="status">资料已有变化，请重新检查。</p>}
      <p role="status">缺失图片 {report.missing.length} · 失效关联 {report.links.length} · 重名组 {report.duplicates.length} · 未引用图片 {report.unreferenced.length} · 图片占用 {(report.bytes / 1048576).toFixed(1)} MB</p>
      {result.unreadable > 0 && <p>{result.unreadable} 份备份无法读取，图片引用检查不完整；不能据此清理文件。</p>}
      <details><summary>缺失图片（{report.missing.length}）</summary><ul>{report.missing.map(name => <li key={name}>{name}</li>)}</ul></details>
      <details><summary>失效角色关联</summary>
        <label><input type="checkbox" checked={secret} onChange={e => setSecret(e.target.checked)}/>显示秘密档案中的关联（可能揭示剧情）</label>
        <ul>{report.links.filter(row => secret || !row.secret).map((row, i) => <li key={i}>{row.character} / {row.version} / {row.secret ? "秘密档案" : "公开档案"}：关联角色不存在（{row.target}）</li>)}</ul>
      </details>
      <details><summary>同世界同类别重名</summary><ul>{report.duplicates.map(row => <li key={row.ids[0]}>{row.world} · {row.title}：{row.ids.length} 条</li>)}</ul></details>
      <details><summary>未引用图片（仅供核对）</summary>
        <p>这些文件仍可能被修复原件或外部备份引用，未提供自动删除。请先保存完整备份再人工核对。</p>
        <ul>{report.unreferenced.map(file => <li key={file.name}>{file.name} · {(file.bytes / 1024).toFixed(1)} KB</li>)}</ul>
      </details>
    </>}
  </section>;
}
