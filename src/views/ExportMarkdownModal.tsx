import { useState } from "react";
import { FileDown, LoaderCircle } from "lucide-react";
import type { Character, Library } from "../model";
import { Modal } from "./Modal";
import { characterToMarkdown, libraryToMarkdownZip, sanitizeFileName, type LinkStyle } from "../export/markdown";
import { downloadExport, readAsset } from "../storage";
import { strToU8 } from "fflate";

export type MarkdownScope = { kind: "character"; character: Character; versionId: string } | { kind: "library" };

/** 导出 Markdown 对话框。默认只导出公开层；秘密身份需显式勾选。 */
export function ExportMarkdownModal({ library, scope, beforeExport, onClose, notify }: {
  library: Library;
  scope: MarkdownScope;
  beforeExport: () => Promise<void>;
  onClose: () => void;
  notify: (text: string) => void;
}) {
  const [includeSecret, setIncludeSecret] = useState(false);
  const [versions, setVersions] = useState<"current" | "all">("current");
  const [linkStyle, setLinkStyle] = useState<LinkStyle>("relative");
  const [busy, setBusy] = useState(false);
  const date = new Date().toISOString().slice(0, 10);
  async function run() {
    setBusy(true);
    try {
      await beforeExport();
      const exportedAt = new Date().toISOString();
      const ok = scope.kind === "character"
        ? await downloadExport(strToU8(characterToMarkdown(scope.character, library, { includeSecret, versions, currentVersionId: scope.versionId, exportedAt })), sanitizeFileName(scope.character.name) + ".md", "md")
        : await downloadExport(await libraryToMarkdownZip(library, { includeSecret, versions, linkStyle, exportedAt, readAsset }), `叙册Markdown-${date}.zip`, "zip");
      if (ok) { notify("Markdown 已导出"); onClose(); }
    } catch (error) {
      notify("导出失败：" + String(error));
    } finally { setBusy(false); }
  }
  return (
    <Modal title={scope.kind === "character" ? `导出「${scope.character.name}」为 Markdown` : "导出整库 Markdown"} onClose={() => { if (!busy) onClose(); }}>
      <div className="modal-form">
        <p className="modal-description">
          {scope.kind === "character"
            ? "导出为单个 .md 文件，包含文字资料与 CoC 数值表；图片不随单文件导出。"
            : "导出 ZIP：每位角色一个 .md、一份 index.md 索引，引用到的图片复制到 assets/ 并用相对路径引用。"}
        </p>
        <fieldset className="field">
          <legend>剧情版本</legend>
          <label><input type="radio" name="md-versions" checked={versions === "current"} onChange={() => setVersions("current")} />{scope.kind === "character" ? "当前版本" : "各角色默认版本"}</label>
          <label><input type="radio" name="md-versions" checked={versions === "all"} onChange={() => setVersions("all")} />所有版本</label>
        </fieldset>
        {scope.kind === "library" && (
          <label className="field"><span>关联角色链接</span>
            <select value={linkStyle} onChange={(e) => setLinkStyle(e.target.value as LinkStyle)}>
              <option value="relative">相对链接 [名字](./文件.md)</option>
              <option value="wikilink">Obsidian 双链 [[文件|名字]]</option>
              <option value="none">不加链接</option>
            </select>
          </label>
        )}
        <label className="field graph-check">
          <input type="checkbox" checked={includeSecret} onChange={(e) => setIncludeSecret(e.target.checked)} />
          包含秘密身份
        </label>
        {includeSecret && <p className="save-error" role="note">秘密身份将作为独立章节写入文件。秘密档案只是叙事展示，<b>不是加密</b>，分享文件即公开这些内容。</p>}
        <div className="modal-actions">
          <button type="button" className="button" disabled={busy} onClick={onClose}>取消</button>
          <button type="button" className="button primary" disabled={busy} onClick={run}>
            {busy ? <LoaderCircle size={15} className="spin" /> : <FileDown size={15} />}导出
          </button>
        </div>
      </div>
    </Modal>
  );
}
