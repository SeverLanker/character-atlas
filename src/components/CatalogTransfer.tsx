import type { HistoryAction } from "../useLibraryHistory";
import { useRef, useState } from "react";
import { Modal } from "../views/Modal";
import { applyCatalogImport, catalogLabels, exportCatalog, parseCatalog, type CatalogImportRow } from "../catalog-io";
import { downloadExport } from "../storage";
import type { CatalogEntry, CatalogKind } from "../model";

export function CatalogTransfer({ entries, kind, onChange, historyAction }: { historyAction?: HistoryAction; entries: CatalogEntry[]; kind: CatalogKind; onChange: (entries: CatalogEntry[]) => void }) {
  const file = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false), [busy, setBusy] = useState(false);
  const [text, setText] = useState(""), [format, setFormat] = useState<"json" | "csv" | "tsv">("csv");
  const [rows, setRows] = useState<CatalogImportRow[] | null>(null), [snapshot, setSnapshot] = useState("");
  const [overwrite, setOverwrite] = useState(new Set<number>()), [error, setError] = useState(""), [message, setMessage] = useState("");
  const [limit, setLimit] = useState(30), [scope, setScope] = useState("all");
  const signature = JSON.stringify(entries);
  const [lastImport, setLastImport] = useState<{ before: string; after: string; count: number } | null>(null);
  const stale = snapshot !== signature;
  function preview(source = text, type = format) {
    setRows(null); setError(""); setOverwrite(new Set()); setLimit(30);
    try { setRows(parseCatalog(source, type, entries)); setSnapshot(JSON.stringify(entries)); }
    catch (err) { setError(err instanceof Error ? err.message : String(err)); }
  }
  async function output(type: "json" | "csv") {
    setBusy(true); setMessage("");
    try {
      const selected = scope === "all" ? entries : entries.filter(item => item.kind === kind);
      const range = scope === "all" ? "全部条目" : `当前类别：${catalogLabels[kind]}`;
      const content = exportCatalog(selected, type);
      const ok = await downloadExport(new TextEncoder().encode(content), `叙册条目库-${scope === "all" ? "全部" : catalogLabels[kind]}.${type}`, type);
      if (ok) setMessage(`已导出 ${selected.length} 条（${range}，${type.toUpperCase()}）。`);
    } catch (err) { setMessage(`导出失败：${err instanceof Error ? err.message : String(err)}`); }
    finally { setBusy(false); }
  }
  const count = (status: CatalogImportRow["status"]) => rows?.filter(row => row.status === status).length ?? 0;
  return <div className="catalog-transfer">
    <div className="catalog-transfer-actions">
      <button type="button" className="button small" onClick={() => { setOpen(true); setRows(null); setError(""); }}>导入 / 批量快填</button>
      <label>导出范围 <select aria-label="条目导出范围" value={scope} onChange={e => setScope(e.target.value)}><option value="all">全部条目</option><option value="kind">当前类别：{catalogLabels[kind]}</option></select></label>
      <span>将导出 {scope === "all" ? entries.length : entries.filter(item => item.kind === kind).length} 条</span>
      <button type="button" className="button small" disabled={busy} onClick={() => void output("json")}>导出 JSON</button>
      <button type="button" className="button small" disabled={busy} onClick={() => void output("csv")}>导出 CSV</button>
    </div><p role="status">{lastImport && historyAction === "undo" && signature === lastImport.before ? `已撤销本次导入（${lastImport.count} 条）。` : lastImport && historyAction === "redo" && signature === lastImport.after ? `已重做本次导入（${lastImport.count} 条）。` : message}</p>
    {open && <Modal title="导入条目库 / 批量快填" className="catalog-import-modal" onClose={() => { if (!busy) setOpen(false); }}>
      <p className="editor-help">支持 CSV／Tab 分隔表格／JSON。单次最多 10000 条 / 32 MB；标签支持 、 , ， ； ; | /（两侧无空白时拆分）。预览不会保存；错误条目跳过，重名默认跳过。五列表头兼容别名，可选第六列「世界」；空值表示全库通用。</p>
      <button type="button" className="button small" disabled={busy} onClick={() => file.current?.click()}>选择条目文件</button>
      <input ref={file} type="file" aria-label="选择条目文件" accept=".json,.csv,.tsv" hidden onChange={async e => {
        const input = e.currentTarget, selected = input.files?.[0]; if (!selected) return;
        setBusy(true); setRows(null); setError("");
        try {
          if (selected.size > 32 * 1024 * 1024) throw new Error("条目文件超过 32 MB，请分批导入。");
          const type = selected.name.toLowerCase().endsWith(".json") ? "json" : selected.name.toLowerCase().endsWith(".tsv") ? "tsv" : "csv";
          const value = await selected.text(); setText(value); setFormat(type); preview(value, type);
        } catch (err) { setError(err instanceof Error ? err.message : String(err)); }
        finally { setBusy(false); input.value = ""; }
      }}/>
      <label className="field"><span>粘贴格式</span><select value={format} onChange={e => { setFormat(e.target.value as typeof format); setRows(null); }}><option value="csv">CSV（逗号分隔）</option><option value="tsv">表格粘贴（Tab 分隔，含表头）</option><option value="json">JSON</option></select></label>
      <label className="field"><span>批量填写内容</span><textarea rows={6} value={text} placeholder={'名称,类别,等级,标签,说明\n古籍修复,技能,精通,修复、文献,辨识与修补旧书'} onChange={e => { setText(e.target.value); setRows(null); setError(""); }}/></label>
      <button type="button" className="button small" disabled={busy || !text.trim()} onClick={() => preview()}>解析并预览</button>
      {error && <p role="alert" className="field-error">{error}</p>}
      {rows && <section aria-label="导入预览" className="catalog-import-preview">
        <p role="status">共 {rows.length} 条：新增 {count("new")} / 重名 {count("duplicate")} / 错误 {count("error")}</p>
        {!!rows[0]?.headerNotes.length && <div className="catalog-header-notes" aria-label="表头映射">{rows[0].headerNotes.map(note => <p key={note}>{note}</p>)}</div>}
        <p className="editor-help">同一文件内的重名按顺序处理；勾选覆盖时，后面的内容覆盖前面的内容。覆盖保留原条目编号，已复制到角色的内容不受影响。</p>
        {!!count("duplicate") && <div className="catalog-transfer-actions"><button type="button" className="text-button" onClick={() => setOverwrite(new Set(rows.filter(row => row.status === "duplicate").map(row => row.line)))}>覆盖全部重名</button><button type="button" className="text-button" onClick={() => setOverwrite(new Set())}>跳过全部重名</button></div>}
        {(["new", "duplicate", "error"] as const).map(status => <details key={status} open><summary>{({ new: "新增", duplicate: "重名", error: "错误" })[status]} · {count(status)}</summary>
          {rows.filter(row => row.status === status).slice(0, limit).map(row => <article key={row.line} className={"catalog-import-row" + (row.attention ? " catalog-import-attention" : "")}><strong>第 {row.line} 条 · {row.title}</strong><p>{row.entry ? `${row.entry.world || "全库通用"} · ${catalogLabels[row.entry.kind]} · ${row.entry.rank || "未填等级"} · ` : ""}{row.reason}</p>
            {row.warnings.map((warning, i) => <p className="catalog-import-warning" key={i}>{warning}</p>)}
            {row.attention && <p className="catalog-import-warning">请注意：可选内容为空且存在未识别字段，确认键名正确后再导入。</p>}
            {row.entry && <details><summary>查看内容</summary><p className="catalog-description">{row.entry.text}</p></details>}
            {status === "duplicate" && <label><input type="checkbox" checked={overwrite.has(row.line)} onChange={e => { const next = new Set(overwrite); if (e.target.checked) next.add(row.line); else next.delete(row.line); setOverwrite(next); }}/>覆盖第 {row.line} 条同名条目</label>}
          </article>)}
        </details>)}
        {Math.max(count("new"), count("duplicate"), count("error")) > limit && <button type="button" className="text-button" onClick={() => setLimit(limit + 30)}>再显示 30 条</button>}
        {stale && <p role="alert">条目库已变化，请重新解析预览后确认。</p>}
        <footer className="picker-actions"><button type="button" className="button" onClick={() => setOpen(false)}>取消</button><button type="button" className="button primary" disabled={busy || stale || !(count("new") + overwrite.size)} onClick={() => {
          try {
            if (stale) throw new Error("条目库已变化，请重新解析预览。");
            const merged = applyCatalogImport(entries, rows, overwrite);
            onChange(merged); setLastImport({ before: signature, after: JSON.stringify(merged), count: count("new") + overwrite.size }); setOpen(false); setMessage(`已导入 ${count("new") + overwrite.size} 条，跳过 ${count("error")} 条错误和 ${count("duplicate") - overwrite.size} 条重名。`);
          } catch (err) { setError(err instanceof Error ? err.message : String(err)); }
        }}>确认导入合法条目（{count("new") + overwrite.size}）</button></footer>
      </section>}
    </Modal>}
  </div>;
}
