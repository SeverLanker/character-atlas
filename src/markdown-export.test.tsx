// @vitest-environment happy-dom
import "fake-indexeddb/auto";
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { strFromU8, unzipSync } from "fflate";
import { createCharacter, duplicateVersion, type Library } from "./model";
import { seedLibrary } from "./seed";
import { characterFileNames, characterToMarkdown, escapeBlock, escapeInline, libraryToMarkdownZip, sanitizeFileName } from "./export/markdown";
import { ExportMarkdownModal } from "./views/ExportMarkdownModal";

afterEach(cleanup);
const T = "2026-10-20T00:00:00.000Z";

function sample() {
  const a = createCharacter("林*弥", "雾港");
  const b = createCharacter("沈砚", "雾港");
  const v = a.versions[0];
  Object.assign(v.profile, {
    summary: "# 不是标题\n- 不是列表\n第二行 [链接](x) <b>",
    appearance: "银发 | 灰眼",
    background: "",
    events: [{ id: "e", title: "2019 · 失踪", text: "雨夜" }, { id: "e2", title: "", text: "" }],
    relationships: [{ id: "r", title: "搭档", text: "互相信任", targetCharacterId: b.id }, { id: "r2", title: "旧识", text: "", targetCharacterId: "missing" }],
    customFields: [{ id: "f", title: "口头禅", text: "嗯" }],
    attributes: [{ id: "a", name: "魅力", value: 7 }],
    skills: [{ id: "s", title: "开锁", text: "", rank: "精通", kind: "skill" as const }],
    items: [{ id: "i", title: "怀表", text: "停在三点", image: "watch_1.png" }],
    gallery: [{ id: "g", image: "pic_1.png", caption: "旧照" }],
    conditions: [{ id: "c", title: "刀伤", text: "缝合", area: "腹部", severity: "danger" as const }],
    statusNote: "需要休息",
    body: { schema: "bodyval.character/1" as const, name: "Lin", body_type: "adult_female" as const, height_cm: 167, leg_length: 0.2, head_scale: 1, morphs: { Body_Waist: 0.3, Body_Hip: 0 }, notes: "", front: "front_1.png", back: "" },
  });
  v.profile.basics.occupation = "修复师";
  v.profile.basics.blood = "";
  v.profile.display = { hideEmpty: true, hiddenBasics: ["code"] };
  v.secret.enabled = true;
  v.secret.label = "收容档案";
  v.secret.overrides = { basics: { name: "零号" }, background: "真实身份：实验体" };
  const later = duplicateVersion(v, "后期");
  later.profile.summary = "后期简介";
  later.secret.enabled = false;
  a.versions.push(later);
  const library: Library = { schemaVersion: 2, characters: [a, b, createCharacter("沈砚", "雾港")] };
  return { library, a, b };
}

describe("单角色 Markdown", () => {
  it("覆盖各字段并带 frontmatter，空字段与隐藏字段跳过", () => {
    const { library, a } = sample();
    const md = characterToMarkdown(a, library, { exportedAt: T });
    expect(md.startsWith("---\nname: \"林*弥\"\nworld: \"雾港\"\ngroup: \"雾港\"")).toBe(true);
    expect(md).toContain('version: "初始设定"');
    expect(md).toContain(`exported_at: "${T}"`);
    expect(md).toContain("includes_secret: false");
    for (const h of ["## 基本信息", "## 简介", "## 外貌", "## 经历", "## 人际关系", "## 自由主题", "## 自定义属性", "## 能力", "## CoC 第七版数值", "## 物品", "## 影像", "## 身体状态", "## 身体参数（body-validator）"]) expect(md).toContain(h);
    expect(md).not.toContain("## 背景");
    expect(md).not.toContain("血型");
    expect(md).not.toContain("身份编号");
    expect(md).toContain("| 身份 / 职业 | 修复师 |");
    expect(md).toContain("| 腹部 | 刀伤 | 重点观察 | 缝合 |");
    expect(md).toContain("Body\\_Waist 0.3");
    expect(md).not.toContain("Body_Hip");
    expect(md).toContain("| 力量 STR | 50 | 25 | 10 |");
    expect(md).not.toContain("![");
    expect(md).toContain("**搭档**（沈砚）");
  });
  it("hideEmpty=false 时显示空基础字段为 —", () => {
    const { library, a } = sample();
    a.versions[0].profile.display = { hideEmpty: false, hiddenBasics: [] };
    expect(characterToMarkdown(a, library)).toContain("| 血型 | — |");
  });
  it("转义 Markdown 特殊字符", () => {
    const { library, a } = sample();
    const md = characterToMarkdown(a, library);
    expect(md).toContain("# 林\\*弥");
    expect(md).toContain("\\# 不是标题");
    expect(md).toContain("\\- 不是列表");
    expect(md).toContain("\\[链接\\](x) \\<b\\>");
    expect(md).toContain("银发 \\| 灰眼");
    expect(escapeInline("a_b`c")).toBe("a\\_b\\`c");
    expect(escapeBlock("1. 一\n\n二")).toBe("1\\. 一\n\n二");
  });
  it("默认不导出秘密；勾选后为独立章节并标注非加密", () => {
    const { library, a } = sample();
    const pub = characterToMarkdown(a, library);
    expect(pub).not.toContain("零号");
    expect(pub).not.toContain("实验体");
    expect(pub).not.toContain("收容档案");
    const sec = characterToMarkdown(a, library, { includeSecret: true });
    expect(sec).toContain("## 秘密身份：收容档案");
    expect(sec).toContain("不是加密");
    expect(sec).toContain("### 背景\n\n真实身份：实验体");
    expect(sec).toContain("| 姓名 | 零号 |");
    expect(sec.indexOf("零号")).toBeGreaterThan(sec.indexOf("## 秘密身份"));
    expect(sec).not.toContain("### 物品");
  });
  it("只有秘密照片覆盖时，显式包含秘密才导出照片与对应章节", async () => {
    const { library, a } = sample();
    a.versions[0].secret.overrides = { portrait: "secret_only.png" };
    const readAsset = async () => new Uint8Array([1, 2, 3]);
    const publicFiles = unzipSync(await libraryToMarkdownZip(library, { readAsset }));
    expect(publicFiles["assets/secret_only.png"]).toBeUndefined();
    const secretFiles = unzipSync(await libraryToMarkdownZip(library, { includeSecret: true, readAsset }));
    expect(secretFiles["assets/secret_only.png"]).toEqual(new Uint8Array([1, 2, 3]));
    const md = strFromU8(secretFiles[characterFileNames(library.characters).get(a.id)!]);
    const chapter = md.slice(md.indexOf("## 秘密身份"));
    expect(chapter).toContain("![头像](assets/secret_only.png)");
    expect(chapter).not.toContain("未覆盖任何字段");
  });
  it("多版本：当前版本 / 所有版本", () => {
    const { library, a } = sample();
    expect(characterToMarkdown(a, library, { currentVersionId: a.versions[1].id })).toContain("后期简介");
    const all = characterToMarkdown(a, library, { versions: "all" });
    expect(all).toContain("## 版本：初始设定（默认）");
    expect(all).toContain("## 版本：后期");
    expect(all).toContain("### 简介");
    expect(all).toContain('versions: ["初始设定", "后期"]');
  });
});

