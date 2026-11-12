import { useEffect, useState, type FormEvent } from "react";
import { ArrowLeft, Globe } from "lucide-react";
import { Modal } from "./Modal";
import {
  archiveBindings,
  bindArchiveParent,
  bindArchiveRoot,
  canOpenLocalFiles,
  openArchive,
  pickArchiveFile,
  pickArchiveRoot,
  probeArchive,
  readArchive,
  relativeToRoot,
  type ArchiveProbe,
} from "../archive-machine";
import {
  DESKTOP_ARCHIVE_LIMIT,
  WEB_ARCHIVE_LIMIT,
  createArchiveRef,
  createArchiveRoot,
  deleteArchiveRef,
  readingParagraphs,
  reviseArchive,
  withArchive,
  withRoot,
} from "../external-archives";
import type { ArchiveRoot, Character, ExternalArchiveRef, Library, Visibility, World } from "../model";
import {
  archivesInScope,
  assignCharacterWorld,
  charactersInWorld,
  createWorld,
  deleteWorld,
  looseCharacters,
  versionSummary,
  withWorld,
  withWorldLink,
  worldLabelMap,
  worldMissing,
  worldsInScope,
  type WorldScope,
} from "../worlds";

export interface WorldOverviewProps {
  library: Library;
  scope: WorldScope;
  onScope: (scope: WorldScope) => void;
  openWorldId: string | null;
  onOpenWorld: (id: string) => void;
  onBack: () => void;
  onChange: (library: Library) => void;
  onEnterCharacter: (character: Character) => void;
  canUndo: boolean;
  canRedo: boolean;
  undo: () => void;
  redo: () => void;
}

const desktop = canOpenLocalFiles();

function rootCaption(roots: ArchiveRoot[], id: string): string {
  const root = roots.find((item) => item.id === id);
  if (!root) return "根目录已缺失，可以重新选择";
  const key = root.label.trim();
  const shared = roots.filter((item) => item.label.trim() === key).length > 1;
  return shared ? `${key} · ${root.id.slice(0, 8)}` : key;
}

