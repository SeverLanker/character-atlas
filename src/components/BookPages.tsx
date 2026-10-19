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
import { basicLabels, visibleBasic, type Page, type Profile } from "../model";
import {
  CocAttributes,
  CocSkills,
  CocVitals,
  ThresholdValue,
} from "./CocPanel";
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
function Archive({ p, hidden }: { p: Profile; hidden: boolean }) {
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
          <Portrait image={p.portrait} />
          <div>
            {visibleBasic(p, "code") && <small>{p.basics.code}</small>}
            {visibleBasic(p, "name") && <h3>{p.basics.name}</h3>}
            {visibleBasic(p, "occupation") && (
              <p>{p.basics.occupation || "身份待记录"}</p>
            )}
          </div>
        </div>
        {p.quote && (
          <blockquote className="archive-quote">{p.quote}</blockquote>
        )}
        {p.summary && <p className="archive-summary">{p.summary}</p>}
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
                  {dash(p.basics[key as keyof typeof basicLabels])}
                </strong>
              </div>
            ))}
        </div>
        {p.customFields.length > 0 && (
          <div className="custom-fields">
            {p.customFields.map((f) => (
              <div key={f.id}>
                <span>{f.title}</span>
                <p>{f.text}</p>
              </div>
            ))}
          </div>
        )}
        {(p.display?.hideEmpty === false || p.appearance.trim()) && (
          <div className="prose-block">
            <small>APPEARANCE</small>
            <h3>外貌特征</h3>
            <p>{p.appearance || "尚未记录。"}</p>
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
            <p>{p.personality || "尚未记录。"}</p>
          </div>
        )}
        {(p.display?.hideEmpty === false || p.background.trim()) && (
          <div className="prose-block">
            <small>BACKGROUND</small>
            <h3>背景故事</h3>
            <p>{p.background || "故事等待被写下。"}</p>
          </div>
        )}
        {(p.display?.hideEmpty === false || p.events.length) && (
          <div className="prose-block">
            <small>CHRONOLOGY</small>
            <h3>{hidden ? "事件记录" : "经历时间线"}</h3>
            <div className="timeline">
              {p.events.length ? (
                p.events.map((e) => (
                  <div key={e.id}>
                    <i />
                    <h4>{e.title}</h4>
                    <p>{e.text}</p>
                  </div>
                ))
              ) : (
                <p>暂无经历记录。</p>
              )}
            </div>
          </div>
        )}
        {p.relationships.length > 0 && (
          <div className="prose-block">
            <small>CONNECTIONS</small>
            <h3>人际关系</h3>
            {p.relationships.map((e) => (
              <div key={e.id} className="relationship">
                <h4>{e.title}</h4>
                <p>{e.text}</p>
              </div>
            ))}
          </div>
        )}
        <div className="folio-bottom">
          <span>PERSONAL HISTORY</span>
          <span>02</span>
        </div>
      </section>
    </>
  );
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
          <div className="prose-block">
            <h3>叙事能力</h3>
            {p.skills.map((s) => (
              <article className="relationship" key={s.id}>
                <h4>
                  {s.title} <small>{s.rank}</small>
                </h4>
                <p>{s.text}</p>
              </article>
            ))}
          </div>
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
    { area: "头部", x: 105, y: 12, w: 70, h: 76 },
    { area: "躯干", x: 90, y: 90, w: 100, h: 137 },
    { area: "左臂", x: 37, y: 91, w: 51, h: 184 },
    { area: "右臂", x: 192, y: 91, w: 51, h: 184 },
    { area: "左腿", x: 87, y: 228, w: 51, h: 199 },
    { area: "右腿", x: 143, y: 228, w: 51, h: 199 },
  ];
  return (
    <svg
      className="body-map"
      viewBox="0 0 280 450"
      role="group"
      aria-label="身体部位选择"
    >
      <defs>
        <pattern
          id="body-grid"
          width="20"
          height="20"
          patternUnits="userSpaceOnUse"
        >
          <path
            d="M 20 0 L 0 0 0 20"
            fill="none"
            stroke="currentColor"
            strokeWidth=".3"
            opacity=".22"
          />
        </pattern>
      </defs>
      <rect width="280" height="450" fill="url(#body-grid)" />
      <line
        x1="140"
        x2="140"
        y1="0"
        y2="450"
        stroke="currentColor"
        strokeDasharray="3 5"
        opacity=".25"
      />
      <g className="body-outline">
        <ellipse cx="140" cy="48" rx="25" ry="32" />
        <path d="M128 79v16l-35 12-13 51-15 70-7 23 10 6 14-20 16-56 7-31 9 65-8 57 7 126-7 25 22 1 8-26 4-114 4 114 8 26 22-1-7-25 7-126-8-57 9-65 7 31 16 56 14 20 10-6-7-23-15-70-13-51-35-12V79" />
        <path
          d="M115 112q25 12 50 0m-47 74q22 12 44 0m-48 31q26-8 52 0M140 126v64"
          opacity=".35"
        />
      </g>
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
                  r="12"
                  opacity=".16"
                />
                <circle cx={r.x + r.w / 2} cy={r.y + r.h / 2} r="4" />
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
  const rows = p.conditions.filter(
    (c) => area === "全部" || c.area === area || c.area === "全身",
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
          <BodyMap active={area} onSelect={setArea} p={p} />
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
        <div className="area-filter">
          {areas.map((a) => (
            <button
              key={a}
              className={area === a ? "active" : ""}
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
              text={area === "全部" ? "尚未记录身体状态" : "这个部位暂无记录"}
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
  page,
  profile,
  hidden,
  onPreview,
}: {
  page: Page;
  profile: Profile;
  hidden: boolean;
  onPreview: (ref: string, caption: string) => void;
}) {
  switch (page) {
    case "archive":
      return <Archive p={profile} hidden={hidden} />;
    case "skills":
      return <Skills p={profile} hidden={hidden} />;
    case "collection":
      return <Collection p={profile} hidden={hidden} onPreview={onPreview} />;
    case "status":
      return <Status p={profile} hidden={hidden} />;
  }
}
