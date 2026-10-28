import type { Basics, Profile } from "./model";

export const documentFieldLabels = {
  holder: "姓名",
  romanName: "外文姓名",
  number: "证件编号",
  gender: "性别",
  birthday: "出生日期",
  nationality: "国籍 / 地区",
  birthplace: "出生地",
  address: "住址",
  issuer: "签发机关",
  issued: "签发日期",
  expires: "有效期至",
  vehicleClass: "准驾车型",
  firstIssued: "初次领证日期",
  school: "学校",
  faculty: "院系",
  major: "专业",
  grade: "年级 / 班级",
  organization: "单位",
  department: "部门",
  position: "职务",
  rank: "警衔",
  notes: "备注",
} as const;
export type DocumentField = keyof typeof documentFieldLabels;
type Template = {
  name: string;
  en: string;
  numberLabel: string;
  fields: readonly DocumentField[];
};
export const documentTemplates = {
  identity: {
    name: "身份证",
    en: "IDENTITY CARD",
    numberLabel: "身份号码",
    fields: [
      "holder",
      "gender",
      "birthday",
      "nationality",
      "address",
      "number",
      "issuer",
      "issued",
      "expires",
    ],
  },
  driver: {
    name: "驾驶证",
    en: "DRIVING LICENCE",
    numberLabel: "驾驶证号",
    fields: [
      "holder",
      "gender",
      "birthday",
      "address",
      "number",
      "vehicleClass",
      "firstIssued",
      "issuer",
      "issued",
      "expires",
    ],
  },
  passport: {
    name: "护照",
    en: "PASSPORT",
    numberLabel: "护照号码",
    fields: [
      "holder",
      "romanName",
      "gender",
      "birthday",
      "nationality",
      "birthplace",
      "number",
      "issuer",
      "issued",
      "expires",
    ],
  },
  student: {
    name: "学生证",
    en: "STUDENT CARD",
    numberLabel: "学号",
    fields: [
      "holder",
      "gender",
      "birthday",
      "school",
      "faculty",
      "major",
      "grade",
      "number",
      "issued",
      "expires",
    ],
  },
  work: {
    name: "工作证",
    en: "STAFF CARD",
    numberLabel: "工号",
    fields: [
      "holder",
      "organization",
      "department",
      "position",
      "number",
      "issuer",
      "issued",
      "expires",
    ],
  },
  police: {
    name: "警官证",
    en: "POLICE OFFICER",
    numberLabel: "警号",
    fields: [
      "holder",
      "organization",
      "department",
      "rank",
      "position",
      "number",
      "issuer",
      "issued",
      "expires",
    ],
  },
  other: {
    name: "自定义证件",
    en: "PERSONAL DOCUMENT",
    numberLabel: "证件编号",
    fields: [
      "holder",
      "organization",
      "position",
      "number",
      "issuer",
      "issued",
      "expires",
    ],
  },
} as const satisfies Record<string, Template>;
export type DocumentType = keyof typeof documentTemplates;
export interface CharacterDocument {
  id: string;
  type: DocumentType;
  title: string;
  portrait: string;
  fields: Partial<Record<DocumentField, string>>;
}
export const MAX_DOCUMENTS = 100;
export function documentLabel(
  type: DocumentType,
  field: DocumentField,
): string {
  return field === "number"
    ? documentTemplates[type].numberLabel
    : documentFieldLabels[field];
}
export function createDocument(
  type: DocumentType,
  profile: Profile,
  id: string = crypto.randomUUID(),
): CharacterDocument {
  const read = (key: keyof Basics) =>
    profile.display?.hiddenBasics.includes(key)
      ? ""
      : (profile.basics[key] ?? "");
  const candidates: Partial<Record<DocumentField, string>> = {
    holder: read("name"),
    gender: read("gender"),
    birthday: read("birthday"),
    birthplace: read("birthplace"),
    address: read("residence"),
    organization: read("affiliation"),
    school: read("affiliation"),
    position: read("occupation"),
    // A driving licence, passport or staff number is not the character's identity number.
    ...(type === "identity" ? { number: read("code") } : {}),
  };
  const fields = Object.fromEntries(
    documentTemplates[type].fields
      .filter((key) => candidates[key])
      .map((key) => [key, candidates[key]]),
  );
  return {
    id,
    type,
    title: documentTemplates[type].name,
    portrait: profile.portrait,
    fields,
  };
}
/** Older profiles retain an identity preview until the first explicit document edit. [] means an empty wallet. */
export function profileDocuments(profile: Profile): CharacterDocument[] {
  return (
    profile.documents ?? [
      createDocument("identity", profile, "legacy-identity"),
    ]
  );
}
export function validateDocuments(
  value: unknown,
): asserts value is CharacterDocument[] {
  const object = (v: unknown): v is Record<string, unknown> =>
    !!v && typeof v === "object" && !Array.isArray(v);
  const check = (ok: unknown, text: string) => {
    if (!ok) throw new Error("证件资料无效：" + text);
  };
  if (!Array.isArray(value)) throw new Error("证件资料无效：需要证件列表");
  check(value.length <= MAX_DOCUMENTS, `每套最多 ${MAX_DOCUMENTS} 张`);
  const ids = new Set<string>();
  for (const doc of value) {
    if (!object(doc)) throw new Error("证件资料无效：条目不是对象");
    check(
      typeof doc.id === "string" &&
        doc.id.trim() &&
        doc.id.length <= 200 &&
        !ids.has(doc.id),
      "编号缺失或重复",
    );
    ids.add(doc.id as string);
    check(
      typeof doc.type === "string" &&
        Object.hasOwn(documentTemplates, doc.type),
      "未知证件类型",
    );
    check(
      typeof doc.title === "string" && doc.title.length <= 120,
      "名称必须是 120 字以内的文字",
    );
    check(
      typeof doc.portrait === "string" &&
        (!doc.portrait ||
          /^builtin:[0-2]$/.test(doc.portrait) ||
          /^[a-zA-Z0-9_-]+\.(png|jpg|jpeg|webp|gif)$/.test(doc.portrait)),
      "照片引用不合法",
    );
    check(
      object(doc.fields) &&
        Object.entries(doc.fields).every(
          ([key, text]) =>
            Object.hasOwn(documentFieldLabels, key) && typeof text === "string",
        ),
      "字段必须是已知的文字字段",
    );
  }
}