export function WorldOverview(props: WorldOverviewProps) {
  const { library, scope, openWorldId } = props;
  const labels = worldLabelMap(library.worlds ?? []);
  const visible = worldsInScope(library, scope);
  const opened = openWorldId ? (library.worlds ?? []).find((world) => world.id === openWorldId) : undefined;
  const hiddenHere = !!opened && scope === "public" && opened.visibility !== "public";
  const [pending, setPending] = useState<
    | { kind: "world"; id: string; label: string }
    | { kind: "archive"; id: string; title: string }
    | null
  >(null);
  const [notice, setNotice] = useState("");
  function askWorld(id: string) {
    setPending({ kind: "world", id, label: labels.get(id) ?? "这个世界" });
  }
  function askArchive(ref: ExternalArchiveRef) {
    setPending({ kind: "archive", id: ref.id, title: ref.title });
  }
  function commitDelete() {
    if (!pending || scope !== "owner") return;
    try {
      if (pending.kind === "world") {
        props.onChange(deleteWorld(library, pending.id));
        setNotice("已删除世界。角色和分组都保留，指向它的引用已卸下，档案引用改为未编入。原文件没有删除。");
      } else {
        props.onChange(deleteArchiveRef(library, pending.id));
        setNotice("已删除档案引用。原文件没有删除。不再使用的本机路径映射会清掉，可以用撤销恢复。");
      }
      setPending(null);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "没有删除");
      setPending(null);
    }
  }
  return (
    <section className="world-overview" aria-label="世界概览">
      <div className="shelf-heading">
        <div>
          <span className="eyebrow">WORLDS</span>
          <h1>{opened && !hiddenHere ? labels.get(opened.id) : "世界概览"}</h1>
          <p>角色书架保持不变。世界要单独进入，不会按分组名称自动生成或合并。</p>
        </div>
        <div className="coc-edit-actions">
          <button className="button small" type="button" disabled={!props.canUndo} onClick={props.undo}>撤销</button>
          <button className="button small" type="button" disabled={!props.canRedo} onClick={props.redo}>重做</button>
          <button className="button small" type="button" aria-pressed={scope === "public"} onClick={() => props.onScope(scope === "public" ? "owner" : "public")}>
            {scope === "public" ? "返回自己的视图" : "公开范围"}
          </button>
        </div>
      </div>
      {scope === "public" && <p className="world-note" role="note">公开范围只显示标为公开的世界和档案标题，不显示路径、附注或仅自己可见的条目。</p>}
      {notice && <p className="world-note" role="status">{notice}</p>}
      {openWorldId && (!opened || hiddenHere) ? (
        <div className="world-empty">
          <p>这个世界不在当前范围内。</p>
          <button className="button" type="button" onClick={props.onBack}>返回世界列表</button>
        </div>
      ) : opened ? (
        <WorldDetail {...props} world={opened} labels={labels} onDeleteWorld={askWorld} onDeleteArchive={askArchive} />
      ) : (
        <WorldIndex {...props} visible={visible} labels={labels} onDeleteWorld={askWorld} onDeleteArchive={askArchive} />
      )}
      {pending && scope === "owner" && (
        <Modal title={pending.kind === "world" ? "删除这个世界？" : "删除这条档案引用？"} onClose={() => setPending(null)}>
          <p className="confirm-message">
            {pending.kind === "world"
              ? `删除「${pending.label}」后，角色仍留在书架，分组文字不变，只是不再编入这个世界。其他世界指向它的引用会卸下。归在这里的档案引用改为未编入，不会删除原文件。这一步可以撤销。`
              : `删除档案引用「${pending.title}」只会去掉资料库里的这条引用，不会删除 Obsidian 或本机上的原文件，也不会改动文件内容。若这个根目录不再被任何引用使用，这台电脑上的路径映射会清掉。可以撤销。`}
          </p>
          <div className="modal-actions">
            <button className="button" type="button" onClick={() => setPending(null)}>取消</button>
            <button className="button danger-button" type="button" onClick={commitDelete}>确认删除</button>
          </div>
        </Modal>
      )}
    </section>
  );
}

