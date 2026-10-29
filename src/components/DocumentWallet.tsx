import { useEffect, useState } from "react";
import { reducedMotion } from "../motion";
import { TypeReveal } from "./TypeReveal";
import {
  BadgeCheck,
  BookOpen,
  CarFront,
  ContactRound,
  Copy,
  Fingerprint,
  GraduationCap,
  IdCard,
  PencilLine,
  Plus,
  RotateCcw,
  Shield,
  Trash2,
  Undo2,
  Redo2,
} from "lucide-react";
import type { Profile, Secret } from "../model";
import {
  createDocument,
  documentFieldLabels,
  documentLabel,
  documentTemplates,
  barcodeBars,
  MAX_DOCUMENTS,
  MAX_FIELD,
  MAX_TITLE,
  mrzLines,
  orderDocuments,
  primaryDocument,
  type CharacterDocument,
  type DocumentField,
  type DocumentType,
} from "../documents";
import { ImageInput } from "./Editor";
import { Portrait } from "./Portrait";

const icons = {
  identity: IdCard,
  driver: CarFront,
  passport: BookOpen,
  student: GraduationCap,
  work: ContactRound,
  police: Shield,
  other: BadgeCheck,
};

/** Short design notes per type; each face has its own layout, palette and security motifs (all fictional). */
const editions: Record<DocumentType, string> = { identity: "ID", driver: "DL", passport: "P", student: "ST", work: "STAFF", police: "WC", other: "DOC" };
const microtext = "CHARACTER ATLAS · FICTIONAL DOCUMENT · 叙册 · ";

function Barcode({ text }: { text: string }) {
  const bars = barcodeBars(text);
  let x = 0;
  const rects = bars.map((width, i) => { const rect = i % 2 === 0 ? <rect key={i} x={x} y={0} width={width} height={20} /> : null; x += width; return rect; });
  return <svg className="doc-barcode" viewBox={`0 0 ${x} 20`} preserveAspectRatio="none" aria-hidden="true" focusable="false">{rects}</svg>;
}

export function DocumentFace({
  document: doc,
  secret,
  onReveal,
  primary = false,
  hidden = false,
  stamp = false,
  onStamped,
}: {
  document: CharacterDocument;
  secret?: Secret;
  onReveal?: () => void;
  primary?: boolean;
  /** Showing the secret identity: archive text types in on first display. */
  hidden?: boolean;
  /** Just issued: play the stamp once. */
  stamp?: boolean;
  onStamped?: () => void;
}) {
  const template = documentTemplates[doc.type],
    Icon = icons[doc.type];
  const fields = (template.fields as readonly DocumentField[]).filter(
    (key) => key !== "holder" && key !== "number" && doc.fields[key]?.trim(),
  );
  const trigger = secret?.enabled ? secret.trigger : undefined;
  const title = doc.title || template.name;
  const clinical = hidden && secret?.theme === "clinical";
  const typedText = (key: string, text: string, on: boolean) =>
    on ? <TypeReveal id={`${doc.id}:${key}:${hidden ? "s" : "p"}`} text={text} /> : text;
  return (
    <article
      className={`document-face document-${doc.type}${primary ? " is-primary" : ""}`}
      aria-label={`${title}预览${primary ? "（主证件）" : ""}`}
    >
      <span className="doc-pattern" aria-hidden="true" />
      <span className="doc-micro" aria-hidden="true">{microtext.repeat(6)}</span>
      {(doc.type === "passport" || doc.type === "police") && <span className="doc-spine" aria-hidden="true"><span>{doc.type === "passport" ? "PASSPORT · 护照" : "WARRANT CARD"}</span></span>}
      <header className="document-masthead">
        <Icon size={27} strokeWidth={1.4} aria-hidden="true" />
        <div>
          <small>{template.en}</small>
          <h2>{title}</h2>
        </div>
        {primary ? <span className="doc-primary">主证件</span> : <span className="document-edition" aria-hidden="true">{editions[doc.type]}</span>}
      </header>
      <div className="document-body">
        <div className="doc-photo-frame">
          <Portrait
            image={doc.portrait}
            className="document-photo"
            onClick={trigger === "portrait" ? onReveal : undefined}
            label="切换身份档案"
          />
          {(doc.type === "identity" || doc.type === "driver" || doc.type === "passport") && <span className="doc-holo" aria-hidden="true" />}
        </div>
        <div className="document-holder">
          <small>姓名 / NAME</small>
          {trigger === "name" ? (
            <button className="text-button" onClick={onReveal}>
              {typedText("holder", doc.fields.holder || "姓名未填写", hidden)}
            </button>
          ) : (
            <h3>{typedText("holder", doc.fields.holder || "姓名未填写", hidden)}</h3>
          )}
          <div className="document-fields">
            {fields.map((key) => (
              <div
                key={key}
                className={
                  ["address", "issuer", "organization", "school", "birthplace"].includes(key)
                    ? "document-wide"
                    : key === "vehicleClass" ? "doc-class" : undefined
                }
              >
                <span>{documentLabel(doc.type, key)}</span>
                <b>{typedText(key, doc.fields[key] ?? "", clinical)}</b>
              </div>
            ))}
          </div>
        </div>
      </div>
      {doc.fields.notes?.trim() && (
        <p className="document-notes">
          <span>备注</span>
          {typedText("notes", doc.fields.notes, clinical)}
        </p>
      )}
      <footer className="document-footer">
        <div>
          <small>{template.numberLabel}</small>
          <strong>{doc.fields.number ? typedText("number", doc.fields.number, hidden || doc.type === "police") : "尚未填写"}</strong>
        </div>
        {(doc.type === "student" || doc.type === "work" || doc.type === "driver") && <Barcode text={`${doc.id}${doc.fields.number ?? ""}`} />}
        {trigger === "emblem" ? (
          <button className="document-seal" aria-label="切换身份档案" onClick={onReveal}>
            <Fingerprint size={32} strokeWidth={1} />
          </button>
        ) : (
          <span className="document-seal" aria-hidden="true">
            <Icon size={30} strokeWidth={1} />
          </span>
        )}
      </footer>
      {doc.type === "passport" && (
        <div className="doc-mrz" aria-label="机读码（虚构）">
          {mrzLines(doc).map((line, i) => <code key={i}>{line}</code>)}
        </div>
      )}
      {stamp && (
        <span className="doc-issue-stamp" aria-hidden="true" onAnimationEnd={onStamped}>
          <b>{doc.type === "police" || doc.type === "work" ? "核发" : "签发"}</b>
          <small>ISSUED</small>
        </span>
      )}
      <div className="document-baseline" aria-hidden="true">
        <span>CHARACTER ATLAS · FICTIONAL</span>
        <span>{template.en}</span>
      </div>
    </article>
  );
}

