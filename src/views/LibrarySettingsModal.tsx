import { useRef } from "react";
import {
  ArrowDownToLine, FileText, ArrowUpFromLine, ChevronRight, CircleAlert, FolderOpen, HardDrive, Info, LoaderCircle,
} from "lucide-react";
import type { Library } from "../model";
import { desktop, openFolder, type LibraryImport } from "../storage";
import type { ImportChoices } from "../merge";
import { RecoveryPanel } from "../components/RecoveryPanel";
import { ImportPanel } from "../components/ImportPanel";
import { Modal } from "./Modal";
import { ThemePicker } from "../components/ThemePicker";
import type { ThemePref } from "../theme";

export interface LibrarySettingsModalProps {
  library: Library;
  busy: boolean;
  location: string;
  saveState: "saving" | "saved" | "error";
  saveError: string;
  backupRevision: number;
  notify: (text: string) => void;
  onClose: () => void;
  onRetrySave: () => void;
  moveLibrary: () => void;
  runExport: () => void;
  onExportMarkdown?: () => void;
  themePref?: ThemePref;
  onThemeChange?: (next: ThemePref) => void;
  pickRestore: (file: File) => Promise<void>;
  applyRecoveredLibrary: (candidate: Library) => Promise<void>;
  onImport: (base: Library, payload: LibraryImport, choices: ImportChoices) => Promise<void>;
}

/** 「本地资料库」设置弹窗：位置、统计、备份导出 / 恢复、修复与追加导入。 */
export function LibrarySettingsModal({
  library, busy, location, saveState, saveError, backupRevision, notify, onClose, onRetrySave,
  moveLibrary, runExport, onExportMarkdown, themePref, onThemeChange, pickRestore, applyRecoveredLibrary, onImport,
}: LibrarySettingsModalProps) {
  const restoreInput = useRef<HTMLInputElement>(null);
  return (
        <Modal
          title="本地资料库"
          onClose={() => {
            if (!busy) onClose();
          }}
        >
          <div className="storage-card">
            <HardDrive size={22} strokeWidth={1.2} />
            <div>
              <strong>
                {desktop ? "Windows 本地资料库" : "浏览器本地资料库"}
              </strong>
              <p>{location}</p>
            </div>
            {desktop && (
              <button
                className="icon-button"
                onClick={() => openFolder().catch((e) => notify(String(e)))}
                aria-label="打开资料库文件夹"
              >
                <FolderOpen size={18} />
              </button>
            )}
          </div>
          <p className="modal-description">
            {desktop
              ? "文字保存在本地 SQLite 数据库，图片存放在资料库的 assets 文件夹。无需账号，不上传云端。"
              : "当前是网页预览，资料保存在此浏览器的 IndexedDB 中。清除网站数据会移除资料，请定期导出完整备份；备份可导入桌面版。"}
          </p>
          <div className="library-stats">
            <div>
              <strong>{library.characters.length}</strong>
              <span>角色</span>
            </div>
            <div>
              <strong>
                {library.characters.reduce((n, c) => n + c.versions.length, 0)}
              </strong>
              <span>剧情版本</span>
            </div>
            <div>
              <strong>
                {library.characters.reduce(
                  (n, c) =>
                    n + c.versions.filter((v) => v.secret.enabled).length,
                  0,
                )}
              </strong>
              <span>秘密档案</span>
            </div>
          </div>
          {saveState === "error" && (
            <div className="save-error">
              <CircleAlert size={16} />
              <p>{saveError}</p>
              <button
                className="button small"
                onClick={onRetrySave}
              >
                重试保存
              </button>
            </div>
          )}
          <div className="backup-actions">
            {desktop && (
              <button
                className="backup-action"
                disabled={busy}
                onClick={moveLibrary}
              >
                <FolderOpen size={22} />
                <span>
                  <strong>更改资料库存放位置</strong>
                  <small>复制到自选空文件夹，原位置保留</small>
                </span>
                <ChevronRight size={17} />
              </button>
            )}
            <button
              className="backup-action"
              disabled={busy}
              onClick={runExport}
            >
              <ArrowDownToLine size={22} />
              <span>
                <strong>导出完整备份</strong>
                <small>角色、全部版本、秘密档案及上传图片</small>
              </span>
              <ChevronRight size={17} />
            </button>
            {onExportMarkdown && (
              <button className="backup-action" disabled={busy} onClick={onExportMarkdown}>
                <FileText size={22} />
                <span>
                  <strong>导出整库 Markdown</strong>
                  <small>每位角色一个 .md，附索引与图片（ZIP）</small>
                </span>
                <ChevronRight size={17} />
              </button>
            )}
            <button
              className="backup-action"
              disabled={busy}
              onClick={() => restoreInput.current?.click()}
            >
              <ArrowUpFromLine size={22} />
              <span>
                <strong>恢复备份</strong>
                <small>从叙册 ZIP 备份替换当前资料库</small>
              </span>
              <ChevronRight size={17} />
            </button>
          </div>
          <p className="library-tip">
            <Info size={14} />
            备份包含秘密档案，请妥善保管。
          </p>
          {themePref && onThemeChange && <ThemePicker value={themePref} onChange={onThemeChange} />}
          <RecoveryPanel key={backupRevision} onApply={applyRecoveredLibrary} />
          <ImportPanel current={library} onImport={onImport} />
          {busy && (
            <div className="operation-busy">
              <LoaderCircle size={16} className="spin" />
              正在处理资料，请稍候…
            </div>
          )}
          <input
            ref={restoreInput}
            type="file"
            accept=".zip"
            hidden
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void pickRestore(file);
              e.target.value = "";
            }}
          />
        </Modal>
  );
}
