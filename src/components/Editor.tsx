import type { HistoryAction } from "../useLibraryHistory";
import { CatalogPicker } from "./LibraryPicker";
import { BodyImport } from "./BodyImport";
import { RelationshipEditor } from "./Relationships";
import { useEffect, useId, useRef, useState, type ChangeEvent } from "react";
import {
  Check,
  Undo2,
  Redo2,
  Copy,
  Eye,
  Plus,
  RotateCcw,
  Settings2,
  Shield,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import {
  basicLabels,
  defaultVersion,
  pageMeta,
  uid,
  type Basics,
  type Character,
  type Entry,
  type Overrides,
  type Page,
  type Profile,
  type Secret,
  type Version,
  type CatalogEntry,
  type Skill,
} from "../model";
import { CocEditor, CocStateEditor } from "./CocPanel";
import { blankCoc } from "../coc";
import { Portrait } from "./Portrait";
import { CatalogPanel } from "./CatalogPanel";
export function ImageInput({
  value,
  onChange,
  onUpload,
}: {
  value: string;
  onChange: (ref: string) => void;
  onUpload: (file: File) => Promise<string>;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function select(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy(true);
    setError("");
    try {
      onChange(await onUpload(file));
    } catch (err) {
      setError(String(err instanceof Error ? err.message : err));
    } finally {
      setBusy(false);
      e.target.value = "";
    }
  }
  return (
    <div className="image-input">
      <Portrait image={value} />
      <div>
        <button
          className="button small"
          onClick={() => ref.current?.click()}
          disabled={busy}
        >
          <Upload size={14} />
          {busy ? "正在导入…" : "选择图片"}
        </button>
        {value && (
          <button className="text-button muted" onClick={() => onChange("")}>
            移除
          </button>
        )}
        <small>PNG / JPG / WebP / GIF · 最大 12 MB</small>
        {error && <span className="field-error">{error}</span>}
      </div>
      <input
        ref={ref}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif"
        hidden
        onChange={select}
      />
    </div>
  );
}
type ListField<T> = {
  key: keyof T;
  label: string;
  type?: "text" | "textarea" | "image" | "select" | "checkbox";
  options?: { value: string; label: string }[];
  suggestions?: string[];
};
function ListEditor<T extends { id: string }>({
  title,
  items,
  fields,
  add,
  onAdd,
  onChange,
  onUpload,
}: {
  title: string;
  items: T[];
  fields: ListField<T>[];
  add: () => T;
  onAdd?: () => void;
  onChange: (v: T[]) => void;
  onUpload: (file: File) => Promise<string>;
}) {
  const listId = useId();
  return (
    <section className="edit-section">
      <div className="edit-section-title">
        <h3>{title}</h3>
        <button
          className="text-button"
          onClick={() => onAdd ? onAdd() : onChange([...items, add()])}
        >
          <Plus size={14} />
          添加
        </button>
      </div>
      {items.map((row, i) => (
        <div className="edit-entry" key={row.id}>
          <div className="edit-entry-top">
            <small>记录 {String(i + 1).padStart(2, "0")}</small>
            <button
              className="icon-button danger-text"
              aria-label={"删除" + title + "条目"}
              onClick={() =>
                onChange(items.filter((item) => item.id !== row.id))
              }
            >
              <Trash2 size={14} />
            </button>
          </div>
          {fields.map((field) => {
            const set = (value: string | boolean) =>
              onChange(
                items.map((item) =>
                  item.id === row.id ? { ...item, [field.key]: value } : item,
                ),
              );
            const value = String(row[field.key] ?? "");
            return (
              <label key={String(field.key)} className="field">
                <span>{field.label}</span>
                {field.type === "checkbox" ? <input type="checkbox" checked={Boolean(row[field.key])} onChange={(e) => set(e.target.checked)} /> : field.type === "image" ? (
                  <ImageInput
                    value={value}
                    onChange={set}
                    onUpload={onUpload}
                  />
                ) : field.type === "textarea" ? (
                  <textarea
                    value={value}
                    onChange={(e) => set(e.target.value)}
                    rows={3}
                  />
                ) : field.type === "select" ? (
                  <select value={value} onChange={(e) => set(e.target.value)}>
                    {field.options?.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                ) : (
                  <>
                    <input value={value} list={field.suggestions ? `${listId}-${i}-${String(field.key)}` : undefined} onChange={(e) => set(e.target.value)} />
                    {field.suggestions && <datalist id={`${listId}-${i}-${String(field.key)}`}>
                      {field.suggestions.map((suggestion) => <option key={suggestion} value={suggestion} />)}
                    </datalist>}
                  </>
                )}
              </label>
            );
          })}
        </div>
      ))}
      {!items.length && (
        <div className="editor-empty">暂无记录，点击上方「添加」。</div>
      )}
    </section>
  );
}
const entry = (): Entry => ({ id: uid(), title: "", text: "" });
const textFields = [
  { key: "title" as const, label: "标题" },
  { key: "text" as const, label: "内容", type: "textarea" as const },
];
export interface EditorProps {
  historyAction?: HistoryAction;
  characters?: Character[];
  catalog?: CatalogEntry[];
  onCatalog?: (entries: CatalogEntry[]) => void;
  character: Character;
  version: Version;
  profile: Profile;
  hidden: boolean;
  page: Page;
  onPage: (p: Page) => void;
  onClose: () => void;
  onPatch: (patch: Overrides) => void;
  onInherit: (keys: (keyof Profile)[]) => void;
  onBasicInherit: (key: keyof Basics) => void;
  onSecret: (s: Partial<Secret>) => void;
  onCharacter: (
    p: Partial<Pick<Character, "name" | "collection" | "accent">>,
  ) => void;
  onVersion: (p: Partial<Pick<Version, "name" | "date" | "note">>) => void;
  onSelectVersion: (id: string) => void;
  onDuplicate: (name: string) => void;
  onDeleteVersion: () => void;
  onDeleteCharacter: () => void;
  onUpload: (f: File) => Promise<string>;
  onUndo: () => void;
  onRedo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  onSetDefault: () => void;
  onSetHidden: (hidden: boolean) => void;
}
export function Editor(props: EditorProps) {
  const drawer = useRef<HTMLElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const root = drawer.current;
    root?.querySelector<HTMLElement>("button")?.focus();
    return () => previous?.focus();
  }, []);
  const {
    character: c,
    version: v,
    profile: p,
    hidden,
    page,
    onPatch: patch,
  } = props;
  const [tab, setTab] = useState<
    "content" | "versions" | "secret" | "character" | "catalog"
  >("content");
  const [picker, setPicker] = useState<"skills" | "items" | null>(null);
  const [versionName, setVersionName] = useState("");
  const [section, setSection] = useState<Page>(page);
  const sectionKeys: Record<Page, (keyof Profile)[]> = {
    archive: [
      "basics",
      "portrait",
      "quote",
      "summary",
      "display",
      "appearance",
      "personality",
      "background",
      "events",
      "relationships",
      "customFields",
    ],
    skills: ["coc", "attributes", "skills"],
    collection: ["items", "gallery"],
    status: ["coc", "conditions", "statusNote", "body"],
  };
  function prose(
    key:
      | "quote"
      | "summary"
      | "personality"
      | "appearance"
      | "background"
      | "statusNote",
    label: string,
    rows = 4,
  ) {
    return (
      <label className="field">
        <span>
          {label}
          {hidden && (
            <small>
              {v.secret.overrides[key] !== undefined ? "独立内容" : "沿用表层"}
            </small>
          )}
        </span>
        <textarea
          rows={rows}
          value={p[key]}
          onChange={(e) => patch({ [key]: e.target.value })}
        />
      </label>
    );
  }
  function basics() {
    return (
      <div className="edit-basics">
        {(Object.keys(basicLabels) as (keyof Basics)[]).map((key) => (
          <label className="field" key={key}>
            <span>
              {basicLabels[key]}
              {hidden && (
                <button
                  className="inherit-link"
                  onClick={(e) => {
                    e.preventDefault();
                    props.onBasicInherit(key);
                  }}
                  disabled={v.secret.overrides.basics?.[key] === undefined}
                >
                  {v.secret.overrides.basics?.[key] !== undefined
                    ? "恢复沿用"
                    : "沿用表层"}
                </button>
              )}
            </span>
            <input
              value={p.basics[key] ?? ""}
              placeholder={key === "measurements" ? "胸围 / 腰围 / 臀围（cm）" : undefined}
              onChange={(e) => patch({ basics: { [key]: e.target.value } })}
            />
          </label>
        ))}
      </div>
    );
  }
  return (
    <div
      className="inline-editor-wrap"
    >
      <aside
        ref={drawer}
        className="editor-drawer inline-editor"
        role="region"
        aria-label="编辑角色档案"
      >
        <header className="drawer-header">
          <div>
            <small>EDIT YOUR CHARACTER</small>
            <h2>编辑档案</h2>
          </div>
          <button
            className="icon-button"
            onClick={props.onClose}
            aria-label="关闭编辑"
          >
            <X size={21} />
          </button>
        </header>
        <div className={"editing-context " + (hidden ? "secret-context" : "")}>
          <span>{c.name}</span>
          <i>/</i>
          <span>{v.name}</span>
          <b>{hidden ? "秘密档案" : "表层档案"}</b>
        </div>
        <nav className="editor-tabs">
          {(
            [
              { id: "content", name: "资料" },
              { id: "catalog", name: "条目库" },
              { id: "versions", name: "剧情版本" },
              { id: "secret", name: "秘密身份" },
              { id: "character", name: "角色" },
            ] as const
          ).map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={tab === t.id ? "active" : ""}
            >
              {t.name}
            </button>
          ))}
        </nav>
        <div className="editor-scroll">
          {tab === "catalog" && props.onCatalog && <CatalogPanel historyAction={props.historyAction} entries={props.catalog ?? []} onChange={props.onCatalog} profile={p} onPatch={patch} />}
          {tab === "content" && (
            <>
              <div className="editor-page-select">
                <label>
                  正在编辑
                  <select
                    value={section}
                    onChange={(e) => {
                      const p = e.target.value as Page;
                      setSection(p);
                      props.onPage(p);
                    }}
                  >
                    {pageMeta.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </label>
                {hidden && (
                  <button
                    className="text-button"
                    onClick={() => props.onInherit(sectionKeys[section])}
                  >
                    <RotateCcw size={13} />
                    本页恢复沿用
                  </button>
                )}
              </div>
              {hidden && (
                <p className="editor-hint">
                  未单独设置的内容沿用表层。输入后成为秘密档案的独立内容；空文字也会保留。
                </p>
              )}
              {section === "archive" && (
                <section className="edit-section">
                  <h3>角色照片</h3>
                  <ImageInput
                    value={p.portrait}
                    onChange={(portrait) => patch({ portrait })}
                    onUpload={props.onUpload}
                  />
                </section>
              )}
              {section === "archive" && (
                <>
                  {prose("quote", "角色引言", 3)}
                  {prose("summary", "一句话简介", 3)}
                </>
              )}
              {section === "archive" && basics()}
              {section === "archive" && (
                <>
                  <details className="field-visibility">
                    <summary>阅读显示设置</summary>
                    <label className="check-label">
                      <input
                        type="checkbox"
                        checked={p.display?.hideEmpty !== false}
                        onChange={(e) =>
                          patch({
                            display: {
                              hideEmpty: e.target.checked,
                              hiddenBasics: p.display?.hiddenBasics ?? [],
                            },
                          })
                        }
                      />{" "}
                      自动隐藏未填写字段
                    </label>
                    <p className="editor-help">
                      取消勾选的字段在书架身份卡和详细档案中隐藏，原有内容仍保留。已保存的证件独立管理，请在证件夹中编辑。
                    </p>
                    <div className="visibility-options">
                      {(Object.keys(basicLabels) as (keyof Basics)[]).map(
                        (key) => (
                          <label className="check-label" key={key}>
                            <input
                              type="checkbox"
                              aria-label={basicLabels[key] + "字段显示"}
                              checked={!p.display?.hiddenBasics.includes(key)}
                              onChange={(e) =>
                                patch({
                                  display: {
                                    hideEmpty: p.display?.hideEmpty ?? true,
                                    hiddenBasics: e.target.checked
                                      ? (p.display?.hiddenBasics ?? []).filter(
                                          (k) => k !== key,
                                        )
                                      : [
                                          ...(p.display?.hiddenBasics ?? []),
                                          key,
                                        ],
                                  },
                                })
                              }
                            />
                            显示{basicLabels[key]}
                          </label>
                        ),
                      )}
                    </div>
                  </details>
                  {prose("appearance", "外貌特征")}
                  {prose("personality", "性格")}
                  {prose("background", "背景故事", 7)}
                  <p className="editor-empty">经历标题可写“年份 · 事件名”；每个主题独立成条，长文可分段填写。</p>
                  <ListEditor
                    title="经历时间线"
                    items={p.events}
                    fields={textFields}
                    add={entry}
                    onChange={(events) => patch({ events })}
                    onUpload={props.onUpload}
                  />
                  <RelationshipEditor items={p.relationships} characters={props.characters ?? []} currentId={props.character.id} onChange={(relationships) => patch({ relationships })} />
                  <section className="edit-section" aria-label="档案主题模板">
                    <h3>快捷添加主题</h3>
                    <p>仅添加空白条目，已有同名主题不会重复创建。</p>
                    <div className="area-filter">
                      {["行为模式", "需求周期", "对伴侣的要求", "禁忌", "恢复力", "感知阈值"].map((title) => (
                        <button key={title} disabled={p.customFields.some((field) => field.title === title)}
                          onClick={() => patch({ customFields: [...p.customFields, { ...entry(), title }] })}>
                          添加{title}
                        </button>
                      ))}
                    </div>
                  </section>
                  <ListEditor
                    title="自定义字段"
                    items={p.customFields}
                    fields={[
                      { key: "title", label: "字段名称" },
                      { key: "text", label: "字段内容", type: "textarea" },
                    ]}
                    add={entry}
                    onChange={(customFields) => patch({ customFields })}
                    onUpload={props.onUpload}
                  />
                </>
              )}
              {section === "skills" && (
                <>
                  <CocEditor profile={p} onPatch={(coc) => patch({ coc })} />
                  <section className="edit-section">
                    <div className="edit-section-title">
                      <h3>自定义属性</h3>
                      <button
                        className="text-button"
                        onClick={() =>
                          patch({
                            attributes: [
                              ...p.attributes,
                              { id: uid(), name: "新属性", value: 50 },
                            ],
                          })
                        }
                      >
                        <Plus size={14} />
                        添加
                      </button>
                    </div>
                    {p.attributes.map((a) => (
                      <div className="attribute-editor" key={a.id}>
                        <input
                          aria-label="属性名称"
                          value={a.name}
                          onChange={(e) =>
                            patch({
                              attributes: p.attributes.map((i) =>
                                i.id === a.id
                                  ? { ...i, name: e.target.value }
                                  : i,
                              ),
                            })
                          }
                        />
                        <input
                          aria-label={a.name + "数值"}
                          type="number"
                          min="0"
                          max="9999"
                          value={a.value}
                          onChange={(e) =>
                            patch({
                              attributes: p.attributes.map((i) =>
                                i.id === a.id
                                  ? {
                                      ...i,
                                      value: Math.max(
                                        0,
                                        Math.min(
                                          9999,
                                          Math.trunc(Number(e.target.value)),
                                        ),
                                      ),
                                    }
                                  : i,
                              ),
                            })
                          }
                        />
                        <b>{a.value}</b>
                        <button
                          className="icon-button"
                          aria-label={"删除属性" + a.name}
                          onClick={() =>
                            patch({
                              attributes: p.attributes.filter(
                                (i) => i.id !== a.id,
                              ),
                            })
                          }
                        >
                          <X size={14} />
                        </button>
                      </div>
                    ))}
                  </section>
                  <ListEditor<Skill>
                    title="技能、法术与专长"
                    items={p.skills}
                    onAdd={() => setPicker("skills")}
                    fields={[
                      ...textFields,
                      { key: "rank", label: "评级 / 等级" },
                      { key: "kind", label: "能力类别", type: "select", options: [{ value: "skill", label: "技能" }, { value: "spell", label: "法术" }, { value: "specialty", label: "专长" }] },
                      { key: "common", label: "通用能力（阅读默认收起）", type: "checkbox" },
                      { key: "featured", label: "重点能力（始终显示）", type: "checkbox" },
                    ]}
                    add={() => ({ ...entry(), rank: "" })}
                    onChange={(skills) => patch({ skills })}
                    onUpload={props.onUpload}
                  />
                </>
              )}
              {section === "collection" && (
                <>
                  <ListEditor
                    title="物品"
                    items={p.items}
                    onAdd={() => setPicker("items")}
                    fields={[
                      { key: "image", label: "物品图片", type: "image" },
                      ...textFields,
                    ]}
                    add={() => ({ ...entry(), image: "" })}
                    onChange={(items) => patch({ items })}
                    onUpload={props.onUpload}
                  />
                  <ListEditor
                    title="照片与设定图片"
                    items={p.gallery}
                    fields={[
                      { key: "image", label: "图片", type: "image" },
                      { key: "caption", label: "图片说明" },
                    ]}
                    add={() => ({ id: uid(), image: "", caption: "" })}
                    onChange={(gallery) => patch({ gallery })}
                    onUpload={props.onUpload}
                  />
                </>
              )}
              {section === "status" && (
                <>
                  <h3>当前身体数值</h3>
                  <CocStateEditor
                    sheet={p.coc ?? blankCoc()}
                    onPatch={(coc) => patch({ coc })}
                  />
                  {prose("statusNote", "状态记录备注", 3)}
                  <BodyImport body={p.body} hidden={hidden} onUpload={props.onUpload}
                    onChange={(body) => patch({ body })}
                    onInherit={hidden && v.secret.overrides.body !== undefined ? () => props.onInherit(["body"]) : undefined} />
                  <p className="editor-empty">标题建议“系统名 · 状态或功能名”。正文可按参数、功能状态、历史变化分段填写；部位支持自由输入，例如皮肤、感官、恢复力。</p>
                  <ListEditor
                    title="身体状态"
                    items={p.conditions}
                    fields={[
                      ...textFields,
                      {
                        key: "area",
                        label: "身体部位",
                        suggestions: [
                          "全身",
                          "头部",
                          "颈部",
                          "躯干",
                          "胸部",
                          "腹部",
                          "背部",
                          "左手",
                          "右手",
                          "左脚",
                          "右脚",
                          "左臂",
                          "右臂",
                          "左腿",
                          "右腿",
                          "皮肤",
                          "感官",
                          "神经系统",
                          "呼吸系统",
                          "循环系统",
                          "消化系统",
                          "免疫系统",
                          "恢复力",
                        ],
                      },
                      {
                        key: "severity",
                        label: "状态级别",
                        type: "select",
                        options: [
                          { value: "stable", label: "状态稳定" },
                          { value: "notice", label: "需要关注" },
                          { value: "danger", label: "重点观察" },
                        ],
                      },
                    ]}
                    add={() => ({
                      ...entry(),
                      area: "全身",
                      severity: "stable" as const,
                    })}
                    onChange={(conditions) => patch({ conditions })}
                    onUpload={props.onUpload}
                  />
                </>
              )}
            </>
          )}
          {tab === "versions" && (
            <>
              <div className="panel-intro">
                <Copy size={24} strokeWidth={1.2} />
                <h3>每一段人生，都值得保留。</h3>
                <p>
                  版本包含完整资料、图片引用与秘密身份。复制后独立编辑，不影响原版本。
                </p>
              </div>
              <div className="version-editor-list">
                {c.versions.map((item) => (
                  <button
                    key={item.id}
                    className={item.id === v.id ? "active" : ""}
                    onClick={() => props.onSelectVersion(item.id)}
                  >
                    <div>
                      <strong>
                        {item.name}
                        {defaultVersion(c).id === item.id ? " · 默认" : ""}
                      </strong>
                      <small>{item.date || "未填写剧情时间"}</small>
                    </div>
                    {item.id === v.id && <Check size={16} />}
                  </button>
                ))}
              </div>
              <button
                className="button small"
                disabled={defaultVersion(c).id === v.id}
                onClick={props.onSetDefault}
              >
                {defaultVersion(c).id === v.id
                  ? "当前为默认展示版本"
                  : "设为默认展示版本"}
              </button>
              <p className="editor-hint">
                角色书架显示默认版本的表层身份卡，打开角色时也从此版本开始。
              </p>
              <label className="field">
                <span>当前版本名称</span>
                <input
                  value={v.name}
                  onChange={(e) => props.onVersion({ name: e.target.value })}
                />
              </label>
              <label className="field">
                <span>剧情时间</span>
                <input
                  placeholder="例如：第二章 · 雨夜之后"
                  value={v.date}
                  onChange={(e) => props.onVersion({ date: e.target.value })}
                />
              </label>
              <label className="field">
                <span>版本备注</span>
                <textarea
                  rows={3}
                  value={v.note}
                  onChange={(e) => props.onVersion({ note: e.target.value })}
                />
              </label>
              <section className="edit-section">
                <h3>从当前版本复制</h3>
                <div className="inline-form">
                  <input
                    placeholder="新版本名称"
                    value={versionName}
                    onChange={(e) => setVersionName(e.target.value)}
                  />
                  <button
                    className="button primary small"
                    disabled={!versionName.trim()}
                    onClick={() => {
                      props.onDuplicate(versionName.trim());
                      setVersionName("");
                    }}
                  >
                    <Copy size={14} />
                    复制
                  </button>
                </div>
              </section>
              <button
                className="button danger-outline"
                disabled={c.versions.length < 2}
                onClick={props.onDeleteVersion}
              >
                <Trash2 size={14} />
                删除当前版本
              </button>
              <p className="editor-hint">每个角色至少保留一个剧情版本。</p>
            </>
          )}
          {tab === "secret" && (
            <>
              <div className="panel-intro">
                <Shield size={25} strokeWidth={1.2} />
                <h3>名字背后，还有另一个故事。</h3>
                <p>
                  秘密身份属于当前剧情版本。启用后，可以切换整份档案的内容与视觉风格。
                </p>
              </div>
              <label className="toggle-row">
                <div>
                  <strong>启用秘密档案</strong>
                  <small>关闭后保留已填写的秘密内容</small>
                </div>
                <input
                  type="checkbox"
                  checked={v.secret.enabled}
                  onChange={(e) => {
                    props.onSecret({ enabled: e.target.checked });
                    if (!e.target.checked) props.onSetHidden(false);
                  }}
                />
              </label>
              {v.secret.enabled && (
                <>
                  <label className="field">
                    <span>秘密档案名称</span>
                    <input
                      value={v.secret.label}
                      onChange={(e) =>
                        props.onSecret({ label: e.target.value })
                      }
                    />
                  </label>
                  <label className="field">
                    <span>切换触发元素</span>
                    <select
                      value={v.secret.trigger}
                      onChange={(e) =>
                        props.onSecret({
                          trigger: e.target.value as Secret["trigger"],
                        })
                      }
                    >
                      <option value="portrait">点击角色照片</option>
                      <option value="name">点击角色姓名</option>
                      <option value="emblem">点击角色徽记</option>
                    </select>
                  </label>
                  <section className="edit-section" aria-label="秘密身份照片">
                    <h3>秘密身份照片</h3>
                    <p className="editor-help">切换身份时，详细档案使用这张照片。未单独设置时沿用公开照片；移除后秘密身份不显示照片。已保存证件的照片在证件夹中独立修改。</p>
                    <ImageInput value={v.secret.overrides.portrait ?? v.profile.portrait} onChange={(portrait) => props.onSecret({ overrides: { ...v.secret.overrides, portrait } })} onUpload={props.onUpload}/>
                    {v.secret.overrides.portrait !== undefined && <button className="text-button" onClick={() => props.onInherit(['portrait'])}>照片恢复沿用公开档案</button>}
                  </section>
                  <section className="edit-section">
                    <h3>隐藏档案样式</h3>
                    <div className="theme-options">
                      {(
                        [
                          {
                            id: "prison",
                            name: "监狱档案",
                            desc: "灰白纸面 · 编号 · 收押印章",
                          },
                          {
                            id: "noir",
                            name: "暗色密卷",
                            desc: "炭黑底色 · 暗金线条",
                          },
                          {
                            id: "clinical",
                            name: "研究记录",
                            desc: "冷白纸面 · 蓝色记录",
                          },
                        ] as const
                      ).map((t) => (
                        <button
                          key={t.id}
                          className={
                            "theme-option " +
                            t.id +
                            (v.secret.theme === t.id ? " active" : "")
                          }
                          onClick={() => props.onSecret({ theme: t.id })}
                        >
                          <div className="theme-sample">
                            <i />
                            <i />
                            <i />
                          </div>
                          <strong>{t.name}</strong>
                          <small>{t.desc}</small>
                          {v.secret.theme === t.id && <Check size={14} />}
                        </button>
                      ))}
                    </div>
                  </section>
                  <button
                    className="button primary"
                    onClick={() => {
                      props.onSetHidden(!hidden);
                      setTab("content");
                    }}
                  >
                    <Eye size={15} />
                    {hidden ? "切回表层并编辑" : "进入秘密档案并编辑"}
                  </button>
                  <p className="editor-hint">
                    进入秘密档案后编辑各页，修改内容会单独保存；没有修改的内容继续沿用表层。
                  </p>
                </>
              )}
            </>
          )}
          {tab === "character" && (
            <>
              <div className="panel-intro">
                <Settings2 size={24} strokeWidth={1.2} />
                <h3>整理这一本设定册</h3>
                <p>
                  书架名称和系列用于管理角色，不会替换各剧情版本内的身份姓名。
                </p>
              </div>
              <label className="field">
                <span>角色管理名</span>
                <input
                  value={c.name}
                  onChange={(e) => props.onCharacter({ name: e.target.value })}
                />
              </label>
              <label className="field">
                <span>所属系列 / 世界观</span>
                <input
                  value={c.collection}
                  onChange={(e) =>
                    props.onCharacter({ collection: e.target.value })
                  }
                />
              </label>
              <label className="field">
                <span>角色主题色</span>
                <div className="color-input">
                  <input
                    type="color"
                    value={
                      /^#[0-9a-f]{6}$/i.test(c.accent) ? c.accent : "#53695c"
                    }
                    onChange={(e) =>
                      props.onCharacter({ accent: e.target.value })
                    }
                  />
                  <span>{c.accent}</span>
                </div>
              </label>
              <div className="danger-zone">
                <h3>删除角色</h3>
                <p>将移除该角色及其全部剧情版本。建议先在资料库中导出备份。</p>
                <button
                  className="button danger-outline"
                  onClick={props.onDeleteCharacter}
                >
                  <Trash2 size={15} />
                  删除这个角色
                </button>
              </div>
            </>
          )}
        </div>
        <footer className="drawer-footer">
          <span>
            <Check size={13} />
            更改自动保存
          </span>
          <button
            className="icon-button"
            aria-label="撤销修改"
            disabled={!props.canUndo}
            onClick={props.onUndo}
          >
            <Undo2 size={16} />
          </button>
          <button
            className="icon-button"
            aria-label="重做修改"
            disabled={!props.canRedo}
            onClick={props.onRedo}
          >
            <Redo2 size={16} />
          </button>
          <button className="button primary small" onClick={props.onClose}>
            完成编辑
          </button>
        </footer>
      </aside>
      {picker && <CatalogPicker mode={picker} catalog={props.catalog ?? []} profile={p} onPatch={patch} onClose={() => setPicker(null)} />}
    </div>
  );
}