function WorldIndex({ library, scope, onOpenWorld, onChange, onEnterCharacter, visible, labels, onDeleteWorld, onDeleteArchive }: WorldOverviewProps & {
  visible: World[];
  labels: Map<string, string>;
  onDeleteWorld: (id: string) => void;
  onDeleteArchive: (ref: ExternalArchiveRef) => void;
}) {
  const [name, setName] = useState("");
  const [summary, setSummary] = useState("");
  const [visibility, setVisibility] = useState<Visibility>("private");
  const [creating, setCreating] = useState(false);
  const [message, setMessage] = useState("");
  const loose = scope === "owner" ? looseCharacters(library) : library.characters.filter((character) => !character.worldId);
  const privateCount = (library.worlds ?? []).filter((world) => world.visibility === "private").length;
  function saveWorld(event: FormEvent) {
    event.preventDefault();
    try {
      onChange(withWorld(library, createWorld(name, summary, visibility)));
      setName(""); setSummary(""); setVisibility("private"); setCreating(false); setMessage("已保存世界");
    } catch (error) { setMessage(error instanceof Error ? error.message : "没有保存"); }
  }
  return (
    <>
      <p className="world-note">分组仍在左侧，按原来的文字显示。这里的世界要单独建立；名字相同也不会并成一个。条目库里的世界仍是自由文本，不会因为同名出现在这里。</p>
      {scope === "owner" ? (
        <p className="world-count">{visible.length} 个世界{privateCount ? `，其中 ${privateCount} 个仅自己可见` : ""}。未编入 {loose.length} 位角色。</p>
      ) : (
        <p className="world-count">{visible.length} 个公开世界。</p>
      )}
      {scope === "owner" && (
        creating ? (
          <form className="world-form" onSubmit={saveWorld}>
            <label>世界名称<input aria-label="世界名称" value={name} onChange={(event) => setName(event.target.value)} /></label>
            <label>简介<textarea aria-label="世界简介" value={summary} onChange={(event) => setSummary(event.target.value)} rows={5} /></label>
            <label>公开范围
              <select aria-label="世界公开范围" value={visibility} onChange={(event) => setVisibility(event.target.value as Visibility)}>
                <option value="private">仅自己可见</option>
                <option value="public">公开范围内可见</option>
              </select>
            </label>
            <div className="coc-edit-actions">
              <button className="button primary" type="submit">保存世界</button>
              <button className="button" type="button" onClick={() => setCreating(false)}>取消</button>
            </div>
          </form>
        ) : <button className="button primary" type="button" onClick={() => setCreating(true)}><Globe size={16} />新建世界</button>
      )}
      {message && <p role="status">{message}</p>}
      {visible.length === 0 ? (
        <div className="world-empty">
          <h2>{scope === "public" ? "公开范围里还没有世界" : "还没有世界"}</h2>
          <p>{scope === "public" ? "仅自己可见的世界不会出现在这里。" : "还没有世界。角色书架上的分组会原样保留，不会按分组名称自动生成世界。"}</p>
        </div>
      ) : (
        <ul className="world-list" aria-label="世界列表">
          {visible.map((world) => (
            <li key={world.id}>
              <button className="button" type="button" onClick={() => onOpenWorld(world.id)}>{labels.get(world.id)}</button>
              <span>{world.visibility === "public" ? "公开" : "仅自己可见"}</span>
              <span>{charactersInWorld(library, world.id).length} 位角色</span>
              {scope === "owner" && <button className="button small" type="button" aria-label={`删除世界「${labels.get(world.id)}」`} onClick={() => onDeleteWorld(world.id)}>删除</button>}
            </li>
          ))}
        </ul>
      )}
      <ArchiveSection
        library={library}
        scope={scope}
        archives={archivesInScope(library, scope).filter((ref) => !ref.worldId || !(library.worlds ?? []).some((world) => world.id === ref.worldId))}
        onChange={onChange}
        onDeleteArchive={scope === "owner" ? onDeleteArchive : undefined}
      />
      <section aria-label="未编入世界">
        <h2>未编入世界</h2>
        {loose.length === 0 ? <p>当前范围内没有未编入世界的角色。</p> : (
          <ul className="world-people">
            {loose.map((character) => (
              <li key={character.id}>
                <button className="button" type="button" onClick={() => onEnterCharacter(character)}>打开档案：{character.name}</button>
                <span>分组：{character.collection || "未分类"}</span>
                {scope === "owner" && worldMissing(library, character) && <span>原世界已缺失，可以改指到现有世界</span>}
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}

function WorldDetail(props: WorldOverviewProps & { world: World; labels: Map<string, string>; onDeleteWorld: (id: string) => void; onDeleteArchive: (ref: ExternalArchiveRef) => void }) {
  const { library, scope, world, labels, onChange, onEnterCharacter, onBack } = props;
  const people = charactersInWorld(library, world.id);
  const archives = archivesInScope(library, scope, world.id);
  const others = worldsInScope(library, scope).filter((item) => item.id !== world.id);
  const [target, setTarget] = useState("");
  const [candidate, setCandidate] = useState("");
  const [message, setMessage] = useState("");
  const paragraphs = readingParagraphs(world.summary);
  function assign() {
    if (!candidate) return;
    try { onChange(assignCharacterWorld(library, candidate, world.id)); setCandidate(""); setMessage("已编入世界"); }
    catch (error) { setMessage(error instanceof Error ? error.message : "没有保存"); }
  }
  function linkWorld() {
    if (!target) return;
    try { onChange(withWorldLink(library, world.id, target)); setTarget(""); setMessage("已添加世界引用"); }
    catch (error) { setMessage(error instanceof Error ? error.message : "没有保存"); }
  }
  const visibleLinks = scope === "public" ? world.links.filter((link) => labels.has(link.targetWorldId) && others.concat(world).some((item) => item.id === link.targetWorldId && item.visibility === "public")) : world.links;
  return (
    <div className="world-detail">
      <button className="back-button" type="button" onClick={onBack}><ArrowLeft size={16} />返回世界列表</button>
      {scope === "owner" && <button className="button small danger-outline" type="button" aria-label={`删除此世界「${labels.get(world.id)}」`} onClick={() => props.onDeleteWorld(world.id)}>删除此世界</button>}
      <article className="world-summary" aria-label="世界简介">
        {paragraphs.length ? paragraphs.map((part, index) => <p key={index}>{part}</p>) : <p>还没有简介。</p>}
      </article>
      {people.length === 0 && archives.length === 0 ? (
        <p className="world-empty">这个世界还没有编入角色，也没有外部档案。</p>
      ) : null}
      <section aria-label="世界中的角色">
        <h2>角色</h2>
        {scope === "owner" && <p className="world-note">不会修改分组，也不会把同名分组合并成这个世界。</p>}
        {scope === "owner" && (
          <div className="world-form inline">
            <label>编入角色
              <select aria-label="选择要编入的角色" value={candidate} onChange={(event) => setCandidate(event.target.value)}>
                <option value="">选择角色</option>
                {library.characters.filter((character) => character.worldId !== world.id).map((character) => (
                  <option key={character.id} value={character.id}>{character.name} · 分组 {character.collection || "未分类"}</option>
                ))}
              </select>
            </label>
            <button className="button" type="button" onClick={assign}>编入此世界</button>
          </div>
        )}
        <ul className="world-people">
          {people.map((character) => (
            <li key={character.id}>
              <button className="button" type="button" onClick={() => onEnterCharacter(character)}>打开档案：{character.name}</button>
              <span>分组：{character.collection || "未分类"}</span>
              <span>{versionSummary(character)}</span>
              {scope === "owner" && <button className="button small" type="button" onClick={() => onChange(assignCharacterWorld(library, character.id, null))}>移出世界</button>}
            </li>
          ))}
        </ul>
      </section>
      <section aria-label="相关世界">
        <h2>相关世界</h2>
        {scope === "owner" && (
          <div className="world-form inline">
            <label>引用另一个世界
              <select aria-label="引用另一个世界" value={target} onChange={(event) => setTarget(event.target.value)}>
                <option value="">选择世界</option>
                {others.map((item) => <option key={item.id} value={item.id}>{labels.get(item.id)}</option>)}
              </select>
            </label>
            <button className="button" type="button" onClick={linkWorld}>添加世界引用</button>
          </div>
        )}
        <ul>
          {visibleLinks.map((link) => {
            const known = (library.worlds ?? []).some((item) => item.id === link.targetWorldId);
            return <li key={link.id}>{known && labels.has(link.targetWorldId) ? labels.get(link.targetWorldId) : "引用的世界已不在资料库中"}</li>;
          })}
        </ul>
      </section>
      <ArchiveSection library={library} scope={scope} worldId={world.id} archives={archives} onChange={onChange} onDeleteArchive={scope === "owner" ? props.onDeleteArchive : undefined} />
      {message && <p role="status">{message}</p>}
    </div>
  );
}

function ArchiveSection({ library, scope, worldId, archives, onChange, onDeleteArchive }: {
  library: Library;
  scope: WorldScope;
  worldId?: string;
  archives: ExternalArchiveRef[];
  onChange: (library: Library) => void;
  onDeleteArchive?: (ref: ExternalArchiveRef) => void;
}) {
  const roots = library.archiveRoots ?? [];
  const [title, setTitle] = useState("");
  const [rootChoice, setRootChoice] = useState("");
  const [rootLabel, setRootLabel] = useState("");
  const [relativePath, setRelativePath] = useState("");
  const [note, setNote] = useState("");
  const [visibility, setVisibility] = useState<Visibility>("private");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [pendingFile, setPendingFile] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [statuses, setStatuses] = useState<Record<string, ArchiveProbe>>({});
  const [bodies, setBodies] = useState<Record<string, { paragraphs: string[]; truncated: boolean }>>({});
  const [bindings, setBindings] = useState<Record<string, string>>({});
  useEffect(() => {
    if (!desktop || scope !== "owner") return;
    let live = true;
    archiveBindings().then((rows) => { if (live) setBindings(Object.fromEntries(rows.map((row) => [row.rootId, row.absolutePath]))); }).catch(() => {});
    for (const ref of archives) {
      probeArchive(ref.rootId, ref.relativePath).then((probe) => { if (live) setStatuses((current) => ({ ...current, [ref.id]: probe })); }).catch(() => {});
    }
    return () => { live = false; };
  }, [archives, scope]);
  function reset() {
    setTitle(""); setRootChoice(""); setRootLabel(""); setRelativePath(""); setNote(""); setVisibility("private"); setEditingId(null); setPendingFile(null);
  }
  async function chooseFile() {
    const picked = await pickArchiveFile();
    if (!picked) return;
    setPendingFile(picked.absolutePath);
    setTitle((current) => current || picked.name.replace(/\.[^.]+$/, "") || picked.name);
    setMessage("已选择文件。确认根目录后才会保存引用，正文不会写入资料库。");
  }
  async function relocateRoot(rootId: string) {
    const picked = await pickArchiveRoot();
    if (!picked) return;
    try {
      await bindArchiveRoot(rootId, picked.absolutePath);
      setBindings((current) => ({ ...current, [rootId]: picked.absolutePath }));
      setMessage("已重新定位根目录。相对路径没有改，文件若已移动仍需再选。");
    } catch (error) { setMessage(error instanceof Error ? error.message : "没有保存"); }
  }
  async function save(event: FormEvent) {
    event.preventDefault();
    try {
      let next = library;
      let rootId = rootChoice;
      let relative = relativePath.trim();
      if (pendingFile && desktop) {
        if (!rootId) {
          const root = createArchiveRoot(rootLabel);
          rootId = root.id;
          relative = await bindArchiveParent(root.id, pendingFile);
          next = withRoot(next, root);
        } else relative = await relativeToRoot(rootId, pendingFile);
      } else if (!rootId) {
        const root = createArchiveRoot(rootLabel);
        rootId = root.id;
        next = withRoot(next, root);
      }
      const assigned = worldId ?? null;
      if (editingId) next = reviseArchive(next, editingId, { title, rootId, relativePath: relative, note, visibility, worldId: assigned });
      else next = withArchive(next, createArchiveRef({ title, rootId, relativePath: relative, note, visibility, ...(assigned ? { worldId: assigned } : {}) }));
      onChange(next);
      reset();
      setMessage("已保存档案引用");
    } catch (error) { setMessage(error instanceof Error ? error.message : "没有保存"); }
  }
  async function read(ref: ExternalArchiveRef) {
    try {
      const result = await readArchive(ref.rootId, ref.relativePath);
      setBodies((current) => ({ ...current, [ref.id]: { paragraphs: readingParagraphs(result.text), truncated: result.truncated } }));
    } catch (error) { setMessage(error instanceof Error ? error.message : "无法阅读"); }
  }
  return (
    <section aria-label="外部档案">
      <h2>外部档案</h2>
      <p className="world-note" role="note">{desktop ? DESKTOP_ARCHIVE_LIMIT : WEB_ARCHIVE_LIMIT}</p>
      {scope === "owner" && (
        <form className="world-form" aria-label={editingId ? "重新选择外部档案" : "添加外部档案"} onSubmit={save}>
          <label>标题<input aria-label="档案标题" value={title} onChange={(event) => setTitle(event.target.value)} required /></label>
          <label>已有根目录
            <select aria-label="已有根目录" value={rootChoice} onChange={(event) => setRootChoice(event.target.value)}>
              <option value="">新建根目录</option>
              {roots.map((root) => <option key={root.id} value={root.id}>{rootCaption(roots, root.id)}</option>)}
            </select>
          </label>
          {rootChoice === "" && <label>根目录名称<input aria-label="根目录名称" value={rootLabel} onChange={(event) => setRootLabel(event.target.value)} required /></label>}
          <label>相对路径<input aria-label="相对路径" value={relativePath} onChange={(event) => setRelativePath(event.target.value)} placeholder="notes/a.md" required={!pendingFile} /></label>
          <label>来源附注<textarea aria-label="来源附注" value={note} onChange={(event) => setNote(event.target.value)} rows={3} /></label>
          <label>公开范围
            <select aria-label="档案公开范围" value={visibility} onChange={(event) => setVisibility(event.target.value as Visibility)}>
              <option value="private">仅自己可见</option>
              <option value="public">公开范围内可见标题</option>
            </select>
          </label>
          {desktop && <button className="button" type="button" onClick={() => void chooseFile()}>选择本机文件</button>}
          <div className="coc-edit-actions">
            <button className="button primary" type="submit">{editingId ? "保存新的位置" : "保存档案引用"}</button>
            {editingId && <button className="button" type="button" onClick={reset}>取消</button>}
          </div>
        </form>
      )}
      {message && <p role="status">{message}</p>}
      <ul className="archive-list">
        {archives.map((ref) => {
          const body = bodies[ref.id];
          const status = statuses[ref.id];
          return (
            <li key={ref.id} className="archive-card">
              <h3>{ref.title}</h3>
              {scope === "public" ? <p>公开条目。路径不在此视图显示。</p> : (
                <div className="archive-split">
                  <article aria-label="档案正文">
                    {body ? body.paragraphs.map((part, index) => <p key={index}>{part}</p>) : <p>正文留在原文件里，资料库不保存副本。</p>}
                    <button className="button small" type="button" disabled={!desktop} onClick={() => void read(ref)}>阅读正文</button>
                  </article>
                  <section aria-label="来源维护">
                    <p>根目录：{rootCaption(roots, ref.rootId)}</p>
                    <p>相对路径：{ref.relativePath}</p>
                    <p>状态：{desktop ? (status?.detail ?? "尚未核对") : "网页预览不能核对本机文件"}</p>
                    {desktop && <p>本机位置：{bindings[ref.rootId] || "尚未在这台电脑定位"}</p>}
                    {body?.truncated && <p>只读了前 256 KB，其余仍在原文件。</p>}
                    {ref.note && <p>附注：{ref.note}</p>}
                    <button className="button small" type="button" disabled={!desktop} onClick={() => void openArchive(ref.rootId, ref.relativePath).catch((error) => setMessage(error instanceof Error ? error.message : "无法打开"))}>打开原文</button>
                    <button className="button small" type="button" onClick={() => { setEditingId(ref.id); setTitle(ref.title); setRootChoice(ref.rootId); setRelativePath(ref.relativePath); setNote(ref.note); setVisibility(ref.visibility); }}>重新选择</button>
                    {onDeleteArchive && <button className="button small danger-outline" type="button" aria-label={`删除引用「${ref.title}」`} onClick={() => onDeleteArchive(ref)}>删除引用</button>}
                    {desktop && <button className="button small" type="button" onClick={() => void relocateRoot(ref.rootId)}>重新定位根目录</button>}
                  </section>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
