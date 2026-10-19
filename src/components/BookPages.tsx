import { Relationships } from "./Relationships";
import type { Character } from "../model";
import {
  ArrowUpRight,
  Bookmark,
  Fingerprint,
  Flower2,
  HeartPulse,
  Package,
  ShieldAlert,
  Sparkles,
} from "lucide-react";
import { useState } from "react";
import { basicLabels, visibleBasic, isProminentAbility, type Page, type Profile, type Skill } from "../model";
import {
  CocAttributes,
  CocSkills,
  CocVitals,
  ThresholdValue,
} from "./CocPanel";
import { ReadingText } from "./ReadingView";
import { Portrait } from "./Portrait";
const dash = (s: string) => s || "未记录";
function Empty({ text }: { text: string }) {
  return (
    <div className="empty-inline">
      <Bookmark size={24} strokeWidth={1} />
      <p>{text}</p>
      <span>点击「编辑档案」，写下属于这个角色的故事。</span>
    </div>
  );
}
function SectionHeading({
  n,
  title,
  en,
}: {
  n: string;
  title: string;
  en: string;
}) {
  return (
    <div className="section-heading">
      <span>{n}</span>
      <div>
        <small>{en}</small>
        <h2>{title}</h2>
      </div>
    </div>
  );
}
export function IdentityCard({
  profile,
  hidden,
  onPortrait,
  onName,
  onEmblem,
}: {
  profile: Profile;
  hidden: boolean;
  onPortrait?: () => void;
  onName?: () => void;
  onEmblem?: () => void;
}) {
  return (
    <div className={"id-card " + (hidden ? "restricted-card" : "")}>
      <span className="id-card-glint" aria-hidden="true" />
      <div className="id-top">
        <Flower2 size={15} />
        <span>
          {hidden ? "RESTRICTED PERSONNEL RECORD" : "PERSONAL IDENTIFICATION"}
        </span>
        <span>{hidden ? "机密" : "身份卡"}</span>
      </div>
      <div className="id-main">
        <Portrait
          image={profile.portrait}
          className="id-photo"
          onClick={onPortrait}
          label="切换身份档案"
        />
        <div className="id-copy">
          {visibleBasic(profile, "name") &&
            (onName ? (
              <button className="id-name text-button" onClick={onName}>
                {profile.basics.name || "未命名"}
              </button>
            ) : (
              <span className="id-name">{profile.basics.name || "未命名"}</span>
            ))}
          <div className="id-fields">
            {(
              [
                ["age", "年龄"],
                ["gender", "性别"],
                ["occupation", "身份"],
              ] as const
            )
              .filter(([key]) => visibleBasic(profile, key))
              .map(([key, label]) => (
                <span key={key}>
                  {label} <b>{dash(profile.basics[key])}</b>
                </span>
              ))}
          </div>
          {visibleBasic(profile, "code") && (
            <div className="id-number">
              {profile.basics.code || "NO RECORD"}
            </div>
          )}
          <div className="barcode" />
          <div className="id-security" aria-hidden="true"><i className="id-chip" /><span>{hidden ? 'RESTRICTED / PERSONNEL ARCHIVE' : 'PERSONAL / CHARACTER ARCHIVE'}</span></div>
        </div>
        {onEmblem ? (
          <button
            className="id-emblem"
            onClick={onEmblem}
            aria-label="切换身份档案"
          >
            <Fingerprint size={34} strokeWidth={1} />
          </button>
        ) : (
          <span className="id-emblem">
            <Fingerprint size={34} strokeWidth={1} />
          </span>
        )}
      </div>
    </div>
  );
}
function Archive({ p, hidden, characters, currentId, onOpenCharacter, onPreview, onToggleSecret }: { p: Profile; hidden: boolean; characters: Character[]; currentId: string; onOpenCharacter?: (c: Character) => void; onPreview: (ref: string, caption: string) => void; onToggleSecret?: () => void }) {
  return (
    <>
      <section className="paper-page">
        <div className="folio-top">
          <span>COMPLETE PERSONAL RECORD</span>
          <span>01 / DOSSIER</span>
        </div>
        <SectionHeading
          n="01"
          title={hidden ? "完整人员档案" : "详细档案"}
          en="THE PERSON BEHIND THE NAME"
        />
        <div className="archive-identity">
          <Portrait image={p.portrait} onClick={p.portrait ? () => onPreview(p.portrait, `${p.basics.name || "角色"}的照片`) : undefined} label="放大角色照片" />
          <div>
            {visibleBasic(p, "code") && <small>{p.basics.code}</small>}
            {visibleBasic(p, "name") && <h3 aria-label={p.basics.name}>{onToggleSecret ? <button className="text-button archive-name" onClick={onToggleSecret} title={hidden ? '点击返回公开档案' : '点击切换秘密档案'} aria-label={`${p.basics.name} · ${hidden ? '返回公开档案' : '切换秘密档案'}`}>{p.basics.name}</button> : p.basics.name}</h3>}
            {visibleBasic(p, "occupation") && (
              <p>{p.basics.occupation || "身份待记录"}</p>
            )}
          </div>
        </div>
        {p.quote && (
          <blockquote className="archive-quote">{p.quote}</blockquote>
        )}
        {p.summary && <ReadingText className="archive-summary" text={p.summary} />}
        <div className="dossier-grid">
          {Object.entries(basicLabels)
            .filter(
              ([key]) =>
                key !== "name" &&
                key !== "occupation" &&
                key !== "code" &&
                visibleBasic(p, key as keyof typeof basicLabels),
            )
            .map(([key, label]) => (
              <div key={key}>
                <span>{label}</span>
                <strong>
                  {dash(p.basics[key as keyof typeof basicLabels] ?? "")}
                </strong>
              </div>
            ))}
        </div>
        {p.customFields.length > 0 && (
          <div className="custom-fields">
            {p.customFields.map((f) => (
              <div key={f.id}>
                <span>{f.title}</span>
                <ReadingText text={f.text} />
              </div>
            ))}
          </div>
        )}
        {(p.display?.hideEmpty === false || p.appearance.trim()) && (
          <div className="prose-block">
            <small>APPEARANCE</small>
            <h3>外貌特征</h3>
            <ReadingText text={p.appearance || "尚未记录。"} />
          </div>
        )}
        <div className="folio-bottom">
          <span>IDENTITY & APPEARANCE</span>
          <span>01</span>
        </div>
      </section>
      <section className="paper-page">
        <div className="folio-top">
          <span>A HISTORY IN FRAGMENTS</span>
          <span>BACKGROUND</span>
        </div>
        {(p.display?.hideEmpty === false || p.personality.trim()) && (
          <div className="prose-block first">
            <small>PERSONALITY</small>
            <h3>性格侧写</h3>
            <ReadingText text={p.personality || "尚未记录。"} />
          </div>
        )}
        {(p.display?.hideEmpty === false || p.background.trim()) && (
          <div className="prose-block">
            <small>BACKGROUND</small>
            <h3>背景故事</h3>
            <ReadingText text={p.background || "故事等待被写下。"} />
          </div>
        )}
        {(p.display?.hideEmpty === false || p.events.length > 0) && (
          <div className="prose-block">
            <small>CHRONOLOGY</small>
            <h3>{hidden ? "事件记录" : "经历时间线"}</h3>
            <div className="timeline">
              {p.events.length ? (
                p.events.map((e) => (
                  <div key={e.id}>
                    <i />
                    <h4>{e.title}</h4>
                    <ReadingText text={e.text} />
                  </div>
                ))
              ) : (
                <p>暂无经历记录。</p>
              )}
            </div>
          </div>
        )}
        <Relationships items={p.relationships} characters={characters} currentId={currentId} onOpen={onOpenCharacter}/>
        <div className="folio-bottom">
          <span>PERSONAL HISTORY</span>
          <span>02</span>
        </div>
      </section>
    </>
  );
}
function NarrativeAbilities({ skills }: { skills: Skill[] }) {
  const [all, setAll] = useState(false);
  const [limit, setLimit] = useState(6);
  const rows = skills.filter((skill) => all || isProminentAbility(skill));
  return <div className="prose-block">
    <h3>技能、法术与专长</h3>
    <p className="coc-help">低阶和通用能力默认收起，重点能力始终显示。</p>
    <button className="text-button" onClick={() => { setAll(!all); setLimit(6); }}>{all ? "仅看精选能力" : `查看全部能力（${skills.length}）`}</button>
    {rows.slice(0, limit).map((skill) => <article className="relationship" key={skill.id}>
      <h4>{skill.featured ? "★ " : ""}{skill.title} <small>{({ skill: "技能", spell: "法术", specialty: "专长" })[skill.kind ?? "skill"]} · {skill.rank}</small></h4>
      <details><summary>查看说明</summary><p>{skill.text || "暂无说明"}</p></details>
    </article>)}
    {!rows.length && <p className="coc-help">暂无精选能力，可查看全部或在编辑时标记重点。</p>}
    {rows.length > limit && <button className="text-button" onClick={() => setLimit(limit + 6)}>再显示 6 项能力</button>}
  </div>;
}
function Skills({ p, hidden }: { p: Profile; hidden: boolean }) {
  return (
    <>
      <section className="paper-page">
        <div className="folio-top">
          <span>CAPABILITY ASSESSMENT</span>
          <span>02 / ABILITIES</span>
        </div>
        <SectionHeading
          n="02"
          title={hidden ? "能力评估" : "属性与技能"}
          en="CHARACTERISTICS & STATE"
        />
        <CocAttributes profile={p} />
        {p.attributes.length > 0 && (
          <div className="prose-block">
            <h3>自定义属性</h3>
            <div className="coc-attributes">
              {p.attributes.map((a) => (
                <div key={a.id}>
                  <span>{a.name}</span>
                  <ThresholdValue label={a.name} value={a.value} />
                </div>
              ))}
            </div>
          </div>
        )}
        {p.skills.length > 0 && (
          <NarrativeAbilities skills={p.skills} />
        )}
      </section>
      <section className="paper-page">
        <div className="folio-top">
          <span>SKILL REGISTER</span>
          <Sparkles size={16} />
        </div>
        <div className="subsection-intro">
          <small>CALL OF CTHULHU · 7TH EDITION</small>
          <h2>技能记录</h2>
        </div>
        <CocSkills profile={p} />
      </section>
    </>
  );
}
function Collection({
  p,
  hidden,
  onPreview,
}: {
  p: Profile;
  hidden: boolean;
  onPreview: (ref: string, caption: string) => void;
}) {
  return (
    <>
      <section className="paper-page">
        <div className="folio-top">
          <span>THINGS THEY KEEP</span>
          <span>03 / COLLECTION</span>
        </div>
        <SectionHeading
          n="03"
          title={hidden ? "物品登记" : "随身收藏"}
          en="OBJECTS WITH A STORY"
        />
        <div className="item-list">
          {p.items.length ? (
            p.items.map((item, i) => (
              <article key={item.id}>
                {item.image ? (
                  <Portrait
                    image={item.image}
                    onClick={() => onPreview(item.image, item.title)}
                    label={"查看 " + item.title}
                  />
                ) : (
                  <div className="item-symbol">
                    <Package size={27} strokeWidth={1} />
                  </div>
                )}
                <div>
                  <small>OBJECT {String(i + 1).padStart(2, "0")}</small>
                  <h3>{item.title}</h3>
                  <p>{item.text}</p>
                </div>
              </article>
            ))
          ) : (
            <Empty text="暂时没有收藏物品" />
          )}
        </div>
        <div className="folio-bottom">
          <span>PERSONAL EFFECTS</span>
          <span>05</span>
        </div>
      </section>
      <section className="paper-page">
        <div className="folio-top">
          <span>VISUAL ARCHIVE</span>
          <span>IMAGES & REFERENCES</span>
        </div>
        <div className="subsection-intro">
          <small>FRAGMENTS OF A LIFE</small>
          <h2>影像与设定</h2>
          <p>被留下的模样，与故事的其他切面。</p>
        </div>
        <div className="gallery-grid">
          {p.gallery.length ? (
            p.gallery.map((photo, i) => (
              <figure key={photo.id}>
                <Portrait
                  image={photo.image}
                  onClick={() => onPreview(photo.image, photo.caption)}
                  label={"放大 " + photo.caption}
                />
                <figcaption>
                  <span>FIG. {String(i + 1).padStart(2, "0")}</span>
                  <p>{photo.caption || "未命名图片"}</p>
                  <ArrowUpRight size={14} />
                </figcaption>
              </figure>
            ))
          ) : (
            <Empty text="还没有影像资料" />
          )}
        </div>
        <div className="folio-bottom">
          <span>CHARACTER VISUALS</span>
          <span>06</span>
        </div>
      </section>
    </>
  );
}
const areas = ["全部", "头部", "躯干", "左臂", "右臂", "左腿", "右腿"];
function BodyMap({
  active,
  onSelect,
  p,
}: {
  active: string;
  onSelect: (s: string) => void;
  p: Profile;
}) {
  const regions = [
    { area: "头部", x: 460, y: 275, w: 110, h: 155 },
    { area: "躯干", x: 395, y: 430, w: 235, h: 325 },
    { area: "左臂", x: 35, y: 435, w: 355, h: 100 },
    { area: "右臂", x: 635, y: 435, w: 355, h: 100 },
    { area: "左腿", x: 315, y: 755, w: 195, h: 490 },
    { area: "右腿", x: 515, y: 755, w: 195, h: 490 },
  ];  return (
    <svg
      className="body-map"
      viewBox="0 0 1025 1535"
      role="group"
      aria-label="身体部位选择"
    >
      <image href="/art/body-proportions.png" width="1025" height="1535" preserveAspectRatio="xMidYMid meet" />
      {regions.map((r) => {
        const matches = p.conditions.filter((c) => c.area === r.area);
        const danger = matches.some((c) => c.severity === "danger");
        return (
          <g
            key={r.area}
            tabIndex={0}
            role="button"
            aria-label={r.area}
            onClick={() => onSelect(active === r.area ? "全部" : r.area)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onSelect(active === r.area ? "全部" : r.area);
              }
            }}
            className={"body-region " + (active === r.area ? "selected" : "")}
          >
            <rect x={r.x} y={r.y} width={r.w} height={r.h} rx="15" />
            {matches.length > 0 && (
              <g className={danger ? "danger-marker" : "notice-marker"}>
                <circle
                  cx={r.x + r.w / 2}
                  cy={r.y + r.h / 2}
                  r="30"
                  opacity=".16"
                />
                <circle cx={r.x + r.w / 2} cy={r.y + r.h / 2} r="11" />
              </g>
            )}
          </g>
        );
      })}
    </svg>
  );
}
function Status({ p, hidden }: { p: Profile; hidden: boolean }) {
  const [area, setArea] = useState("全部");
  const [query, setQuery] = useState("");
  const availableAreas = [...new Set([...areas, ...p.conditions.map((c) => c.area).filter(Boolean)])];
  const selectedArea = availableAreas.includes(area) ? area : "全部";
  const search = query.trim().toLocaleLowerCase();
  const rows = p.conditions.filter(
    (c) => (selectedArea === "全部" || c.area === selectedArea || c.area === "全身") &&
      (!search || `${c.title} ${c.text} ${c.area}`.toLocaleLowerCase().includes(search)),
  );
  return (
    <>
      <section className="paper-page">
        <div className="folio-top">
          <span>PHYSICAL CONDITION</span>
          <span>04 / CONDITION</span>
        </div>
        <SectionHeading
          n="04"
          title={hidden ? "医疗与监测记录" : "身体状态"}
          en="A MOMENT IN THE STORY"
        />
        <div className="body-map-wrap">
          <BodyMap active={selectedArea} onSelect={setArea} p={p} />
          <span className="body-side-label">ANTERIOR VIEW · 点击部位查看</span>
        </div>
        <div className="status-footnote">
          <HeartPulse size={16} />
          <span>由作者记录 · 随当前剧情版本保存</span>
        </div>
        <div className="folio-bottom">
          <span>BODY STUDY / MANUAL RECORD</span>
          <span>07</span>
        </div>
      </section>
      <section className="paper-page">
        <div className="folio-top">
          <span>OBSERVATION NOTES</span>
          <span>{p.conditions.length} RECORDS</span>
        </div>
        <div className="subsection-intro">
          <small>CURRENT OBSERVATIONS</small>
          <h2>状态记录</h2>
          <p>{p.statusNote || "记录当前剧情阶段的伤势、特征与精神状态。"}</p>
        </div>
        <CocVitals profile={p} />
        <label className="field">
          <span>搜索状态记录</span>
          <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="标题、系统或记录内容" />
        </label>
        <div className="area-filter">
          {availableAreas.map((a) => (
            <button
              key={a}
              className={selectedArea === a ? "active" : ""}
              aria-pressed={selectedArea === a}
              onClick={() => setArea(a)}
            >
              {a}
            </button>
          ))}
        </div>
        <div className="condition-list">
          {rows.length ? (
            rows.map((c) => (
              <article key={c.id} className={"condition " + c.severity}>
                <span className="condition-icon">
                  {c.severity === "danger" ? (
                    <ShieldAlert size={17} />
                  ) : (
                    <HeartPulse size={17} />
                  )}
                </span>
                <div>
                  <div>
                    <h3>{c.title}</h3>
                    <small>{c.area}</small>
                  </div>
                  <p>{c.text}</p>
                  <span className="severity-label">
                    {c.severity === "stable"
                      ? "状态稳定"
                      : c.severity === "notice"
                        ? "需要关注"
                        : "重点观察"}
                  </span>
                </div>
              </article>
            ))
          ) : (
            <Empty
              text={search ? "没有匹配的状态记录" : selectedArea === "全部" ? "尚未记录身体状态" : "这个部位暂无记录"}
            />
          )}
        </div>
        <div className="folio-bottom">
          <span>STATE AT THIS CHAPTER</span>
          <span>08</span>
        </div>
      </section>
    </>
  );
}
export function BookPages({
  characters = [], currentId = "", onOpenCharacter, onToggleSecret,
  page,
  profile,
  hidden,
  onPreview,
}: {
  characters?: Character[]; currentId?: string; onOpenCharacter?: (c: Character) => void; onToggleSecret?: () => void;
  page: Page;
  profile: Profile;
  hidden: boolean;
  onPreview: (ref: string, caption: string) => void;
}) {
  switch (page) {
    case "archive":
      return <Archive p={profile} hidden={hidden} characters={characters} currentId={currentId} onOpenCharacter={onOpenCharacter} onPreview={onPreview} onToggleSecret={onToggleSecret}/>;
    case "skills":
      return <Skills p={profile} hidden={hidden} />;
    case "collection":
      return <Collection p={profile} hidden={hidden} onPreview={onPreview} />;
    case "status":
      return <Status p={profile} hidden={hidden} />;
  }
}
