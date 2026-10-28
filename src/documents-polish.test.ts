import { expect, it } from "vitest";
import {
  barcodeBars,
  createDocument,
  MAX_FIELD,
  mrzLines,
  orderDocuments,
  primaryDocument,
  secretDocumentView,
  validateDocuments,
} from "./documents";
import { createCharacter } from "./model";

const profile = () => {
  const p = structuredClone(createCharacter("公开名").versions[0].profile);
  p.basics.code = "PUB-1";
  return p;
};

it("身份证是主证件并排在最前；没有身份证时取第一张", () => {
  const p = profile();
  const work = createDocument("work", p, "w"),
    id = createDocument("identity", p, "i"),
    dl = createDocument("driver", p, "d");
  expect(primaryDocument([work, id, dl])?.id).toBe("i");
  expect(orderDocuments([work, id, dl]).map((d) => d.id)).toEqual([
    "i",
    "w",
    "d",
  ]);
  expect(primaryDocument([work, dl])?.id).toBe("w");
  expect(orderDocuments([])).toEqual([]);
});

it("秘密身份沿用公开证件时使用秘密姓名与身份编号，仅身份证替换编号", () => {
  const pub = profile(),
    sec = profile();
  sec.basics.name = "秘密名";
  sec.basics.code = "SEC-9";
  const docs = [
    createDocument("identity", pub, "i"),
    createDocument("passport", pub, "p"),
  ];
  docs[1].fields.number = "P-1";
  const view = secretDocumentView(docs, pub, sec);
  expect(view.map((d) => d.fields.holder)).toEqual(["秘密名", "秘密名"]);
  expect(view[0].fields.number).toBe("SEC-9");
  expect(view[1].fields.number).toBe("P-1");
  expect(docs[0].fields.holder).toBe("公开名");
});

it("机读码为两行 44 位且校验位正确，发证方为虚构 ATL", () => {
  const doc = createDocument("passport", profile(), "p");
  Object.assign(doc.fields, {
    romanName: "Lin Mi",
    number: "L898902C3",
    birthday: "1990-08-12",
    expires: "2032-01-02",
    gender: "女",
  });
  const [a, b] = mrzLines(doc);
  expect(a).toHaveLength(44);
  expect(b).toHaveLength(44);
  expect(a.startsWith("P<ATLLIN<<MI")).toBe(true);
  expect(b.slice(0, 10)).toBe("L898902C36");
  expect(b.slice(10, 13)).toBe("ATL");
  expect(b.slice(13, 20)).toBe("9008124");
  expect(b[20]).toBe("F");
});

it("条码装饰稳定可复现", () => {
  expect(barcodeBars("A-1")).toEqual(barcodeBars("A-1"));
  expect(barcodeBars("A-1")).not.toEqual(barcodeBars("A-2"));
  expect(barcodeBars("x").every((n) => n >= 1 && n <= 3)).toBe(true);
});

it("字段与名称有长度上限", () => {
  const doc = createDocument("other", profile(), "o");
  expect(() =>
    validateDocuments([
      { ...doc, fields: { notes: "x".repeat(MAX_FIELD + 1) } },
    ]),
  ).toThrow();
  expect(() =>
    validateDocuments([{ ...doc, title: "x".repeat(121) }]),
  ).toThrow();
  expect(() => validateDocuments([doc])).not.toThrow();
});
