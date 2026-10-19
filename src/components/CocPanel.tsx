import { useState } from "react";
import {
  blankCoc,
  characteristicLabels,
  derivedValues,
  skillBase,
  skillValue,
  skillCatalog,
  isSelectedSkill,
  thresholds,
  type CocPatch,
  type CocSheet,
  type CocSkill,
} from "../coc";
import type { Profile } from "../model";
export function ThresholdValue({
  value,
  label,
}: {
  value: number;
  label: string;
}) {
  const [open, setOpen] = useState(false);
  const { hard, extreme } = thresholds(value);
  return (
    <span className="threshold-value">
      <button
        type="button"
        aria-label={`${label} 常规 ${value}`}
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        {value}
      </button>
      {open && (
        <small>
          困难 <b>{hard}</b> · 极难 <b>{extreme}</b>
        </small>
      )}
    </span>
  );
}
export function CocVitals({ profile }: { profile: Profile }) {
  const c = profile.coc ?? blankCoc(),
    d = derivedValues(c, profile.basics.age);
  return (
    <div className="coc-vitals" aria-label="当前身体数值">
      {(
        [
          ["HP", c.state.hp, d.hp],
          ["MP", c.state.mp, d.mp],
          ["SAN", c.state.san, d.san],
        ] as const
      ).map(([name, value, max]) => (
        <div key={name}>
          <small>{name}</small>
          <strong>
            {value}
            <span> / {max}</span>
          </strong>
        </div>
      ))}
      <div>
        <small>幸运</small>
        <ThresholdValue value={c.state.luck} label="幸运" />
      </div>
    </div>
  );
}
export function CocAttributes({ profile }: { profile: Profile }) {
  const c = profile.coc ?? blankCoc(),
    d = derivedValues(c, profile.basics.age);
  return (
    <>
      <p className="coc-help">CoC 7 · 点击数值查看困难与极难</p>
      <div className="coc-attributes">
        {Object.entries(characteristicLabels).map(([key, name]) => (
          <div key={key}>
            <span>
              <small>{key}</small>
              {name}
            </span>
            <ThresholdValue
              value={
                c.characteristics[key as keyof typeof characteristicLabels]
              }
              label={name}
            />
          </div>
        ))}
      </div>
      <CocVitals profile={profile} />
      <div className="coc-derived">
        <div>
          移动率 <b>{d.mov}</b>
        </div>
        <div>
          伤害加值 <b>{d.db}</b>
        </div>
        <div>
          体格 <b>{d.build}</b>
        </div>
      </div>
    </>
  );
}
export function CocSkills({ profile }: { profile: Profile }) {
  const [filter, setFilter] = useState("recommended"),
    [limit, setLimit] = useState(8);
  const c = profile.coc ?? blankCoc();
  const skills = c.skills.filter(
    (s) =>
      isSelectedSkill(s) &&
      (filter === "all" ||
        (filter === "featured"
          ? s.featured
          : s.featured || (!s.common && skillValue(s, c) >= 50 && skillValue(s, c) > skillBase(s, c)))),
  );
  return (
    <div className="coc-skills">
      <p className="coc-help">默认展示重点技能，或数值至少 50 且高于基础值的非通用技能。可切换全部查看。</p>
      <div className="coc-filters">
        {[
          ["recommended", "精选技能"],
          ["all", "全部已选"],
          ["featured", "重点"],
        ].map(([key, text]) => (
          <button
            key={key}
            aria-pressed={filter === key}
            onClick={() => { setFilter(key); setLimit(8); }}
          >
            {text}
          </button>
        ))}
      </div>
      <div className="coc-skill-rows">
        {skills.slice(0, limit).map((s) => (
          <div className="coc-skill-row" key={s.id}>
            <div>
              <span>
                {s.featured && "★ "}
                {s.name}
                {s.specialization && `（${s.specialization}）`}
              </span>
              <small>
                基础 {skillBase(s, c)}
                {skillCatalog.find((v) => v.key === s.key)?.modern
                  ? " · 现代"
                  : ""}
                {s.notes && ` · ${s.notes}`}
              </small>
            </div>
            <ThresholdValue
              value={skillValue(s, c)}
              label={`${s.name}${s.specialization}`}
            />
          </div>
        ))}
        {!skills.length && <p className="coc-help">没有符合条件的技能。</p>}
        {skills.length > limit && <button className="button small" onClick={() => setLimit(limit + 8)}>再显示 8 项（剩余 {skills.length - limit} 项）</button>}
      </div>
    </div>
  );
}
function Numeric({
  label,
  value,
  onChange,
  min = 0,
  placeholder,
}: {
  label: string;
  value: number | null;
  onChange: (v: number | null) => void;
  min?: number;
  placeholder?: string;
}) {
  return (
    <label>
      {label}
      <input
        type="number"
        min={min}
        max={9999}
        step="1"
        value={value ?? ""}
        placeholder={placeholder}
        onChange={(e) => {
          if (!e.target.value) onChange(null);
          else {
            const v = Number(e.target.value);
            if (Number.isFinite(v))
              onChange(Math.max(min, Math.min(9999, Math.trunc(v))));
          }
        }}
      />
    </label>
  );
}
export function CocStateEditor({
  sheet,
  onPatch,
}: {
  sheet: CocSheet;
  onPatch: (patch: CocPatch) => void;
}) {
  return (
    <div className="coc-editor-grid">
      {Object.entries({
        hp: "当前 HP",
        mp: "当前 MP",
        san: "当前 SAN",
        luck: "幸运",
      }).map(([key, label]) => (
        <Numeric
          key={key}
          label={label}
          value={sheet.state[key as keyof typeof sheet.state]}
          onChange={(v) => onPatch({ state: { [key]: v ?? 0 } })}
        />
      ))}
    </div>
  );
}
export function CocEditor({
  profile,
  onPatch,
}: {
  profile: Profile;
  onPatch: (patch: CocPatch) => void;
}) {
  const sheet = profile.coc ?? blankCoc(),
    d = derivedValues(sheet, profile.basics.age);
  const [query, setQuery] = useState("");
  const [adding, setAdding] = useState(false);
  const [candidate, setCandidate] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);
  const candidates = query.trim() ? blankCoc().skills.filter((s) =>
    `${s.name} ${s.specialization}`.includes(query.trim()) && !sheet.skills.some((existing) => existing.key === s.key && isSelectedSkill(existing))
  ).slice(0, 8) : [];
  const editSkill = (id: string, patch: Partial<CocSkill>) =>
    onPatch({
      skills: sheet.skills.map((s) => (s.id === id ? { ...s, ...patch } : s)),
    });
  return (
    <div className="coc-editor">
      <h3>CoC 7 属性</h3>
      <div className="coc-editor-grid">
        {Object.entries(characteristicLabels).map(([key, name]) => (
          <Numeric
            key={key}
            label={`${name} ${key}`}
            value={
              sheet.characteristics[key as keyof typeof characteristicLabels]
            }
            onChange={(v) => onPatch({ characteristics: { [key]: v ?? 0 } })}
          />
        ))}
      </div>
      <h3>当前状态</h3>
      <p className="editor-help">
        当前值独立保存，修改属性不会恢复 HP、MP 或
        SAN。身体状态页使用同一份记录。
      </p>
      <CocStateEditor sheet={sheet} onPatch={onPatch} />
      <h3>衍生值覆盖</h3>
      <p className="editor-help">
        留空即自动计算；特殊角色可以手动覆盖上限、移动率、伤害加值和体格。年龄为数字时参与移动率计算。
      </p>
      <div className="coc-editor-grid">
        {Object.entries({
          hp: "HP 上限",
          mp: "MP 上限",
          san: "SAN 上限",
          mov: "移动率",
          build: "体格",
        }).map(([key, label]) => (
          <Numeric
            key={key}
            min={key === "build" ? -9999 : 0}
            label={label}
            value={
              sheet.overrides[
                key as Exclude<keyof typeof sheet.overrides, "db">
              ]
            }
            placeholder={`自动：${d[key as Exclude<keyof typeof d, "db">]}`}
            onChange={(v) => onPatch({ overrides: { [key]: v } })}
          />
        ))}
        <label>
          伤害加值
          <input
            value={sheet.overrides.db ?? ""}
            maxLength={80}
            placeholder={`自动：${d.db}`}
            onChange={(e) =>
              onPatch({ overrides: { db: e.target.value || null } })
            }
          />
        </label>
      </div>
      <h3>数值技能</h3>
      <p className="editor-help">
        数值留空时跟随基础值。闪避跟随 DEX，母语跟随
        EDU；“基础覆盖”留空使用规则默认。搜索后选取并添加，已选技能点击标题展开编辑。
      </p>
      <button type="button" className="button small" onClick={() => { setAdding(!adding); setQuery(""); setCandidate(""); }}>{adding ? "取消添加技能" : "添加技能或专长"}</button>
      {adding && <input
        type="search"
        aria-label="编辑器搜索技能"
        value={query}
        placeholder="搜索技能后选取并添加…"
        onChange={(e) => { setQuery(e.target.value); setCandidate(""); }}
      />}
      {adding && query.trim() && <div className="skill-picker">
        <label>选取技能<select aria-label="选取技能" value={candidate} onChange={(e) => setCandidate(e.target.value)}>
          <option value="">请选择搜索结果</option>
          {candidates.map((s) => <option key={s.key} value={s.key}>{s.name}{s.specialization ? ` · ${s.specialization}` : ""}</option>)}
        </select></label>
        <button type="button" className="button small" disabled={!candidate} onClick={() => {
          const template = candidates.find((s) => s.key === candidate);
          if (!template) return;
          const previous = sheet.skills.find((s) => s.key === candidate);
          const added = { ...(previous ?? template), selected: true };
          onPatch({ skills: previous ? sheet.skills.map((s) => s.id === previous.id ? added : s) : [...sheet.skills, added] });
          setExpanded(added.id); setCandidate(""); setQuery(""); setAdding(false);
        }}>添加选中技能</button>
        {!candidates.length && <p className="editor-help">没有可添加的匹配技能，可更换关键词或添加自定义技能。</p>}
      </div>}
      <div className="coc-edit-skills">
        {sheet.skills
          .filter(isSelectedSkill)
          .map((s) => (
            <details key={s.id} open={expanded === s.id}>
              <summary onClick={(e) => { e.preventDefault(); setExpanded(expanded === s.id ? null : s.id); }}>
                {s.name}
                {s.specialization && ` · ${s.specialization}`}
                <span> · {skillValue(s, sheet)}</span>
              </summary>
              <div className="coc-editor-grid">
                <label>
                  技能名称
                  <input
                    value={s.name}
                    onChange={(e) => editSkill(s.id, { name: e.target.value })}
                  />
                </label>
                <label>
                  专长
                  <input
                    value={s.specialization}
                    onChange={(e) =>
                      editSkill(s.id, { specialization: e.target.value })
                    }
                  />
                </label>
                <Numeric
                  label="基础覆盖"
                  value={s.base}
                  placeholder={String(skillBase({ ...s, base: null }, sheet))}
                  onChange={(v) => editSkill(s.id, { base: v })}
                />
                <Numeric
                  label="常规值"
                  value={s.value}
                  placeholder={`基础：${skillBase(s, sheet)}`}
                  onChange={(v) => editSkill(s.id, { value: v })}
                />
              </div>
              <label>
                备注
                <input
                  value={s.notes}
                  onChange={(e) => editSkill(s.id, { notes: e.target.value })}
                />
              </label>
              <div className="coc-edit-actions">
                <label><input type="checkbox" checked={s.common ?? false} onChange={(e) => editSkill(s.id, { common: e.target.checked })} /> 通用技能（默认收起）</label>
                <label>
                  <input
                    type="checkbox"
                    checked={s.featured}
                    onChange={(e) =>
                      editSkill(s.id, { featured: e.target.checked })
                    }
                  />{" "}
                  重点技能
                </label>
                <button
                  type="button"
                  onClick={() =>
                    onPatch({
                      skills: [
                        ...sheet.skills,
                        {
                          ...s,
                          id: crypto.randomUUID(),
                          specialization: "新专长",
                          value: null,
                          featured: false,
                          selected: true,
                        },
                      ],
                    })
                  }
                >
                  添加专长
                </button>
                {(
                  <button
                    type="button"
                    onClick={() =>
                      onPatch({
                        skills: sheet.skills.filter((v) => v.id !== s.id),
                      })
                    }
                  >
                    移除此项
                  </button>
                )}
              </div>
            </details>
          ))}
      </div>
      <button
        type="button"
        className="secondary-button"
        onClick={() => {
          setQuery("");
          const id = crypto.randomUUID();
          setExpanded(id);
          onPatch({
            skills: [
              ...sheet.skills,
              {
                id,
                selected: true,
                key: "custom",
                name: "自定义技能",
                specialization: "",
                base: 0,
                value: null,
                featured: false,
                notes: "",
              },
            ],
          });
        }}
      >
        ＋ 自定义数值技能
      </button>
    </div>
  );
}