describe("整库 ZIP", () => {
  it("文件名清洗去重", () => {
    expect(sanitizeFileName('a/b:c*?"<>|')).toBe("a b c");
    expect(sanitizeFileName("CON")).toBe("_CON");
    expect(sanitizeFileName("index")).toBe("_index");
    expect(sanitizeFileName("  ..  ")).toBe("未命名角色");
    const { library } = sample();
    expect([...characterFileNames(library.characters).values()]).toEqual(["林 弥.md", "沈砚.md", "沈砚 (2).md"]);
  });
  it("带扩展名的 Windows 设备名也能导出为可解压的文件名", async () => {
    const characters = ["CON.notes", "nul.backup", "LPT1.txt", "COM9.profile", "console.notes"].map(name => createCharacter(name));
    expect([...characterFileNames(characters).values()]).toEqual(["_CON.notes.md", "_nul.backup.md", "_LPT1.txt.md", "_COM9.profile.md", "console.notes.md"]);
    const files = unzipSync(await libraryToMarkdownZip({schemaVersion: 2, characters}, {readAsset: async () => new Uint8Array()}));
    expect(Object.keys(files)).toContain("_CON.notes.md");
    expect(Object.keys(files)).not.toContain("CON.notes.md");
    expect(strFromU8(files["index.md"])).toContain("./_CON.notes.md");
  });
  it("ZIP 含角色 md、index.md、图片，链接为相对路径或 wikilink", async () => {
    const { library } = sample();
    const read = async (ref: string) => { if (ref === "pic_1.png") throw new Error("missing"); return new Uint8Array([ref.length]); };
    const files = unzipSync(await libraryToMarkdownZip(library, { readAsset: read, exportedAt: T }));
    expect(Object.keys(files).sort()).toEqual(["assets/front_1.png", "assets/watch_1.png", "index.md", "林 弥.md", "沈砚 (2).md", "沈砚.md"].sort());
    const lin = strFromU8(files["林 弥.md"]);
    expect(lin).toContain("（[沈砚](./%E6%B2%88%E7%A0%9A.md)）");
    expect(lin).toContain("![怀表](assets/watch_1.png)");
    expect(lin).toContain("![正面](assets/front_1.png)");
    const index = strFromU8(files["index.md"]);
    expect(index).toContain("## 雾港");
    expect(index).toContain("[沈砚](./%E6%B2%88%E7%A0%9A%20%282%29.md)");
    expect(index).toContain("pic\\_1.png");
    expect(lin).not.toContain("零号");
    const wiki = unzipSync(await libraryToMarkdownZip(library, { readAsset: read, linkStyle: "wikilink" }));
    expect(strFromU8(wiki["林 弥.md"])).toContain("（[[沈砚|沈砚]]）");
    expect(strFromU8(wiki["index.md"])).toContain("[[沈砚 (2)|沈砚]]");
  });
  it("演示资料可导出", async () => {
    const lib = seedLibrary();
    const files = unzipSync(await libraryToMarkdownZip(lib, { readAsset: async () => new Uint8Array([1]) }));
    expect(Object.keys(files).filter((f) => f.endsWith(".md"))).toHaveLength(lib.characters.length + 1);
  });
});

it("导出对话框：勾选秘密时显示非加密提示", () => {
  const { library, a } = sample();
  render(<ExportMarkdownModal library={library} scope={{ kind: "character", character: a, versionId: a.versions[0].id }} beforeExport={async () => {}} onClose={() => {}} notify={() => {}} />);
  expect(screen.queryByText(/不是加密/)).toBeNull();
  fireEvent.click(screen.getByLabelText("包含秘密身份"));
  expect(screen.getByText(/不是加密/)).toBeTruthy();
  expect(screen.getByLabelText("所有版本")).toBeTruthy();
});
