import { useState } from "react";
import type { useLibraryHistory } from "../useLibraryHistory";
export function OperationHistory({ history, disabled }: { history: ReturnType<typeof useLibraryHistory>; disabled: boolean }) {
  const [expanded, setExpanded] = useState(false);
  const { undo, redo } = history.operations;
  return <section className="recovery-panel" aria-label="操作历史">
    <h2>操作历史</h2>
    <p className="editor-help">只保留本次运行的最近 40 步。记录操作名称与来源，不记录档案正文；关闭程序后清空，长期恢复请使用备份。</p>
    <div className="coc-edit-actions">
      <button className="button small" disabled={disabled || !history.canUndo} onClick={history.undo}>撤销：{undo[0]?.label ?? "暂无操作"}</button>
      <button className="button small" disabled={disabled || !history.canRedo} onClick={history.redo}>重做：{redo[0]?.label ?? "暂无操作"}</button>
    </div>
    <p role="status">可撤销 {undo.length} 步 · 可重做 {redo.length} 步</p>
    <ol>{undo.slice(0, expanded ? 40 : 5).map((row, index) => <li key={index}>
      <strong>{row.source === "agent" ? "Agent" : "界面"} · {row.label}</strong>{row.at > 0 && <small> · {new Date(row.at).toLocaleTimeString()}</small>}
    </li>)}</ol>
    {undo.length > 5 && <button className="text-button" onClick={() => setExpanded(!expanded)}>{expanded ? "收起记录" : "展开全部记录"}</button>}
    {!undo.length && <p>暂无可撤销的操作。</p>}
  </section>;
}
