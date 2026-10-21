import { zipSync, strToU8 } from "fflate";
import { basicLabels, defaultVersion, effectiveProfile, visibleBasic, type Basics, type Character, type Library, type Profile, type Version } from "../model";
import { characteristicLabels, derivedValues, isSelectedSkill, skillValue, thresholds, type Characteristic } from "../coc";
import { bodyTypeLabels } from "../body";

export type LinkStyle = "none" | "relative" | "wikilink";
export interface MarkdownOptions {
  /** 是否输出已启用的秘密身份（独立章节，标注非加密）。默认 false。 */
  includeSecret?: boolean;
  /** current：只导出 currentVersionId（缺省为默认版本）；all：所有剧情版本。 */
  versions?: "current" | "all";
  currentVersionId?: string;
  /** 关联角色的链接方式；只有提供 fileNames（整库导出）时才生效。 */
  linkStyle?: LinkStyle;
  fileNames?: Map<string, string>;
  /** 图片引用 → Markdown 中的相对路径；返回 undefined 表示不输出图片。 */
  assetPath?: (ref: string) => string | undefined;
  exportedAt?: string;
}

// ---------- 转义 ----------
/** 转义行内 Markdown 特殊字符；保留换行。 */
export function escapeInline(text: string): string {
  return text.replace(/[\\`*_{}[\]<>|~!#]/g, "\\$&");
}
/** 转义多行正文：行首的标题 / 列表 / 引用 / 有序列表 / 分隔线标记也会被转义，单换行保留为硬换行。 */
export function escapeBlock(text: string): string {
  return text.replace(/\r\n?/g, "\n").trim().split("\n").map((line) => {
    let out = escapeInline(line);
    out = out.replace(/^(\s*)([-+=])/, "$1\\$2").replace(/^(\s*)(\d+)([.)])/, "$1$2\\$3");
    return out;
  }).join("  \n").replace(/( {2}\n){2,}/g, "\n\n");
}
/** 表格单元格：转义并把换行合并为「 / 」。 */
export function escapeCell(text: string | number): string {
  return escapeInline(String(text)).replace(/\r?\n+/g, " / ");
}
const yaml = (v: string) => JSON.stringify(v); // JSON 字符串即合法 YAML 双引号标量

// ---------- 文件名 ----------
const reserved = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i;
export function sanitizeFileName(name: string): string {
  // eslint-disable-next-line no-control-regex -- 文件名需去掉控制字符
  let base = name.normalize("NFC").replace(/[\u0000-\u001f\u007f/\\:*?"<>|#[\]^]/g, " ").replace(/\s+/g, " ").trim().replace(/^\.+|\.+$/g, "").slice(0, 80).trim();
  if (!base) base = "未命名角色";
  // Windows checks device names before the first dot, even with multiple extensions.
  if (reserved.test(base.split(".")[0].trimEnd()) || base.toLowerCase() === "index") base = "_" + base;
  return base;
}
/** 为每个角色生成唯一文件名（不区分大小写去重，追加「 (2)」）。按书架顺序分配，结果稳定。 */
export function characterFileNames(characters: Character[]): Map<string, string> {
  const used = new Set<string>(["index"]);
  const out = new Map<string, string>();
  for (const c of characters) {
    const base = sanitizeFileName(c.name);
    let name = base, n = 2;
    while (used.has(name.toLowerCase())) name = `${base} (${n++})`;
    used.add(name.toLowerCase());
    out.set(c.id, name + ".md");
  }
  return out;
}

// ---------- 渲染 ----------
function linkTo(id: string | undefined, label: string, library: Library, o: MarkdownOptions): string {
  const target = id ? library.characters.find((c) => c.id === id) : undefined;
  const file = target && o.fileNames?.get(target.id);
  if (!target || !file || !o.linkStyle || o.linkStyle === "none") return escapeInline(label);
  if (o.linkStyle === "wikilink") return `[[${file.replace(/\.md$/, "").replace(/[|\]]/g, " ")}|${label.replace(/[|\]]/g, " ")}]]`;
  return `[${escapeInline(label)}](${encodeURI("./" + file).replace(/\(/g, "%28").replace(/\)/g, "%29")})`;
}
function image(ref: string, alt: string, o: MarkdownOptions): string {
  const path = ref && !ref.startsWith("builtin:") ? o.assetPath?.(ref) : undefined;
  return path ? `![${escapeInline(alt)}](${path})` : "";
}

type Section = { key: keyof Profile | "basics"; render: (p: Profile, h: string) => string };
function sectionList(library: Library, o: MarkdownOptions): Section[] {
  const prose = (key: keyof Profile, title: string): Section => ({ key, render: (p, h) => {
    const v = p[key];
    return typeof v === "string" && v.trim() ? `${h} ${title}\n\n${escapeBlock(v)}\n` : "";
  } });
  const entries = (key: "events" | "customFields", title: string): Section => ({ key, render: (p, h) => {
    const rows = p[key].filter((e) => e.title.trim() || e.text.trim());
    return rows.length ? `${h} ${title}\n\n` + rows.map((e) => `- **${escapeInline(e.title.trim() || "未命名")}**${e.text.trim() ? "  \n  " + escapeBlock(e.text).replace(/\n/g, "\n  ") : ""}`).join("\n") + "\n" : "";
  } });
  return [
    { key: "basics", render: (p, h) => {
      const keys = (Object.keys(basicLabels) as (keyof Basics)[]).filter((k) => visibleBasic(p, k));
      const portrait = image(p.portrait, "头像", o);
      if (!keys.length && !portrait) return "";
      return `${h} 基本信息\n\n${portrait ? portrait + "\n\n" : ""}` + (keys.length ? "| 项目 | 内容 |\n| --- | --- |\n" + keys.map((k) => `| ${basicLabels[k]} | ${escapeCell(p.basics[k]?.trim() || "—")} |`).join("\n") + "\n" : "");
    } },
    { key: "quote", render: (p, h) => (p.quote.trim() ? `${h} 引言\n\n> ${escapeBlock(p.quote).replace(/\n/g, "\n> ")}\n` : "") },
    prose("summary", "简介"),
    prose("appearance", "外貌"),
    prose("personality", "性格"),
    prose("background", "背景"),
    entries("events", "经历"),
    { key: "relationships", render: (p, h) => {
      const rows = p.relationships.filter((r) => r.title.trim() || r.text.trim() || r.targetCharacterId);
      if (!rows.length) return "";
      return `${h} 人际关系\n\n` + rows.map((r) => {
        const target = library.characters.find((c) => c.id === r.targetCharacterId);
        const who = target ? "（" + linkTo(target.id, target.name, library, o) + "）" : "";
        return `- **${escapeInline(r.title.trim() || target?.name || "未命名关系")}**${who}${r.text.trim() ? "  \n  " + escapeBlock(r.text).replace(/\n/g, "\n  ") : ""}`;
      }).join("\n") + "\n";
    } },
    entries("customFields", "自由主题"),
    { key: "attributes", render: (p, h) => p.attributes.length ? `${h} 自定义属性\n\n| 属性 | 数值 |\n| --- | --- |\n` + p.attributes.map((a) => `| ${escapeCell(a.name)} | ${a.value} |`).join("\n") + "\n" : "" },
    { key: "skills", render: (p, h) => {
      const rows = p.skills.filter((s) => s.title.trim() || s.text.trim());
      const kinds = { skill: "技能", spell: "法术", specialty: "专长" } as const;
      return rows.length ? `${h} 能力\n\n` + rows.map((s) => `- **${escapeInline(s.title.trim() || "未命名")}**（${kinds[s.kind ?? "skill"]}${s.rank.trim() ? " · " + escapeInline(s.rank.trim()) : ""}）${s.text.trim() ? "  \n  " + escapeBlock(s.text).replace(/\n/g, "\n  ") : ""}`).join("\n") + "\n" : "";
    } },
    { key: "coc", render: (p, h) => {
      const sheet = p.coc; if (!sheet) return "";
      const d = derivedValues(sheet, p.basics.age);
      const chars = (Object.keys(characteristicLabels) as Characteristic[]);
      const skills = sheet.skills.filter(isSelectedSkill);
      let out = `${h} CoC 第七版数值\n\n| 属性 | 数值 | 困难 | 极难 |\n| --- | --- | --- | --- |\n` +
        chars.map((k) => { const v = sheet.characteristics[k]; const t = thresholds(v); return `| ${characteristicLabels[k]} ${k} | ${v} | ${t.hard} | ${t.extreme} |`; }).join("\n") + "\n\n" +
        `| HP | MP | SAN | 幸运 | MOV | 伤害加值 | 体格 |\n| --- | --- | --- | --- | --- | --- | --- |\n` +
        `| ${sheet.state.hp} / ${d.hp} | ${sheet.state.mp} / ${d.mp} | ${sheet.state.san} / ${d.san} | ${sheet.state.luck} | ${d.mov} | ${escapeCell(d.db)} | ${d.build} |\n`;
      if (skills.length) out += `\n| 技能 | 数值 | 困难 | 极难 | 备注 |\n| --- | --- | --- | --- | --- |\n` + skills.map((s) => {
        const v = skillValue(s, sheet), t = thresholds(v);
        return `| ${escapeCell(s.name + (s.specialization ? "（" + s.specialization + "）" : ""))} | ${v} | ${t.hard} | ${t.extreme} | ${escapeCell(s.notes)} |`;
      }).join("\n") + "\n";
      return out;
    } },
    { key: "items", render: (p, h) => {
      const rows = p.items.filter((i) => i.title.trim() || i.text.trim() || i.image);
      return rows.length ? `${h} 物品\n\n` + rows.map((i) => { const img = image(i.image, i.title || "物品", o); return `- **${escapeInline(i.title.trim() || "未命名物品")}**${i.text.trim() ? "  \n  " + escapeBlock(i.text).replace(/\n/g, "\n  ") : ""}${img ? "  \n  " + img : ""}`; }).join("\n") + "\n" : "";
    } },
    { key: "gallery", render: (p, h) => {
      const rows = p.gallery.filter((g) => g.caption.trim() || image(g.image, "", o));
      return rows.length ? `${h} 影像\n\n` + rows.map((g) => { const img = image(g.image, g.caption || "影像", o); return `- ${img ? img + " " : ""}${escapeInline(g.caption.trim())}`.trimEnd(); }).join("\n") + "\n" : "";
    } },
    { key: "conditions", render: (p, h) => {
      const sev = { stable: "状态稳定", notice: "需要关注", danger: "重点观察" } as const;
      const note = p.statusNote.trim() ? escapeBlock(p.statusNote) + "\n\n" : "";
      const rows = p.conditions.filter((c) => c.title.trim() || c.text.trim());
      if (!note && !rows.length) return "";
      return `${h} 身体状态\n\n${note}` + (rows.length ? "| 部位 | 状态 | 级别 | 说明 |\n| --- | --- | --- | --- |\n" + rows.map((c) => `| ${escapeCell(c.area || "—")} | ${escapeCell(c.title)} | ${sev[c.severity]} | ${escapeCell(c.text)} |`).join("\n") + "\n" : "");
    } },
    { key: "body", render: (p, h) => {
      const b = p.body; if (!b) return "";
      const morphs = Object.entries(b.morphs).filter(([, v]) => v !== 0);
      const imgs = [image(b.front, "正面", o), image(b.back, "背面", o)].filter(Boolean).join(" ");
      return `${h} 身体参数（body-validator）\n\n| 项目 | 数值 |\n| --- | --- |\n| 体型 | ${bodyTypeLabels[b.body_type]} |\n| 身高 | ${b.height_cm} cm |\n| 腿长 | ${b.leg_length} |\n| 头部比例 | ${b.head_scale} |\n` +
        (morphs.length ? `| 形变 | ${morphs.map(([k, v]) => `${escapeCell(k)} ${v}`).join("、")} |\n` : "") +
        (b.notes.trim() ? `\n${escapeBlock(b.notes)}\n` : "") + (imgs ? `\n${imgs}\n` : "");
    } },
  ];
}

function renderProfile(p: Profile, level: number, library: Library, o: MarkdownOptions, only?: Set<string>): string {
  const h = "#".repeat(level);
  return sectionList(library, o).filter((s) => !only || only.has(s.key)).map((s) => s.render(p, h)).filter(Boolean).join("\n");
}
function renderVersion(v: Version, level: number, library: Library, o: MarkdownOptions): string {
  let out = renderProfile(effectiveProfile(v, false), level, library, o);
  if (o.includeSecret && v.secret.enabled) {
    const keys = new Set(Object.keys(v.secret.overrides));
    // Portrait and basic-field visibility are rendered inside the basics section.
    if (keys.has("portrait") || keys.has("display")) keys.add("basics");
    if (keys.has("statusNote")) keys.add("conditions");
    const h = "#".repeat(level);
    const body = renderProfile(effectiveProfile(v, true), level + 1, library, o, keys);
    out += `\n${h} 秘密身份：${escapeInline(v.secret.label || "秘密档案")}\n\n> ⚠️ 以下为秘密档案内容。叙册的秘密身份只是叙事展示，**不是加密**；分享此文件即公开这些内容。\n\n` + (body || "（未覆盖任何字段，内容与表层相同）\n");
  }
  return out;
}

/** 将一位角色导出为 Markdown。默认只导出默认版本的表层资料。 */
export function characterToMarkdown(c: Character, library: Library, o: MarkdownOptions = {}): string {
  const all = o.versions === "all";
  const current = c.versions.find((v) => v.id === o.currentVersionId) ?? defaultVersion(c);
  const versions = all ? c.versions : [current];
  const fm = ["---", `name: ${yaml(c.name)}`, `world: ${yaml(c.collection)}`, `group: ${yaml(c.collection || "未分类")}`,
    `favorite: ${c.favorite}`, all ? `versions: [${versions.map((v) => yaml(v.name)).join(", ")}]` : `version: ${yaml(current.name)}`,
    `exported_at: ${yaml(o.exportedAt ?? new Date().toISOString())}`, `includes_secret: ${Boolean(o.includeSecret)}`, "generator: \"叙册 Character Atlas\"", "---", ""].join("\n");
  let out = fm + `\n# ${escapeInline(c.name)}\n\n`;
  const meta = [c.collection && `世界观：${escapeInline(c.collection)}`, !all && `剧情版本：${escapeInline(current.name)}`, !all && current.date && `剧情时间：${escapeInline(current.date)}`].filter(Boolean);
  if (meta.length) out += meta.join(" · ") + "\n\n";
  if (!all) {
    if (current.note.trim()) out += `> ${escapeBlock(current.note).replace(/\n/g, "\n> ")}\n\n`;
    out += renderVersion(current, 2, library, o);
  } else {
    out += versions.map((v) => `## 版本：${escapeInline(v.name)}${v.id === defaultVersion(c).id ? "（默认）" : ""}\n\n` +
      [v.date && `剧情时间：${escapeInline(v.date)}`, v.note.trim() && escapeBlock(v.note)].filter(Boolean).map((x) => x + "\n\n").join("") +
      renderVersion(v, 3, library, o)).join("\n");
  }
  return out.replace(/\n{3,}/g, "\n\n").trimEnd() + "\n";
}

