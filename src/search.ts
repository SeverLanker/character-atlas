import { basicLabels, type Library, type Page, type Overrides } from "./model";
import { characteristicLabels, isSelectedSkill } from "./coc";
import { documentTemplates } from "./documents";

export interface SearchDocument { characterId: string; name: string; versionId: string; versionName: string; page: Page; hidden: boolean; field: string; text: string }
export interface SearchHit extends SearchDocument { snippet: string }
export function buildSearchIndex(library: Library, includeSecret = false): SearchDocument[] {
  const docs: SearchDocument[] = [];
  const names = new Map(library.characters.map(c => [c.id, c.name]));
  for (const character of library.characters) {
    for (const version of character.versions) {
      function add(text: unknown, field: string, page: Page, hidden: boolean) {
        if (typeof text === "string" && text.trim()) docs.push({ characterId: character.id, name: character.name, versionId: version.id, versionName: version.name, page, hidden, field, text });
      }
      function profileDocs(profile: Overrides, hidden: boolean) {
        for (const doc of profile.documents ?? []) add([doc.title, documentTemplates[doc.type].name, ...documentTemplates[doc.type].fields.map(key => doc.fields[key]), doc.fields.notes].filter(Boolean).join(' · '), '证件', 'archive', hidden);
        for (const relation of profile.relationships ?? []) {
          if (relation.targetCharacterId) add(names.get(relation.targetCharacterId), '关联角色', 'archive', hidden);
        }
        for (const [key, text] of Object.entries(profile.basics ?? {})) add(text, basicLabels[key as keyof typeof basicLabels] ?? key, "archive", hidden);
        for (const [key, field] of Object.entries({ quote: "引言", summary: "简介", personality: "性格", appearance: "外貌", background: "背景", statusNote: "状态备注" }))
          add(profile[key as keyof Overrides], field, key === "statusNote" ? "status" : "archive", hidden);
        for (const [key, field, page] of [
          ["events", "经历", "archive"], ["relationships", "关系", "archive"], ["customFields", "自定义字段", "archive"],
          ["skills", "能力", "skills"], ["items", "物品", "collection"], ["conditions", "状态记录", "status"],
        ] as const) for (const entry of profile[key] ?? []) add([entry.title, entry.text, "rank" in entry ? entry.rank : "", "area" in entry ? entry.area : ""].filter(Boolean).join(" · "), field, page, hidden);
        for (const photo of profile.gallery ?? []) add(photo.caption, "影像说明", "collection", hidden);
        for (const attr of profile.attributes ?? []) add(`${attr.name} ${attr.value}`, "自定义属性", "skills", hidden);
        for (const skill of (profile.coc?.skills ?? []).filter(isSelectedSkill)) add([skill.name, skill.specialization, skill.notes, skill.value ?? ""].filter((v) => v !== "").join(" · "), "数值技能", "skills", hidden);
        for (const [key, value] of Object.entries(profile.coc?.characteristics ?? {})) add(`${characteristicLabels[key as keyof typeof characteristicLabels]} ${value}`, "CoC 属性", "skills", hidden);
        for (const [key, value] of Object.entries(profile.coc?.state ?? {})) add(`${key.toUpperCase()} ${value}`, "当前状态数值", "status", hidden);
      }
      add(character.name, "管理名", "archive", false); add(character.collection, "世界观", "archive", false);
      add(version.name, "剧情版本", "archive", false); add(version.date, "剧情时间", "archive", false); add(version.note, "版本备注", "archive", false);
      profileDocs(version.profile, false);
      if (includeSecret && version.secret.enabled) {
        add(version.secret.label, "秘密档案标题", "archive", true);
        profileDocs(version.secret.overrides, true);
      }
    }
  }
  return docs;
}
export function searchDocuments(docs: SearchDocument[], query: string): { characterId: string; name: string; hits: SearchHit[]; total: number }[] {
  const needle = query.trim().toLocaleLowerCase();
  if (!needle) return [];
  const groups = new Map<string, { characterId: string; name: string; hits: SearchHit[]; total: number }>();
  for (const doc of docs) {
    const index = doc.text.toLocaleLowerCase().indexOf(needle);
    if (index < 0) continue;
    let group = groups.get(doc.characterId);
    if (!group) { group = { characterId: doc.characterId, name: doc.name, hits: [], total: 0 }; groups.set(doc.characterId, group); }
    group.total++;
    if (group.hits.length < 20) {
      const start = Math.max(0, index - 35), end = Math.min(doc.text.length, index + needle.length + 80);
      group.hits.push({ ...doc, snippet: (start ? "…" : "") + doc.text.slice(start, end) + (end < doc.text.length ? "…" : "") });
    }
  }
  return [...groups.values()];
}
