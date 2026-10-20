import { CheckSquare, Download, FileText, FolderInput, Square, Star, StarOff, Trash2, X } from "lucide-react";

export interface BatchActions {
  favorite: (value: boolean) => void;
  move: () => void;
  exportMarkdown: () => void;
  exportBackup: () => void;
  remove: () => void;
}

/** 多选模式的操作栏。已选数量通过 aria-live 播报。 */
export function BatchBar({ count, visible, onSelectAll, onClear, onExit, actions }: {
  count: number;
  visible: number;
  onSelectAll: () => void;
  onClear: () => void;
  onExit: () => void;
  actions: BatchActions;
}) {
  const none = count === 0;
  return (
    <div className="batch-bar" role="toolbar" aria-label="批量操作">
      <strong className="batch-count" aria-live="polite">已选 {count} / {visible} 位</strong>
      <div className="batch-group">
        <button type="button" className="button small" onClick={onSelectAll} disabled={visible === 0 || count === visible}>
          <CheckSquare size={14} />全选当前结果
        </button>
        <button type="button" className="button small" onClick={onClear} disabled={none}>
          <Square size={14} />清空选择
        </button>
      </div>
      <div className="batch-group">
        <button type="button" className="button small" disabled={none} onClick={() => actions.favorite(true)}><Star size={14} />收藏</button>
        <button type="button" className="button small" disabled={none} onClick={() => actions.favorite(false)}><StarOff size={14} />取消收藏</button>
        <button type="button" className="button small" disabled={none} onClick={actions.move}><FolderInput size={14} />移到分组</button>
        <button type="button" className="button small" disabled={none} onClick={actions.exportMarkdown}><FileText size={14} />导出 Markdown</button>
        <button type="button" className="button small" disabled={none} onClick={actions.exportBackup}><Download size={14} />导出备份</button>
        <button type="button" className="button small batch-danger" disabled={none} onClick={actions.remove}><Trash2 size={14} />删除</button>
      </div>
      <button type="button" className="button small batch-exit" onClick={onExit} aria-label="退出多选（Esc）">
        <X size={14} />完成
      </button>
    </div>
  );
}