/** 整库导出：每位角色一个 .md、index.md，引用到的图片复制到 assets/。 */
export async function libraryToMarkdownZip(library: Library, o: Omit<MarkdownOptions, "fileNames" | "assetPath"> & { readAsset: (ref: string) => Promise<Uint8Array> }): Promise<Uint8Array> {
  const fileNames = characterFileNames(library.characters);
  const exportedAt = o.exportedAt ?? new Date().toISOString();
  const used = new Set<string>();
  const options: MarkdownOptions = { ...o, exportedAt, fileNames, linkStyle: o.linkStyle ?? "relative", assetPath: (ref) => { used.add(ref); return "assets/" + ref; } };
  const files: Record<string, Uint8Array> = {};
  for (const c of library.characters) files[fileNames.get(c.id)!] = strToU8(characterToMarkdown(c, library, options));
  const missing: string[] = [];
  for (const ref of used) {
    try { files["assets/" + ref] = await o.readAsset(ref); } catch { missing.push(ref); }
  }
  const groups = new Map<string, Character[]>();
  for (const c of library.characters) groups.set(c.collection || "未分类", [...(groups.get(c.collection || "未分类") ?? []), c]);
  let index = `---\ntitle: "叙册角色索引"\nexported_at: ${yaml(exportedAt)}\nincludes_secret: ${Boolean(o.includeSecret)}\ncharacters: ${library.characters.length}\n---\n\n# 叙册角色索引\n\n`;
  if (o.includeSecret) index += "> ⚠️ 本导出包含秘密档案内容。秘密身份不是加密，请谨慎分享。\n\n";
  for (const [g, list] of groups) index += `## ${escapeInline(g)}\n\n` + list.map((c) => `- ${linkTo(c.id, c.name, library, options)}`).join("\n") + "\n\n";
  if (missing.length) index += `> 以下图片读取失败，未包含：${missing.map(escapeInline).join("、")}\n`;
  files["index.md"] = strToU8(index.trimEnd() + "\n");
  return zipSync(files, { level: 6 });
}
