import { IdentityDisplay } from "./components/IdentityDisplay";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import {
  ContactRound,
  Copy,
  Undo2,
  Redo2,
  ArrowLeft,
  BookOpen,
  Check,
  CheckCheck,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  Clock3,
  HardDrive,
  Info,
  LibraryBig,
  LoaderCircle,
  LockKeyhole,
  PencilLine,
  Plus,
  Settings2,
  ShieldCheck,
  Star,
  X,
} from "lucide-react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import {
  createCharacter,
  defaultVersion,
  duplicateVersion,
  effectiveProfile,
  now,
  pageMeta,
  type Basics,
  type Character,
  type Library,
  type Overrides,
  type Page,
  type Profile,
  type Secret,
  type Version,
  assetRefs,
} from "./model";
import { seedLibrary } from "./seed";
import {
  desktop,
  downloadBytes,
  exportBackup,
  libraryLocation,
  loadLibrary,
  parseBackup,
  putImage,
  restoreBackup,
  relocateLibrary,
  readAsset,
  recordBackupExport,
  prepareBackupRecovery,
  preserveOriginal,
  readRawLibrary,
  appendLibraryImport,
} from "./storage";
import { mergeCoc, blankCoc, type CocPatch } from "./coc";
import { useLibraryHistory } from "./useLibraryHistory";
import { BookPages, IdentityCard } from "./components/BookPages";
import { Editor } from "./components/Editor";
import { CatalogPanel } from "./components/CatalogPanel";
import { RecoveryPanel } from "./components/RecoveryPanel";
import type { SearchHit } from "./search";
import { ReadingView } from "./components/ReadingView";
import { VersionCompare } from "./components/VersionCompare";
import { Portrait } from "./components/Portrait";
import { Modal, type Confirm } from "./views/Modal";
import { ShelfView } from "./views/ShelfView";
import { LibrarySettingsModal } from "./views/LibrarySettingsModal";
import { useAppKeyboard } from "./hooks/useAppKeyboard";
import { queueSave, useAutosave } from "./hooks/useAutosave";
export default function App() {
  const { library, setLibrary, undo, redo, canUndo, canRedo } =
    useLibraryHistory();
  const [loadError, setLoadError] = useState("");
  const [activeId, setActiveId] = useState(""),
    [versionId, setVersionId] = useState(""),
    [page, setPage] = useState<Page>("archive"),
    [hidden, setHidden] = useState(false),
    [catalogOpen, setCatalogOpen] = useState(false),
    [shelf, setShelf] = useState(true),
    [editing, setEditing] = useState(false);
  const [filter, setFilter] = useState("全部角色"),
    [search, setSearch] = useState(""),
    [sort, setSort] = useState("recent"),
    [layout, setLayout] = useState<"grid" | "list">("grid");
  const [modal, setModal] = useState<
      "library" | "new" | "identity" | "copyVersion" | null
    >(null),
    [confirm, setConfirm] = useState<Confirm | null>(null),
    [preview, setPreview] = useState<{ ref: string; caption: string } | null>(
      null,
    );
  const [copyName, setCopyName] = useState("");
  const [backupRevision, setBackupRevision] = useState(0);
  const [comparing, setComparing] = useState(false);
  const [relationTrail, setRelationTrail] = useState<{ characterId: string; versionId: string; page: Page; hidden: boolean }[]>([]);
  const [searchHit, setSearchHit] = useState<SearchHit | null>(null);
  const [newName, setNewName] = useState(""),
    [newCollection, setNewCollection] = useState(""),
    [busy, setBusy] = useState(false),
    [toast, setToast] = useState(""),
    [location, setLocation] = useState("");
  const latest = useRef<Library | null>(null),
    toastTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  latest.current = library;
  const notify = useCallback((text: string) => {
    setToast(text);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(""), 4200);
  }, []);
  useEffect(() => {
    let live = true;
    loadLibrary()
      .then((value) => {
        if (live) setLibrary(value ?? seedLibrary());
      })
      .catch((error) => {
        if (live) setLoadError(String(error));
      });
    libraryLocation()
      .then(setLocation)
      .catch(() => setLocation("无法读取资料库路径"));
    return () => {
      live = false;
    };
  }, []);
  const { saveState, saveError, flush } = useAutosave(library);
  useEffect(() => {
    if (!desktop) return;
    let cleanup: (() => void) | undefined;
    let disposed = false;
    getCurrentWindow()
      .onCloseRequested(async (event) => {
        event.preventDefault();
        try {
          if (latest.current) await flush(true);
          await getCurrentWindow().destroy();
        } catch (error) {
          notify("保存失败，窗口保持打开：" + String(error));
        }
      })
      .then((fn) => {
        if (disposed) fn();
        else cleanup = fn;
      });
    return () => {
      disposed = true;
      cleanup?.();
    };
  }, [notify]);
  useEffect(() => {
    if (!(modal || confirm || preview)) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [modal, confirm, preview]);
  const c = library?.characters.find((c) => c.id === activeId),
    v = c?.versions.find((v) => v.id === versionId) ?? c?.versions[0],
    p = v ? effectiveProfile(v, hidden) : undefined;
  const pageIndex = pageMeta.findIndex((item) => item.id === page);
  function goPage(direction: number) {
    setPage(
      pageMeta[
        Math.max(0, Math.min(pageMeta.length - 1, pageIndex + direction))
      ].id,
    );
  }
  useAppKeyboard({ editing, modal, confirm, preview, shelf, busy, undo, redo, setConfirm, setPreview, setModal, setEditing, setPage });
  useEffect(() => {
    if (!library || !activeId) return;
    const active = library.characters.find((item) => item.id === activeId);
    if (!active) {
      setShelf(true);
            setCatalogOpen(false);
      setEditing(false);
      setModal(null);
      setHidden(false);
    } else if (!active.versions.some((item) => item.id === versionId)) {
      setVersionId(defaultVersion(active).id);
      setHidden(false);
    } else if (
      !active.versions.find((item) => item.id === versionId)?.secret.enabled
    )
      setHidden(false);
  }, [library, activeId, versionId]);
  function enter(character: Character) {
    setRelationTrail([]);
    setSearchHit(null);
    setActiveId(character.id);
    setVersionId(defaultVersion(character).id);
    setPage("archive");
    setHidden(false);
    setShelf(false);
    setCatalogOpen(false);
    setEditing(false);
  }
  function updateCharacter(patch: Partial<Character>, checkpoint = false) {
    if (!c) return;
    setLibrary(
      (lib) =>
        lib
          ? {
              ...lib,
              characters: lib.characters.map((item) =>
                item.id === c.id
                  ? { ...item, ...patch, updatedAt: now() }
                  : item,
              ),
            }
          : lib,
      checkpoint,
    );
  }
  function updateVersion(updater: (version: Version) => Version) {
    if (!c || !v) return;
    setLibrary((lib) =>
      lib
        ? {
            ...lib,
            characters: lib.characters.map((item) =>
              item.id === c.id
                ? {
                    ...item,
                    updatedAt: now(),
                    versions: item.versions.map((ver) =>
                      ver.id === v.id
                        ? { ...updater(ver), updatedAt: now() }
                        : ver,
                    ),
                  }
                : item,
            ),
          }
        : lib,
    );
  }
  function patchProfile(patch: Overrides) {
    updateVersion((ver) => {
      if (hidden) {
        const previous = ver.secret.overrides;
        let coc: CocPatch | undefined = previous.coc;
        if (patch.coc)
          coc = {
            ...coc,
            ...patch.coc,
            characteristics: {
              ...coc?.characteristics,
              ...patch.coc.characteristics,
            },
            state: { ...coc?.state, ...patch.coc.state },
            overrides: { ...coc?.overrides, ...patch.coc.overrides },
          };
        return {
          ...ver,
          secret: {
            ...ver.secret,
            overrides: {
              ...previous,
              ...patch,
              ...(patch.basics
                ? { basics: { ...previous.basics, ...patch.basics } }
                : {}),
              ...(coc ? { coc } : {}),
            },
          },
        };
      }
      return {
        ...ver,
        profile: {
          ...ver.profile,
          ...patch,
          basics: { ...ver.profile.basics, ...patch.basics },
          coc: mergeCoc(ver.profile.coc ?? blankCoc(), patch.coc),
        },
      };
    });
  }
  function inherit(keys: (keyof Profile)[]) {
    updateVersion((ver) => {
      const overrides = { ...ver.secret.overrides };
      keys.forEach((k) => delete overrides[k]);
      return { ...ver, secret: { ...ver.secret, overrides } };
    });
  }
  function basicInherit(key: keyof Basics) {
    updateVersion((ver) => {
      const basics = { ...ver.secret.overrides.basics };
      delete basics[key];
      return {
        ...ver,
        secret: {
          ...ver.secret,
          overrides: { ...ver.secret.overrides, basics },
        },
      };
    });
  }
  function patchSecret(patch: Partial<Secret>) {
    updateVersion((ver) => ({ ...ver, secret: { ...ver.secret, ...patch } }));
  }
  function selectVersion(id: string) {
    setVersionId(id);
    setHidden(false);
  }
  function openRelated(character: Character) {
    if (!c || !v) return;
    const trail = [...relationTrail, { characterId: c.id, versionId: v.id, page, hidden }];
    enter(character);
    setRelationTrail(trail);
  }
  function returnRelated() {
    const previous = relationTrail.at(-1);
    if (!previous || !library?.characters.some(role => role.id === previous.characterId)) return;
    setActiveId(previous.characterId); setVersionId(previous.versionId); setPage(previous.page);
    setHidden(previous.hidden); setEditing(false); setSearchHit(null);
    setRelationTrail(relationTrail.slice(0, -1));
  }
  function duplicate(name: string) {
    if (!v || !c) return;
    const copy = duplicateVersion(v, name);
    updateCharacter({ versions: [...c.versions, copy] }, true);
    setVersionId(copy.id);
    setHidden(false);
    notify("已复制为独立的剧情版本");
  }
  function reveal() {
    if (!v?.secret.enabled) return;
    setHidden((value) => !value);
  }
  async function runExport() {
    if (!library) return;
    setBusy(true);
    try {
      await flush().catch(() => {});
      const bytes = await exportBackup(library);
      const dispatched = await downloadBytes(
        bytes,
        "叙册备份-" + new Date().toISOString().slice(0, 10) + ".zip",
      );
      if (!dispatched) return;
      await recordBackupExport();
      setBackupRevision((value) => value + 1);
      notify("完整备份已准备好");
    } catch (error) {
      notify("备份失败：" + String(error));
    } finally {
      setBusy(false);
    }
  }
  async function moveLibrary() {
    setBusy(true);
    try {
      await flush();
      const path = await relocateLibrary();
      if (path) {
        setLocation(path);
        notify("资料库已复制到新位置，原位置保留");
      }
    } catch (error) {
      notify("迁移失败：" + String(error));
    } finally {
      setBusy(false);
    }
  }
  async function applyRecoveredLibrary(candidate: Library) {
    for (const ref of assetRefs(candidate)) await readAsset(ref);
    await flush();
    await queueSave(candidate, true);
    setLibrary(candidate, true);
    setLoadError(""); setActiveId(""); setShelf(true); setCatalogOpen(false);
    setEditing(false); setHidden(false); setModal(null);
    notify("资料已恢复，原件已保留");
  }
  async function pickRestore(file: File) {
    try {
      if (file.size > 256 * 1024 * 1024) throw new Error("备份文件超过 256 MB");
      const bytes = new Uint8Array(await file.arrayBuffer());
      let importBytes = bytes;
      let rawOriginal: unknown = null;
      let changes: string[] = [];
      let data;
      try { data = parseBackup(bytes); }
      catch (originalError) {
        try {
          const proposal = prepareBackupRecovery(bytes);
          data = proposal; importBytes = proposal.repairedBytes;
          rawOriginal = proposal.raw; changes = proposal.changes;
        } catch { throw originalError; }
      }
      setConfirm({
        title: changes.length ? "预览修复并恢复备份？" : "恢复资料库备份？",
        message: `备份包含 ${data.library.characters.length} 个可加载角色。恢复后将替换当前资料库。${changes.length ? "以下改动需要你确认，修复前原件会保留：\n" + changes.join("\n") : "建议先导出当前资料。"}`,
        label: changes.length ? "保留原件并修复导入" : "恢复并替换",
        danger: true,
        action: async () => {
          await flush();
          if (rawOriginal !== null) {
            await preserveOriginal(rawOriginal);
            await preserveOriginal(await readRawLibrary());
          }
          const result = await restoreBackup(importBytes);
          setLibrary(result, true);
          setActiveId("");
          setShelf(true);
            setCatalogOpen(false);
          setEditing(false);
          setHidden(false);
          setModal(null);
          notify("资料库已恢复，图片已一并导入");
        },
      });
    } catch (error) {
      notify("无法恢复：" + String(error));
    }
  }
  async function performConfirm() {
    if (!confirm) return;
    setBusy(true);
    try {
      await confirm.action();
      setConfirm(null);
    } catch (error) {
      notify("操作失败：" + String(error));
    } finally {
      setBusy(false);
    }
  }
  function toggleFavorite(character: Character) {
    setLibrary(
      (lib) =>
        lib
          ? {
              ...lib,
              characters: lib.characters.map((item) =>
                item.id === character.id
                  ? { ...item, favorite: !item.favorite }
                  : item,
              ),
            }
          : lib,
      true,
    );
  }
  function newCharacter() {
    const name = newName.trim();
    if (!name) return;
    const character = createCharacter(name, newCollection.trim() || "未分类");
    setLibrary(
      (lib) =>
        lib ? { ...lib, characters: [...lib.characters, character] } : lib,
      true,
    );
    setModal(null);
    setNewName("");
    setNewCollection("");
    enter(character);
    setEditing(true);
    notify("新的故事，已经翻开");
  }
  if (loadError)
    return (
      <div className="load-screen">
        <CircleAlert size={35} />
        <h1>资料库暂时无法读取</h1>
        <p>原有资料没有被覆盖。请重试，或检查桌面资料库文件。</p>
        <code>{loadError}</code>
        <RecoveryPanel failed onApply={applyRecoveredLibrary} />
        <button
          className="button primary"
          onClick={() => window.location.reload()}
        >
          重新读取
        </button>
      </div>
    );
  if (!library)
    return (
      <div className="load-screen">
        <BookOpen size={35} />
        <h1>正在翻开你的设定集…</h1>
        <LoaderCircle size={20} className="spin" />
      </div>
    );
  const groups = [...new Set(library.characters.map((c) => c.collection))];
  const filtered = library.characters
    .filter(
      (c) =>
        (filter === "全部角色" ||
          (filter === "特别收藏" && c.favorite) ||
          c.collection === filter) &&
        [
          c.name,
          c.collection,
          ...c.versions.map((v) => v.profile.basics.name),
        ].some((s) => s.toLowerCase().includes(search.toLowerCase())),
    )
    .sort((a, b) =>
      sort === "name"
        ? a.name.localeCompare(b.name, "zh-CN")
        : b.updatedAt.localeCompare(a.updatedAt),
    );
  return (
    <div
      className={"app " + (hidden && !shelf ? "revealed-app" : "")}
      style={{ "--character-accent": c?.accent ?? "#53695c" } as CSSProperties}
    >
      <aside className="sidebar">
        <button
          className="brand"
          onClick={() => {
            setShelf(true);
            setCatalogOpen(false);
            setHidden(false);
            setEditing(false);
          }}
        >
          <span className="brand-mark">
            <BookOpen size={25} strokeWidth={1.2} />
          </span>
          <span>
            <b>
              叙册<span>·</span>
            </b>
            <small>CHARACTER ATLAS</small>
          </span>
        </button>
        <div className="sidebar-section-label">我的创作空间</div>
        <button
          className={
            "sidebar-link " + (!catalogOpen && shelf && filter === "全部角色" ? "active" : "")
          }
          onClick={() => {
            setShelf(true);
            setCatalogOpen(false);
            setFilter("全部角色");
            setEditing(false);
          }}
        >
          <LibraryBig size={18} />
          <span>角色书架</span>
          <small>{library.characters.length.toString().padStart(2, "0")}</small>
        </button>
        <button
          className={
            "sidebar-link " + (!catalogOpen && shelf && filter === "特别收藏" ? "active" : "")
          }
          onClick={() => {
            setShelf(true);
            setCatalogOpen(false);
            setFilter("特别收藏");
            setEditing(false);
          }}
        >
          <Star size={18} />
          <span>特别收藏</span>
        </button>
        <button className={"sidebar-link " + (catalogOpen ? "active" : "")} onClick={() => {
          setShelf(true); setCatalogOpen(true); setEditing(false); setHidden(false);
        }}><LibraryBig size={18} /><span>条目库管理</span><small>{library.catalog?.length ?? 0}</small></button>
        <div className="sidebar-section-label series-label">
          故事与世界<span>{groups.length}</span>
        </div>
        {groups.map((group) => (
          <button
            key={group}
            className={
              "sidebar-link series-link " +
              (!catalogOpen && shelf && filter === group ? "active" : "")
            }
            onClick={() => {
              setShelf(true);
            setCatalogOpen(false);
              setFilter(group);
              setEditing(false);
            }}
          >
            <span className="series-dot" />
            <span>{group || "未分类"}</span>
            <small>
              {library.characters.filter((c) => c.collection === group).length}
            </small>
          </button>
        ))}
        <div className="sidebar-section-label recent-label">角色速览</div>
        <div className="recent-characters">
          {library.characters.slice(0, 6).map((character) => (
            <button
              key={character.id}
              className={!shelf && activeId === character.id ? "active" : ""}
              onClick={() => enter(character)}
            >
              <Portrait image={defaultVersion(character).profile.portrait} />
              <span>
                {character.name}
                <small>
                  {defaultVersion(character).profile.basics.occupation ||
                    "故事待续"}
                </small>
              </span>
              {character.id === activeId && !shelf && (
                <span className="reading-dot" />
              )}
            </button>
          ))}
        </div>
        <div className="sidebar-bottom">
          <div className="private-note">
            <ShieldCheck size={16} />
            <span>你的世界，只属于你。</span>
          </div>
          <button
            className="library-button"
            onClick={() => setModal("library")}
          >
            <span className="library-icon">
              <HardDrive size={17} />
            </span>
            <span>
              本地资料库
              <small>
                {saveState === "error" ? "保存需要处理" : "所有故事，妥善收存"}
              </small>
            </span>
            <Settings2 size={16} />
          </button>
        </div>
      </aside>
      <div className="app-main">
        <header className="app-header">
          <div className="breadcrumb">
            <span>私人设定集</span>
            <ChevronRight size={13} />
            <strong>{catalogOpen ? "条目库管理" : shelf ? "角色书架" : c?.name}</strong>
            {!shelf && (
              <>
                <ChevronRight size={13} />
                <span>{pageMeta[pageIndex].name}</span>
              </>
            )}
          </div>
          <div className="header-actions">
            <button
              className={"save-indicator " + saveState}
              onClick={() =>
                saveState === "error"
                  ? setModal("library")
                  : notify("资料保存在本机，不会上传到云端")
              }
              title={saveError || "资料保存在本机"}
            >
              {saveState === "saving" ? (
                <LoaderCircle className="spin" size={13} />
              ) : saveState === "error" ? (
                <CircleAlert size={13} />
              ) : (
                <CheckCheck size={14} />
              )}
              <span>
                {saveState === "saving"
                  ? "正在保存"
                  : saveState === "error"
                    ? "保存失败"
                    : "已在本地保存"}
              </span>
            </button>
            <span className="header-divider" />
            <button
              className="icon-button"
              aria-label="打开资料库设置"
              onClick={() => setModal("library")}
            >
              <Settings2 size={17} />
            </button>
          </div>
        </header>
        <main className={shelf ? "shelf-main" : "dossier-main"}>
          {catalogOpen ? (
            <section className="catalog-management">
              <div className="shelf-heading">
                <div><span className="eyebrow">SHARED COLLECTION</span><h1>条目库管理</h1><p>整理可复用的技能、法术、专长与物品设定。</p></div>
                <div className="coc-edit-actions">
                  <button className="button small" disabled={!canUndo} onClick={undo}>撤销</button>
                  <button className="button small" disabled={!canRedo} onClick={redo}>重做</button>
                </div>
              </div>
              <CatalogPanel entries={library.catalog ?? []} onChange={(catalog) => setLibrary((lib) => lib ? { ...lib, catalog } : lib, true)} />
            </section>
          ) : shelf ? (
            <ShelfView
              library={library} filter={filter} filtered={filtered}
              search={search} setSearch={setSearch} sort={sort} setSort={setSort}
              layout={layout} setLayout={setLayout}
              canUndo={canUndo} canRedo={canRedo} undo={undo} redo={redo}
              onNewCharacter={() => setModal("new")}
              enter={enter} toggleFavorite={toggleFavorite}
              onSearchHit={(hit) => {
                setActiveId(hit.characterId); setVersionId(hit.versionId); setPage(hit.page);
                setHidden(hit.hidden); setShelf(false); setCatalogOpen(false); setEditing(false); setSearchHit(hit);
              }}
            />
          ) : c && v && p ? (
            <>
              <div className="dossier-heading">
                <button
                  className="back-button"
                  onClick={() => {
                    setShelf(true);
            setCatalogOpen(false);
                    setHidden(false);
                  }}
                >
                  <ArrowLeft size={15} />
                  返回书架
                </button>
                <div className="dossier-actions">
                  {!!relationTrail.length && library.characters.some(role => role.id === relationTrail.at(-1)!.characterId) && <button className="button small" onClick={returnRelated}>返回 {library.characters.find(role => role.id === relationTrail.at(-1)!.characterId)?.name}</button>}
                  <button
                    className="icon-button"
                    aria-label="撤销修改"
                    disabled={!canUndo}
                    onClick={undo}
                  >
                    <Undo2 size={17} />
                  </button>
                  <button
                    className="icon-button"
                    aria-label="重做修改"
                    disabled={!canRedo}
                    onClick={redo}
                  >
                    <Redo2 size={17} />
                  </button>
                  <button
                    className="button small"
                    onClick={() => setModal("identity")}
                  >
                    <ContactRound size={15} />
                    身份卡
                  </button>
                  <button className="button small" aria-expanded={comparing} onClick={() => setComparing(!comparing)}>版本对比</button>
                  <label className="version-picker">
                    <Clock3 size={14} />
                    <select
                      aria-label="当前剧情版本"
                      value={v.id}
                      onChange={(e) => selectVersion(e.target.value)}
                    >
                      {c.versions.map((ver) => (
                        <option key={ver.id} value={ver.id}>
                          {ver.name}
                        </option>
                      ))}
                    </select>
                    <ChevronDown size={12} />
                  </label>
                  <button
                    className="icon-button"
                    aria-label="复制为新阶段"
                    onClick={() => {
                      setCopyName(v.name + " · 下一阶段");
                      setModal("copyVersion");
                    }}
                  >
                    <Copy size={16} />
                  </button>
                  <button
                    className="icon-button favorite-toggle"
                    aria-label={c.favorite ? "取消收藏" : "收藏角色"}
                    onClick={() => toggleFavorite(c)}
                  >
                    <Star
                      size={17}
                      fill={c.favorite ? "currentColor" : "none"}
                    />
                  </button>
                  <button
                    className="button primary small"
                    onClick={() => setEditing(true)}
                  >
                    <PencilLine size={14} />
                    编辑档案
                  </button>
                </div>
              </div>
              {comparing && <VersionCompare key={c.id} character={c} currentId={v.id} characters={library.characters} />}
              <div className="dossier-title-row">
                <div>
                  <span className="eyebrow">
                    {hidden
                      ? "ANOTHER SIDE OF THE STORY"
                      : "A PERSONAL CHARACTER DOSSIER"}
                  </span>
                  <h1>
                    {hidden
                      ? v.secret.label || "秘密档案"
                      : c.name + "的设定册"}
                    <span>{hidden ? "RESTRICTED" : "PERSONAL ARCHIVE"}</span>
                  </h1>
                </div>
                <div className="chapter-note">
                  <span>{v.date || "剧情时间未填写"}</span>
                  <p>{v.note || v.name}</p>
                </div>
              </div>
              {searchHit && searchHit.versionId === v.id && searchHit.page === page && searchHit.hidden === hidden && <div className="search-landing" role="note">
                <strong>搜索命中 · {searchHit.field}</strong><p>{searchHit.snippet}</p>
                <button className="text-button" onClick={() => setSearchHit(null)}>收起命中提示</button>
              </div>}
              <div
                className={
                  "book-shell " +
                  (hidden ? "theme-" + v.secret.theme : "theme-ivory")
                }
              >
                <nav className="book-tabs" aria-label="档案目录">
                  {pageMeta.map((item, i) => (
                    <button
                      key={item.id}
                      className={page === item.id ? "active" : ""}
                      onClick={() => setPage(item.id)}
                    >
                      <span>{String(i + 1).padStart(2, "0")}</span>
                      {hidden
                        ? ((
                            {
                              archive: "人员档案",
                              skills: "能力评估",
                              collection: "物品与影像",
                              status: "医疗记录",
                            } as Partial<Record<Page, string>>
                          )[item.id] ?? item.name)
                        : item.name}
                    </button>
                  ))}
                </nav>
                {hidden && (
                  <div className="restricted-ribbon">
                    <LockKeyhole size={12} />
                    <span>
                      {v.secret.theme === "prison"
                        ? "收容管理 / 人员档案 · 授权查阅"
                        : v.secret.theme === "clinical"
                          ? "研究记录 / 特殊观察对象"
                          : "机密档案 / 限定查阅"}
                    </span>
                    <b>RESTRICTED ACCESS</b>
                  </div>
                )}
{editing && c && v && p && (
        <Editor
          characters={library.characters}
          character={c}
          catalog={library?.catalog ?? []}
          onCatalog={(catalog) => setLibrary((lib) => lib ? { ...lib, catalog } : lib, true)}
          version={v}
          profile={p}
          hidden={hidden}
          page={page}
          onPage={setPage}
          onClose={() => setEditing(false)}
          onPatch={patchProfile}
          onInherit={inherit}
          onBasicInherit={basicInherit}
          onSecret={patchSecret}
          onCharacter={updateCharacter}
          onVersion={(patch) => updateVersion((ver) => ({ ...ver, ...patch }))}
          onSelectVersion={selectVersion}
          onDuplicate={duplicate}
          onDeleteVersion={() =>
            setConfirm({
              title: "删除这个剧情版本？",
              message: `“${v.name}”及其中的秘密档案将被删除，其他版本不受影响。`,
              label: "删除版本",
              danger: true,
              action: () => {
                const remaining = c.versions.filter((ver) => ver.id !== v.id);
                if (!remaining.length) return;
                updateCharacter(
                  {
                    versions: remaining,
                    defaultVersionId:
                      c.defaultVersionId === v.id
                        ? remaining[0].id
                        : c.defaultVersionId,
                  },
                  true,
                );
                setVersionId(remaining[0].id);
                setHidden(false);
                notify("已删除剧情版本");
              },
            })
          }
          onDeleteCharacter={() =>
            setConfirm({
              title: "删除这个角色？",
              message: `“${c.name}”的全部剧情版本和秘密档案都会被移除。请确认已有需要的备份。`,
              label: "删除角色",
              danger: true,
              action: () => {
                setLibrary(
                  (lib) =>
                    lib
                      ? {
                          ...lib,
                          characters: lib.characters.filter(
                            (item) => item.id !== c.id,
                          ),
                        }
                      : lib,
                  true,
                );
                setShelf(true);
            setCatalogOpen(false);
                setEditing(false);
                setHidden(false);
                notify("角色已从资料库移除");
              },
            })
          }
          onUpload={putImage}
          onUndo={undo}
          onRedo={redo}
          canUndo={canUndo}
          canRedo={canRedo}
          onSetDefault={() => updateCharacter({ defaultVersionId: v.id }, true)}
          onSetHidden={setHidden}
        />
      )}
                {!editing && (<>
                <ReadingView
                  key={c.id + v.id + hidden}
                  storageKey={JSON.stringify([c.id, v.id, hidden])}
                  page={page} onPage={setPage} revision={v.updatedAt}
                >
                  <BookPages
                    characters={library.characters} currentId={c.id} onOpenCharacter={openRelated}
                    onToggleSecret={v.secret.enabled ? reveal : undefined}
                    page={page}
                    profile={p}
                    hidden={hidden}
                    onPreview={(ref, caption) => setPreview({ ref, caption })}
                  />
                  {hidden && v.secret.theme === "prison" && (
                    <div className="prison-stamp" aria-hidden="true">
                      收押登记<span>REGISTERED</span>
                    </div>
                  )}
                </ReadingView>
                </>)}
                <div className="book-edge" />
              </div>
              <div className="book-navigation">
                <button
                  className="page-arrow"
                  disabled={pageIndex === 0}
                  onClick={() => goPage(-1)}
                >
                  <ChevronLeft size={16} />
                  上一页
                </button>
                <div className="page-dots">
                  {pageMeta.map((item) => (
                    <button
                      key={item.id}
                      aria-label={"跳转" + item.name}
                      className={page === item.id ? "active" : ""}
                      onClick={() => setPage(item.id)}
                    />
                  ))}
                  <span>
                    {String(pageIndex + 1).padStart(2, "0")} /{" "}
                    {String(pageMeta.length).padStart(2, "0")}
                  </span>
                </div>
                <button
                  className="page-arrow"
                  disabled={pageIndex === pageMeta.length - 1}
                  onClick={() => goPage(1)}
                >
                  下一页
                  <ChevronRight size={16} />
                </button>
              </div>
              <div className="reader-footnote">
                <span>
                  {hidden ? (
                    <>
                      <LockKeyhole size={12} />
                      秘密档案 · 再次点击触发元素可返回
                    </>
                  ) : v.secret.enabled ? (
                    <>
                      <Info size={12} />
                      {
                        (
                          {
                            portrait: "照片",
                            name: "姓名",
                            emblem: "徽记",
                          } as const
                        )[v.secret.trigger]
                      }
                      中，也许藏着另一段故事。可在身份卡中触发，或点击详细档案的姓名。
                    </>
                  ) : (
                    <>
                      <ShieldCheck size={12} />
                      私人角色设定集
                    </>
                  )}
                </span>
                {hidden ? (
                  <button className="text-button" onClick={reveal}>
                    <ArrowLeft size={12} />
                    返回表层档案
                  </button>
                ) : (
                  <span>← → 翻页</span>
                )}
              </div>
            </>
          ) : null}
        </main>
      </div>
      {modal === "identity" && c && v && p && (
        <Modal
          title="身份卡"
          className="identity-card-modal"
          bare
          onClose={() => setModal(null)}
        >
          <IdentityDisplay hidden={hidden} theme={v.secret.theme}>
            <IdentityCard
              profile={p}
              hidden={hidden}
              onPortrait={
                v.secret.enabled && v.secret.trigger === "portrait"
                  ? reveal
                  : undefined
              }
              onName={
                v.secret.enabled && v.secret.trigger === "name"
                  ? reveal
                  : undefined
              }
              onEmblem={
                v.secret.enabled && v.secret.trigger === "emblem"
                  ? reveal
                  : undefined
              }
            />
          </IdentityDisplay>
        </Modal>
      )}
      {modal === "copyVersion" && v && (
        <Modal title="复制为新阶段" onClose={() => setModal(null)}>
          <form
            className="modal-form"
            onSubmit={(e) => {
              e.preventDefault();
              if (copyName.trim()) {
                duplicate(copyName.trim());
                setModal(null);
              }
            }}
          >
            <p>
              复制当前版本的全部内容，包括秘密档案和身体状态。新阶段可独立修改。
            </p>
            <label className="field">
              阶段名称
              <input
                autoFocus
                value={copyName}
                onChange={(e) => setCopyName(e.target.value)}
              />
            </label>
            <button className="button primary" disabled={!copyName.trim()}>
              创建新阶段
            </button>
          </form>
        </Modal>
      )}
      {modal === "new" && (
        <Modal title="翻开一个新的故事" onClose={() => setModal(null)}>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              newCharacter();
            }}
          >
            <p className="modal-description">
              先写下名字，其他的一切，都可以慢慢补全。
            </p>
            <label className="field">
              <span>角色名称</span>
              <input
                autoFocus
                required
                maxLength={100}
                placeholder="这个角色叫什么？"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
              />
            </label>
            <label className="field">
              <span>
                所属系列 / 世界观 <small>可选</small>
              </span>
              <input
                list="collection-options"
                placeholder="例如：雾港来信"
                value={newCollection}
                onChange={(e) => setNewCollection(e.target.value)}
              />
              <datalist id="collection-options">
                {groups.map((g) => (
                  <option key={g} value={g} />
                ))}
              </datalist>
            </label>
            <div className="modal-actions">
              <button
                type="button"
                className="button"
                onClick={() => setModal(null)}
              >
                取消
              </button>
              <button
                type="submit"
                className="button primary"
                disabled={!newName.trim()}
              >
                <Plus size={15} />
                创建并编辑
              </button>
            </div>
          </form>
        </Modal>
      )}
      {modal === "library" && (
        <LibrarySettingsModal
          library={library} busy={busy} location={location}
          saveState={saveState} saveError={saveError} backupRevision={backupRevision}
          notify={notify} onClose={() => setModal(null)}
          onRetrySave={() => setLibrary({ ...library })}
          moveLibrary={moveLibrary} runExport={runExport} pickRestore={pickRestore}
          applyRecoveredLibrary={applyRecoveredLibrary}
          onImport={async (base, payload, choices) => {
            await flush();
            const result = await appendLibraryImport(base, payload, choices);
            setLibrary(result, true); setActiveId(""); setShelf(true); setCatalogOpen(false); setEditing(false); setHidden(false);
          }}
        />
      )}
      {preview && (
        <Modal
          title={preview.caption || "影像预览"}
          className="preview-modal"
          onClose={() => setPreview(null)}
        >
          <Portrait image={preview.ref} className="preview-image" />
        </Modal>
      )}
      {confirm && (
        <Modal
          title={confirm.title}
          onClose={() => {
            if (!busy) setConfirm(null);
          }}
        >
          <p className="confirm-message">{confirm.message}</p>
          <div className="modal-actions">
            <button
              className="button"
              disabled={busy}
              onClick={() => setConfirm(null)}
            >
              取消
            </button>
            <button
              className={
                "button " + (confirm.danger ? "danger-button" : "primary")
              }
              disabled={busy}
              onClick={performConfirm}
            >
              {busy ? <LoaderCircle size={15} className="spin" /> : null}
              {confirm.label || "确定"}
            </button>
          </div>
        </Modal>
      )}
      {toast && (
        <div className="toast" role="status">
          <Check size={16} />
          <span>{toast}</span>
          <button
            className="icon-button"
            aria-label="关闭提示"
            onClick={() => setToast("")}
          >
            <X size={14} />
          </button>
        </div>
      )}
    </div>
  );
}
