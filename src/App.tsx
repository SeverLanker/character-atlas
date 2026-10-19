import { IdentityDisplay } from "./components/IdentityDisplay";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import {
  ArrowDownToLine,
  ContactRound,
  Copy,
  Undo2,
  Redo2,
  ArrowLeft,
  ArrowRight,
  ArrowUpFromLine,
  BookMarked,
  BookOpen,
  Check,
  CheckCheck,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  Clock3,
  FolderOpen,
  Grid2X2,
  HardDrive,
  Info,
  LibraryBig,
  List,
  LoaderCircle,
  LockKeyhole,
  PencilLine,
  Plus,
  Search,
  Settings2,
  ShieldCheck,
  SlidersHorizontal,
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
  openFolder,
  parseBackup,
  putImage,
  restoreBackup,
  saveLibrary,
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
import { ImportPanel } from "./components/ImportPanel";
import { LibrarySearch } from "./components/LibrarySearch";
import type { SearchHit } from "./search";
import { ReadingView } from "./components/ReadingView";
import { VersionCompare } from "./components/VersionCompare";
import { Portrait } from "./components/Portrait";
let saveChain: Promise<void> = Promise.resolve();
function queueSave(library: Library, forceSnapshot = false) {
  const job = saveChain.catch(() => {}).then(() => saveLibrary(library, forceSnapshot));
  saveChain = job;
  return job;
}
interface Confirm {
  title: string;
  message: string;
  action: () => void | Promise<void>;
  label?: string;
  danger?: boolean;
}
function Modal({
  title,
  children,
  onClose,
  className = "",
  bare = false,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  className?: string;
  bare?: boolean;
}) {
  const content = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const root = content.current;
    const focusable = () =>
      Array.from(
        root?.querySelectorAll<HTMLElement>(
          'button:not(:disabled),input,select,textarea,[tabindex="0"]',
        ) ?? [],
      );
    if (!root?.contains(document.activeElement)) {
      if (bare) root?.focus();
      else focusable()[0]?.focus();
    }
    function key(e: KeyboardEvent) {
      if (e.key === "Tab") {
        const nodes = focusable();
        const first = nodes[0],
          last = nodes.at(-1);
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last?.focus();
        } else if (!e.shiftKey && (document.activeElement === last || document.activeElement === root)) {
          e.preventDefault();
          first?.focus();
        }
      }
    }
    root?.addEventListener("keydown", key);
    return () => {
      root?.removeEventListener("keydown", key);
      previous?.focus();
    };
  }, [bare]);
  return (
    <div
      className={"modal-backdrop" + (bare ? " identity-overlay" : "")}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={content}
        className={"modal " + className}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
      >
        {bare ? <button className="identity-dismiss" aria-label="关闭窗口" onClick={onClose}><X size={18} /></button> : <header>
          <div>
            <small>CHARACTER ATLAS</small>
            <h2>{title}</h2>
          </div>
          <button
            className="icon-button"
            aria-label="关闭窗口"
            onClick={onClose}
          >
            <X size={20} />
          </button>
        </header>}
        {children}
      </div>
    </div>
  );
}
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
    [saveState, setSaveState] = useState<"saving" | "saved" | "error">("saved"),
    [saveError, setSaveError] = useState(""),
    [location, setLocation] = useState("");
  const restoreInput = useRef<HTMLInputElement>(null),
    latest = useRef<Library | null>(null),
    saveSerial = useRef(0),
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
  useEffect(() => {
    if (!library) return;
    const serial = ++saveSerial.current;
    setSaveState("saving");
    queueSave(library)
      .then(() => {
        if (saveSerial.current === serial) {
          setSaveState("saved");
          setSaveError("");
        }
      })
      .catch((error) => {
        if (saveSerial.current === serial) {
          setSaveState("error");
          setSaveError(String(error));
        }
      });
  }, [library]);
  useEffect(() => {
    if (!desktop) return;
    let cleanup: (() => void) | undefined;
    let disposed = false;
    getCurrentWindow()
      .onCloseRequested(async (event) => {
        event.preventDefault();
        try {
          if (latest.current) await queueSave(latest.current);
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
  useEffect(() => {
    function key(e: KeyboardEvent) {
      if (e.key === "Escape" && !busy) {
        if (confirm) setConfirm(null);
        else if (preview) setPreview(null);
        else if (modal) setModal(null);
        else if (editing) setEditing(false);
        return;
      }
      const element = e.target as HTMLElement;
      if (
        (e.ctrlKey || e.metaKey) &&
        !element.matches("input,textarea,select,[contenteditable]")
      ) {
        if (e.key.toLowerCase() === "z" || e.key.toLowerCase() === "y") {
          e.preventDefault();
          if (e.shiftKey || e.key.toLowerCase() === "y") redo();
          else undo();
          return;
        }
      }
      if (
        editing ||
        modal ||
        confirm ||
        preview ||
        shelf ||
        element.matches("input,textarea,select,[contenteditable]")
      )
        return;
      if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
        e.preventDefault();
        setPage((current) => {
          const index = pageMeta.findIndex((p) => p.id === current);
          return pageMeta[
            Math.max(
              0,
              Math.min(
                pageMeta.length - 1,
                index + (e.key === "ArrowRight" ? 1 : -1),
              ),
            )
          ].id;
        });
      }
    }
    document.addEventListener("keydown", key);
    return () => document.removeEventListener("keydown", key);
  }, [editing, modal, confirm, preview, shelf, busy, undo, redo]);
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
      await saveChain.catch(() => {});
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
      await saveChain;
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
          await saveChain;
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
            <>
              <div className="shelf-heading">
                <div>
                  <span className="eyebrow">
                    YOUR PERSONAL CHARACTER COLLECTION
                  </span>
                  <h1>{filter === "全部角色" ? "角色书架" : filter}</h1>
                  <p>收藏每一个灵魂，记录每一种可能。</p>
                </div>
                <button
                  className="button primary"
                  onClick={() => setModal("new")}
                >
                  <Plus size={17} />
                  创建角色
                </button>
              </div>
              <section className="shelf-banner">
                <div>
                  <span className="eyebrow">BETWEEN THE PAGES</span>
                  <h2>
                    每个名字，
                    <br />
                    都有自己的故事。
                  </h2>
                  <p>
                    从一张证件，到一段人生。
                    <br />
                    把想象中的他们，认真收进书页。
                  </p>
                  <div className="shelf-metrics" aria-label="资料库概览">
                    <span><b>{library.characters.length}</b>位角色</span>
                    <span><b>{library.characters.reduce((sum, role) => sum + role.versions.length, 0)}</b>段篇章</span>
                    <span><b>{new Set(library.characters.map(role => role.collection).filter(Boolean)).size}</b>个世界</span>
                  </div>
                </div>
                <div className="banner-art" aria-hidden="true">
                  <div className="banner-book back">
                    <span>STORIES</span>
                  </div>
                  <div className="banner-book front">
                    <BookOpen size={32} strokeWidth={0.8} />
                    <span>
                      THE CHARACTER
                      <br />
                      ATLAS
                    </span>
                    <i>Vol. 01</i>
                  </div>
                  <span className="banner-orbit" />
                </div>
                <span className="banner-index">
                  A PRIVATE UNIVERSE / EST. 2026
                </span>
              </section>
              <div className="shelf-tools">
                <div className="shelf-count">
                  <BookMarked size={17} />
                  <h2>{filter === "全部角色" ? "全部角色" : filter}</h2>
                  <span>{filtered.length}</span>
                </div>
                <div className="shelf-controls">
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
                  <label className="search-input">
                    <Search size={15} />
                    <input
                      aria-label="搜索角色"
                      placeholder="寻找一个名字…"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                    />
                    {search && (
                      <button
                        className="icon-button"
                        aria-label="清空搜索"
                        onClick={() => setSearch("")}
                      >
                        <X size={13} />
                      </button>
                    )}
                  </label>
                  <label className="sort-control">
                    <SlidersHorizontal size={14} />
                    <select
                      aria-label="排序方式"
                      value={sort}
                      onChange={(e) => setSort(e.target.value)}
                    >
                      <option value="recent">最近更新</option>
                      <option value="name">姓名排序</option>
                    </select>
                  </label>
                  <div className="view-toggle">
                    <button
                      className={layout === "grid" ? "active" : ""}
                      aria-label="网格视图"
                      onClick={() => setLayout("grid")}
                    >
                      <Grid2X2 size={15} />
                    </button>
                    <button
                      className={layout === "list" ? "active" : ""}
                      aria-label="列表视图"
                      onClick={() => setLayout("list")}
                    >
                      <List size={16} />
                    </button>
                  </div>
                </div>
              </div>
              <details className="global-search-panel">
                <summary>跨角色内容检索</summary>
                <LibrarySearch library={library} onOpen={(hit) => {
                  setActiveId(hit.characterId); setVersionId(hit.versionId); setPage(hit.page);
                  setHidden(hit.hidden); setShelf(false); setCatalogOpen(false); setEditing(false); setSearchHit(hit);
                }} />
              </details>
              <div
                className={
                  "character-grid " +
                  (layout === "list" ? "character-list" : "")
                }
              >
                {filtered.map((character, i) => (
                  <article
                    className="character-card"
                    key={character.id}
                    style={{ "--card-delay": i * 60 + "ms" } as CSSProperties}
                  >
                    <button
                      className="character-open identity-surface"
                      aria-label={"打开" + character.name + "的档案"}
                      onClick={() => enter(character)}
                    >
                      <IdentityCard
                        profile={defaultVersion(character).profile}
                        hidden={false}
                      />
                      <div className="identity-card-caption">
                        <div>
                          <small>{character.collection}</small>
                          <strong>{character.name}</strong>
                        </div>
                        <span>
                          {defaultVersion(character).name} ·{" "}
                          {character.versions.length} 个版本{" "}
                          <ArrowUpFromLine size={12} />
                        </span>
                      </div>
                    </button>
                    <button
                      className={
                        "card-favorite " +
                        (character.favorite ? "favorited" : "")
                      }
                      onClick={() => toggleFavorite(character)}
                      aria-label={
                        character.favorite
                          ? "取消收藏" + character.name
                          : "收藏" + character.name
                      }
                    >
                      <Star
                        size={16}
                        fill={character.favorite ? "currentColor" : "none"}
                      />
                    </button>
                  </article>
                ))}
                <button
                  className="new-character-card"
                  onClick={() => setModal("new")}
                >
                  <span>
                    <Plus size={25} strokeWidth={1} />
                  </span>
                  <h3>下一位，谁会到来？</h3>
                  <p>为新的灵魂，留下一页。</p>
                  <small>
                    创建角色 <ArrowRight size={13} />
                  </small>
                </button>
              </div>
              {!filtered.length && search && (
                <p className="no-results">
                  没有找到“{search}”，换一个名字试试。
                </p>
              )}
              <footer className="shelf-footer">
                <span>属于你的角色，也属于他们自己的故事。</span>
                <span>CHARACTER ATLAS · LOCAL LIBRARY</span>
              </footer>
            </>
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
        <Modal
          title="本地资料库"
          onClose={() => {
            if (!busy) setModal(null);
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
                onClick={() => {
                  setLibrary({ ...library });
                }}
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
          <RecoveryPanel key={backupRevision} onApply={applyRecoveredLibrary} />
          <ImportPanel current={library} onImport={async (base, payload, choices) => {
            await saveChain;
            const result = await appendLibraryImport(base, payload, choices);
            setLibrary(result, true); setActiveId(""); setShelf(true); setCatalogOpen(false); setEditing(false); setHidden(false);
          }} />
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
