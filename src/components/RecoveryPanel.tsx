import { useEffect, useState } from "react";
import { strToU8, zipSync } from "fflate";
import { inspectRecovery, type RecoveryProposal } from "../recovery";
import type { Library } from "../model";
import { desktop, downloadBytes, exportRecoveryOriginals, lastBackupExport, listSnapshots, preserveOriginal, readRawLibrary, snapshotLibrary, parseBackup, prepareBackupRecovery, restoreBackup, type LibrarySnapshot } from "../storage";

export function RecoveryPanel({ onApply, failed = false, beforeApply }: { onApply: (library: Library) => Promise<void>; failed?: boolean; beforeApply?: () => Promise<() => void> }) {
  const [snapshots, setSnapshots] = useState<LibrarySnapshot[]>([]);
  const [proposal, setProposal] = useState<RecoveryProposal | null>(null);
  const [lastExport, setLastExport] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [backup, setBackup] = useState<{ bytes: Uint8Array; original?: string } | null>(null);
  useEffect(() => {
    Promise.all([listSnapshots(), lastBackupExport()]).then(([rows, last]) => { setSnapshots(rows); setLastExport(last); }).catch((e) => setMessage(String(e)));
  }, []);
  async function run(action: () => Promise<void>) {
    setBusy(true); setMessage("");
    try { await action(); } catch (error) { setMessage(error instanceof Error ? error.message : String(error)); }
    finally { setBusy(false); }
  }
  return <section className="recovery-panel" aria-label="资料保护与恢复">
    <h2>资料保护与恢复</h2>
    {!desktop && <>
      <p className="editor-help">自动快照最多保留 10 份，有改动时每约 30 分钟留存一次此前资料。快照依赖此浏览器的图片存储，清除网站数据会同时移除快照；请另存完整 ZIP。</p>
      <p className="editor-help">更换浏览器、预览会话、网址或端口，可能进入另一份独立存储。看到演示角色时，请先检查原来的环境与网址。</p>
      <p className={!lastExport || Date.now() - Date.parse(lastExport) > 7 * 86400000 ? "backup-overdue" : ""}>上次发起完整备份导出：{lastExport ? new Date(lastExport).toLocaleString() : "尚无记录"}</p>
      <button className="button small" disabled={busy} onClick={() => run(async () => {
        const persisted = await navigator.storage?.persist?.();
        setMessage(persisted ? "浏览器已允许持久存储；仍需保留文件备份。" : "浏览器未授予持久存储，请定期导出文件备份。");
      })}>请求浏览器持久存储</button>
    </>}
      {desktop && <p className="editor-help">自动备份最多保留 10 份，有改动时每约 30 分钟保存此前资料。备份只含文字，图片仍依赖当前资料库的 assets 文件夹；请另存完整 ZIP。预览会校验资料和图片，恢复前需保存当前原件。</p>}
      <button className="text-button" disabled={busy} onClick={() => run(async () => { setSnapshots(await listSnapshots()); })}>刷新历史备份</button>
      <details><summary>历史备份（{snapshots.length}）</summary>
        {snapshots.map((snapshot) => <div className="recovery-row" key={snapshot.id}>
          <span>{new Date(snapshot.createdAt).toLocaleString()}</span>
          {typeof snapshot.characters === "number" && <span>{snapshot.characters} 个角色 · {snapshot.versions ?? 0} 个版本</span>}
          {snapshot.error && <span role="status">此备份无法读取：{snapshot.error}</span>}
          <button className="button small" disabled={busy || !!snapshot.error} onClick={() => run(async () => {
            setProposal(null);
            setBackup(null);
            const library = await snapshotLibrary(snapshot);
            setProposal({ library, excluded: 0, changes: ["将用此快照替换当前资料。当前原件会先保留。"] });
          })}>预览恢复</button>
        </div>)}
        {!snapshots.length && <p>尚无可用的自动备份。</p>}
      </details>
      {!desktop && <button className="text-button" disabled={busy} onClick={() => run(async () => { await downloadBytes(await exportRecoveryOriginals(), "叙册修复前原件.zip"); })}>导出已保留的修复原件</button>}
    {failed && <div className="recovery-row">
      <button className="button small" disabled={busy} onClick={() => run(async () => { setProposal(null); setBackup(null); setProposal(inspectRecovery(await readRawLibrary())); })}>分析可修复资料 / 有效角色</button>
      <button className="button small" disabled={busy} onClick={() => run(async () => {
        const raw = await readRawLibrary();
        if (raw == null) throw new Error("当前没有可导出的原始资料");
        await downloadBytes(zipSync({ "library.original.json": strToU8(typeof raw === "string" ? raw : JSON.stringify(raw, null, 2)) }), "叙册原始资料.zip");
      })}>导出原始资料</button>
      <label className="field"><span>选择完整 ZIP 备份恢复</span><input type="file" accept=".zip" disabled={busy} onChange={(e) => {
        const file = e.target.files?.[0]; e.target.value = "";
        if (!file) return;
        void run(async () => {
          setProposal(null); setBackup(null);
          if (file.size > 256 * 1024 * 1024) throw new Error("备份文件超过 256 MB");
          const bytes = new Uint8Array(await file.arrayBuffer());
          try {
            const parsed = parseBackup(bytes);
            setBackup({ bytes }); setProposal({ library: parsed.library, excluded: 0, changes: ["将用所选 ZIP 替换当前资料，原件会先保留。"] });
          } catch (originalError) {
            try {
              const repaired = prepareBackupRecovery(bytes);
              setBackup({ bytes: repaired.repairedBytes, original: repaired.raw }); setProposal(repaired);
            } catch { throw originalError; }
          }
        });
      }} /></label>
    </div>}
    {proposal && <div className="recovery-proposal">
      <h3>恢复预览：{proposal.library.characters.length} 个角色</h3>
      {proposal.changes.map((change, i) => <p key={i}>{change}</p>)}
      {!proposal.changes.length && <p>未发现可自动修复的问题，将重新加载已通过校验的资料。</p>}
      {proposal.excluded > 0 && <p>有 {proposal.excluded} 个角色暂不加载，其完整内容保留在原件中。</p>}
      <button className="button primary small" disabled={busy} onClick={() => run(async () => {
        const release = await beforeApply?.();
        try {
        const raw = await readRawLibrary();
        await preserveOriginal(raw);
        if (backup?.original) await preserveOriginal(backup.original);
        const library = backup ? await restoreBackup(backup.bytes) : proposal.library;
        await onApply(library); setProposal(null); setBackup(null);
        setMessage("资料已恢复，修复前原件已保留。");
        setSnapshots(await listSnapshots());
        } finally { release?.(); }
      })}>保留原件并应用此方案</button>
      <button className="button small" disabled={busy} onClick={() => setProposal(null)}>取消</button>
    </div>}
    {busy && <p role="status">正在处理，请稍候…</p>}
    {message && <p role="status">{message}</p>}
  </section>;
}