interface Props {
  profile: Profile;
  secret: Secret;
  hidden: boolean;
  context: string;
  onChange: (
    update: (docs: CharacterDocument[]) => CharacterDocument[],
    checkpoint?: boolean,
  ) => void;
  onInherit: () => void;
  onReveal: () => void;
  onUpload: (file: File) => Promise<string>;
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  /** Documents to show: saved ones, the legacy preview, or the secret view of inherited public ones. */
  documents: CharacterDocument[];
  /** True while a secret identity shows the public documents under its own name and number. */
  inherited: boolean;
  /** Select this document first (search hits). */
  initialId?: string;
  /** Just switched between public and secret identity. */
  glitch?: boolean;
}
export function DocumentWallet({
  profile,
  secret,
  hidden,
  context,
  onChange,
  onInherit,
  onReveal,
  onUpload,
  undo,
  redo,
  canUndo,
  canRedo,
  documents,
  inherited,
  initialId,
  glitch = false,
}: Props) {
  const docs = orderDocuments(documents), primary = primaryDocument(documents);
  const [selectedId, setSelectedId] = useState(initialId && docs.some(doc => doc.id === initialId) ? initialId : primary?.id ?? "");
  const [adding, setAdding] = useState(false);
  const [stampId, setStampId] = useState<string | null>(null);
  // Fallback when animationend never fires (e.g. hidden tab): drop the stamp anyway.
  useEffect(() => { if (!stampId) return; const t = setTimeout(() => setStampId(null), 2400); return () => clearTimeout(t); }, [stampId]);
  const [editing, setEditing] = useState(false);
  const [confirm, setConfirm] = useState<
    { kind: "delete"; id: string; title: string } | { kind: "inherit" } | null
  >(null);
  const selected = docs.find((doc) => doc.id === selectedId) ?? docs[0];
  function add(type: DocumentType) {
    const doc = createDocument(type, profile);
    onChange(
      (current) =>
        current.length < MAX_DOCUMENTS ? [...current, doc] : current,
      true,
    );
    setSelectedId(doc.id);
    if (!reducedMotion()) setStampId(doc.id);
    setEditing(true);
    setAdding(false);
    setConfirm(null);
  }
  function patch(patch: Partial<CharacterDocument>) {
    if (!selected) return;
    onChange((current) =>
      current.map((doc) =>
        doc.id === selected.id ? { ...doc, ...patch } : doc,
      ),
    );
  }
  function field(key: DocumentField, value: string) {
    if (!selected) return;
    onChange((current) =>
      current.map((doc) =>
        doc.id === selected.id
          ? { ...doc, fields: { ...doc.fields, [key]: value } }
          : doc,
      ),
    );
  }
  return (
    <div className={`document-wallet ${hidden ? `wallet-secret secret-theme-${secret.theme}` : ""}${glitch ? " identity-glitch" : ""}`}>
      <div className="wallet-context">
        <span>{context}</span>
        <b>{hidden ? "秘密证件" : "公开证件"}</b>
        <span>{docs.length} 张</span>
      </div>
      <div className="wallet-tools">
        <button
          className="button primary"
          disabled={docs.length >= MAX_DOCUMENTS}
          onClick={() => setAdding(!adding)}
          aria-expanded={adding}
        >
          <Plus size={15} />
          添加证件
        </button>
        <div>
          <button
            className="icon-button"
            aria-label="撤销修改"
            onClick={undo}
            disabled={!canUndo}
          >
            <Undo2 size={16} />
          </button>
          <button
            className="icon-button"
            aria-label="重做修改"
            onClick={redo}
            disabled={!canRedo}
          >
            <Redo2 size={16} />
          </button>
        </div>
        {/* Only offered once the secret side is already open, so it never reveals that one exists. */}
        {hidden && (
          <button className="button small" onClick={onReveal}>
            返回公开身份
          </button>
        )}
      </div>
      {adding && (
        <div className="document-type-picker" aria-label="选择证件类型">
          {(Object.keys(documentTemplates) as DocumentType[]).map((type) => {
            const Icon = icons[type];
            return (
              <button key={type} onClick={() => add(type)}>
                <Icon size={22} strokeWidth={1.4} />
                <span>{documentTemplates[type].name}</span>
                <small>{documentTemplates[type].en}</small>
              </button>
            );
          })}
        </div>
      )}
      {hidden && (
        <p className="wallet-hint">
          {inherited
            ? "沿用公开证件：姓名、身份号码与照片按秘密档案显示。修改任意内容后，将另存为独立的秘密证件组。"
            : "此组证件仅用于当前剧情版本的秘密身份。"}
          {!inherited && (
            <button
              className="text-button"
              onClick={() => setConfirm({ kind: "inherit" })}
            >
              <RotateCcw size={13} />
              恢复沿用公开证件
            </button>
          )}
        </p>
      )}
      {profile.documents === undefined && (
        <p className="wallet-hint">
          这张身份证由当前档案生成；编辑或添加后，证件资料独立保存。
        </p>
      )}
      {confirm && (
        <div className="wallet-confirm" role="alert">
          <p>
            {confirm.kind === "delete"
              ? `移除「${confirm.title || "这张证件"}」？可通过撤销恢复。`
              : "用公开证件替换当前秘密证件组？可通过撤销恢复。"}
          </p>
          <button
            className="button"
            onClick={() => {
              if (confirm.kind === "delete")
                onChange(
                  (current) => current.filter((doc) => doc.id !== confirm.id),
                  true,
                );
              else if (confirm.kind === "inherit") onInherit();
              setConfirm(null);
              setEditing(false);
            }}
          >
            确认{confirm.kind === "delete" ? "移除" : "恢复沿用"}
          </button>
          <button className="button" onClick={() => setConfirm(null)}>
            取消
          </button>
        </div>
      )}
      {selected ? (
        <div className="wallet-layout">
          <nav className="document-list" aria-label="角色证件列表">
            {docs.map((doc, i) => {
              const Icon = icons[doc.type];
              return (
                <button
                  key={doc.id}
                  className={doc === primary ? "is-primary" : undefined}
                  aria-pressed={doc.id === selected.id}
                  onClick={() => {
                    setSelectedId(doc.id);
                    setEditing(false);
                    setConfirm(null);
                  }}
                >
                  <Icon size={20} />
                  <span>
                    <strong>
                      {doc.title || documentTemplates[doc.type].name}
                    </strong>
                    <small>
                      {documentTemplates[doc.type].name} ·{" "}
                      {doc.fields.number || "未填写编号"}
                    </small>
                  </span>
                  {doc === primary ? <em>主证件</em> : <i>{String(i + 1).padStart(2, "0")}</i>}
                </button>
              );
            })}
          </nav>
          <section className="wallet-content">
            <div className={`wallet-stack${docs.length > 1 ? " has-stack" : ""}${selected === primary ? " shows-primary" : ""}`} data-behind={Math.min(docs.length - 1, 2)}>
              <DocumentFace
                document={selected}
                secret={secret}
                onReveal={onReveal}
                primary={selected === primary}
                hidden={hidden}
                stamp={stampId === selected.id}
                onStamped={() => setStampId(null)}
              />
            </div>
            <div className="document-actions">
              <button
                className="button"
                aria-expanded={editing}
                onClick={() => setEditing(!editing)}
              >
                <PencilLine size={14} />
                {editing ? "完成编辑" : "编辑证件"}
              </button>
              <button
                className="button"
                disabled={docs.length >= MAX_DOCUMENTS}
                onClick={() => {
                  const copy = {
                    ...structuredClone(selected),
                    id: crypto.randomUUID(),
                    title:
                      (selected.title.slice(0, 115) ||
                        documentTemplates[selected.type].name) + " · 副本",
                  };
                  onChange(
                    (current) =>
                      current.length < MAX_DOCUMENTS
                        ? [...current, copy]
                        : current,
                    true,
                  );
                  setSelectedId(copy.id);
                  setEditing(true);
                  setConfirm(null);
                }}
              >
                <Copy size={14} />
                复制证件
              </button>
              <button
                className="button danger-text"
                onClick={() =>
                  setConfirm({
                    kind: "delete",
                    id: selected.id,
                    title: selected.title,
                  })
                }
              >
                <Trash2 size={14} />
                移除证件
              </button>
            </div>
            {editing && (
              <div
                className="document-editor"
                role="region"
                aria-label="编辑证件资料"
              >
                {inherited && <p className="wallet-hint wallet-inherit-note" role="note">
                  正在沿用公开证件。下面显示的是秘密身份下的样子；保存任何修改都会把整组复制为秘密证件组，公开证件不受影响。
                </p>}
                <p className="wallet-hint">
                  修改自动保存。证件上的姓名、编号与照片独立于角色档案；可填写伪装身份。同类证件也可添加多张。
                </p>
                <div className="document-editor-grid">
                  <label className="field">
                    <span>证件名称</span>
                    <input
                      maxLength={MAX_TITLE}
                      value={selected.title}
                      onChange={(e) => patch({ title: e.target.value })}
                    />
                  </label>
                  <label className="field">
                    <span>证件类型</span>
                    <select
                      value={selected.type}
                      onChange={(e) => {
                        const type = e.target.value as DocumentType;
                        patch({
                          type,
                          title:
                            selected.title ===
                            documentTemplates[selected.type].name
                              ? documentTemplates[type].name
                              : selected.title,
                        });
                      }}
                    >
                      {(Object.keys(documentTemplates) as DocumentType[]).map(
                        (type) => (
                          <option key={type} value={type}>
                            {documentTemplates[type].name}
                          </option>
                        ),
                      )}
                    </select>
                  </label>
                </div>
                <div className="document-image-editor">
                  <h3>证件照片</h3>
                  <ImageInput
                    key={selected.id}
                    value={selected.portrait}
                    onChange={(portrait) => {
                      const id = selected.id;
                      onChange((current) =>
                        current.map((doc) =>
                          doc.id === id ? { ...doc, portrait } : doc,
                        ),
                      );
                    }}
                    onUpload={onUpload}
                  />
                </div>
                <div className="document-editor-grid">
                  {[
                    ...documentTemplates[selected.type].fields,
                    "notes" as const,
                  ].map((key) => (
                    <label
                      className={
                        "field " +
                        (key === "notes" || key === "address"
                          ? "document-wide"
                          : "")
                      }
                      key={key}
                    >
                      <span>{documentLabel(selected.type, key)}</span>
                      {key === "notes" || key === "address" ? (
                        <textarea
                          maxLength={MAX_FIELD}
                          rows={3}
                          value={selected.fields[key] ?? ""}
                          onChange={(e) => field(key, e.target.value)}
                        />
                      ) : (
                        <input
                          maxLength={MAX_FIELD}
                          value={selected.fields[key] ?? ""}
                          onChange={(e) => field(key, e.target.value)}
                          placeholder={
                            key === "expires"
                              ? "日期、长期或剧情时间"
                              : undefined
                          }
                        />
                      )}
                    </label>
                  ))}
                </div>
                <p className="wallet-hint">
                  {documentFieldLabels.issued}
                  与有效期支持任意世界观的日期。更换类型会保留已有字段，切回原类型可继续编辑。
                </p>
              </div>
            )}
          </section>
        </div>
      ) : (
        <div className="wallet-empty">
          <IdCard size={42} strokeWidth={1} />
          <h3>还没有证件</h3>
          <p>为这个身份添加第一张证件。{hidden && " 也可以用上方「返回公开身份」回到公开证件。"}</p>
          <button className="button" onClick={() => setAdding(true)}>
            <Plus size={15} />
            选择证件类型
          </button>
        </div>
      )}
    </div>
  );
}
