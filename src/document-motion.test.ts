// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import {
  bookletPages,
  canEnterFocus,
  isBookletType,
  isFocusGuardTarget,
  springSettled,
  springStep,
  tiltFromPointer,
} from "./document-motion";
import { createDocument, type CharacterDocument } from "./documents";
import { createCharacter } from "./model";

function makeDoc(
  type: CharacterDocument["type"],
  fields: CharacterDocument["fields"],
): CharacterDocument {
  const doc = createDocument(type, createCharacter("测试角色").versions[0].profile);
  return { ...doc, fields };
}

describe("springStep", () => {
  it("moves toward the target and slows down near it", () => {
    let value = 0;
    let velocity = 0;
    for (let i = 0; i < 120; i++) {
      const next = springStep(value, 10, velocity);
      value = next.value;
      velocity = next.velocity;
    }
    expect(value).toBeCloseTo(10, 1);
    expect(springSettled(value, 10, velocity)).toBe(true);
  });
  it("stays put when already at the target", () => {
    expect(springStep(4, 4, 0)).toEqual({ value: 4, velocity: 0 });
  });
  it("reports unsettled while still moving", () => {
    expect(springSettled(0, 10, 3)).toBe(false);
    expect(springSettled(9.999, 10, 0.001)).toBe(true);
  });
});

describe("tiltFromPointer", () => {
  it("is flat at the centre and tilts toward the pointer at the edges", () => {
    expect(tiltFromPointer(0.5, 0.5)).toEqual({
      rx: 0,
      ry: 0,
      lightX: 50,
      lightY: 50,
    });
    expect(tiltFromPointer(1, 0)).toEqual({
      rx: 3.5,
      ry: 4.5,
      lightX: 100,
      lightY: 0,
    });
    expect(tiltFromPointer(0, 1)).toEqual({
      rx: -3.5,
      ry: -4.5,
      lightX: 0,
      lightY: 100,
    });
  });
  it("clamps positions outside the card", () => {
    expect(tiltFromPointer(-2, 3).lightX).toBe(0);
    expect(tiltFromPointer(-2, 3).lightY).toBe(100);
  });
});

describe("isFocusGuardTarget", () => {
  it("guards buttons, links and form controls (incl. secret triggers)", () => {
    const root = document.createElement("div");
    root.innerHTML =
      `<button class="document-seal">印</button>` +
      `<button class="text-button">名</button>` +
      `<a href="#">链</a><input type="text">` +
      `<span class="plain">空白</span>`;
    document.body.append(root);
    for (const selector of [".document-seal", ".text-button", "a", "input"]) {
      expect(
        isFocusGuardTarget(root.querySelector(selector)),
      ).toBe(true);
    }
    expect(isFocusGuardTarget(root.querySelector(".plain"))).toBe(false);
    expect(isFocusGuardTarget(null)).toBe(false);
    root.remove();
  });
});

describe("canEnterFocus", () => {
  it("blocks entry while a confirm dialog is open", () => {
    expect(canEnterFocus(true)).toBe(false);
    expect(canEnterFocus(false)).toBe(true);
  });
});

describe("isBookletType", () => {
  it("treats passport and police as booklets, the rest as flat cards", () => {
    expect(isBookletType("passport")).toBe(true);
    expect(isBookletType("police")).toBe(true);
    for (const type of ["identity", "driver", "student", "work", "other"] as const) {
      expect(isBookletType(type)).toBe(false);
    }
  });
});

describe("bookletPages", () => {
  const passportFields = {
    holder: "浅上京子",
    romanName: "KYOKO ASAGAMI",
    gender: "女",
    birthday: "2000-01-01",
    nationality: "新迦南",
    birthplace: "新迦南市",
    number: "P123456",
    issuer: "新迦南市政厅",
    issued: "2020-01-01",
    expires: "2030-01-01",
  };
  const policeFields = {
    holder: "浅上京子",
    organization: "新迦南市警局",
    department: "重案组",
    rank: "警督",
    position: "探长",
    number: "K-01",
    issuer: "市政厅",
    issued: "2020-01-01",
    expires: "2030-01-01",
  };

  it("passport: data page with photo + MRZ, then an issue page", () => {
    const pages = bookletPages(makeDoc("passport", passportFields));
    expect(pages).toHaveLength(2);
    expect(pages[0].title).toBe("个人资料页");
    expect(pages[0].photo).toBe(true);
    expect(pages[0].mrz).toBe(true);
    expect(pages[0].rows.map((r) => r.label)).toContain("护照号码");
    expect(pages[0].rows.find((r) => r.label === "姓名")?.value).toBe("浅上京子");
    expect(pages[1].title).toBe("签发页");
    expect(pages[1].photo).toBe(false);
    expect(pages[1].mrz).toBe(false);
    expect(pages[1].rows.find((r) => r.label === "签发机关")?.value).toBe(
      "新迦南市政厅",
    );
  });

  it("police: inner page with unit/rank, then an issue page", () => {
    const pages = bookletPages(makeDoc("police", policeFields));
    expect(pages).toHaveLength(2);
    expect(pages[0].title).toBe("内页");
    expect(pages[0].photo).toBe(true);
    expect(pages[0].mrz).toBe(false);
    expect(pages[0].rows.find((r) => r.label === "警衔")?.value).toBe("警督");
    expect(pages[0].rows.find((r) => r.label === "警号")?.value).toBe("K-01");
    expect(pages[1].title).toBe("签发页");
    expect(pages[1].rows.find((r) => r.label === "签发机关")?.value).toBe("市政厅");
  });

  it("skips empty fields, and drops the issue page when it has none", () => {
    const sparse = bookletPages(
      makeDoc("passport", {
        holder: "浅上京子",
        romanName: "   ",
        gender: "",
        number: "P123456",
      }),
    );
    expect(sparse).toHaveLength(1);
    expect(sparse[0].title).toBe("个人资料页");
    expect(sparse[0].rows.map((r) => r.label)).toEqual(["姓名", "护照号码"]);
    const sparsePolice = bookletPages(
      makeDoc("police", { holder: "浅上京子", number: "K-01" }),
    );
    expect(sparsePolice).toHaveLength(1);
    expect(sparsePolice[0].title).toBe("内页");
  });

  it("only ever shows real filled fields — nothing invented", () => {
    const doc = makeDoc("passport", passportFields);
    const allowed = new Set(Object.values(doc.fields));
    for (const page of bookletPages(doc)) {
      for (const row of page.rows) {
        expect(allowed.has(row.value)).toBe(true);
      }
    }
    expect(bookletPages(makeDoc("identity", passportFields))).toEqual([]);
  });
});
