import type { CSSProperties } from "react";
import {
  ArrowRight, Network, ArrowUpFromLine, BookMarked, BookOpen, Grid2X2, List, Plus, Redo2,
  Search, SlidersHorizontal, Star, Undo2, X,
} from "lucide-react";
import { defaultVersion, type Character, type Library } from "../model";
import { IdentityCard } from "../components/BookPages";
import { LibrarySearch } from "../components/LibrarySearch";
import type { SearchHit } from "../search";

export interface ShelfViewProps {
  library: Library;
  filter: string;
  filtered: Character[];
  search: string;
  setSearch: (value: string) => void;
  sort: string;
  setSort: (value: string) => void;
  layout: "grid" | "list";
  setLayout: (value: "grid" | "list") => void;
  canUndo: boolean;
  canRedo: boolean;
  undo: () => void;
  redo: () => void;
  onNewCharacter: () => void;
  onOpenGraph?: () => void;
  enter: (character: Character) => void;
  toggleFavorite: (character: Character) => void;
  onSearchHit: (hit: SearchHit) => void;
}

/** 角色书架。状态仍由 App 持有，以便在书架与档案之间切换时保留搜索、排序与布局。 */
export function ShelfView({
  library, filter, filtered, search, setSearch, sort, setSort, layout, setLayout,
  canUndo, canRedo, undo, redo, onNewCharacter, onOpenGraph, enter, toggleFavorite, onSearchHit,
}: ShelfViewProps) {
  return (
            <>
              <div className="shelf-heading">
                <div>
                  <span className="eyebrow">
                    YOUR PERSONAL CHARACTER COLLECTION
                  </span>
                  <h1>{filter === "全部角色" ? "角色书架" : filter}</h1>
                  <p>收藏每一个灵魂，记录每一种可能。</p>
                </div>
                <div className="coc-edit-actions">
                  {onOpenGraph && <button className="button" onClick={onOpenGraph}><Network size={16} />关系图</button>}
                  <button
                    className="button primary"
                    onClick={onNewCharacter}
                  >
                    <Plus size={17} />
                    创建角色
                  </button>
                </div>
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
                <LibrarySearch library={library} onOpen={onSearchHit} />
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
                  onClick={onNewCharacter}
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
  );
}
