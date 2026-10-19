// @vitest-environment happy-dom
import { useState } from "react";
import { afterEach, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { CatalogPanel } from "./components/CatalogPanel";
import { blankProfile, createCharacter, isProminentAbility, validateLibrary, type CatalogEntry, type Skill } from "./model";
import { exportBackup, parseBackup } from "./storage";

afterEach(cleanup);
it("法术模板新增后复制到角色，编辑模板不会更改已有副本", () => {
  function Harness() {
    const [entries, setEntries] = useState<CatalogEntry[]>([]);
    const [profile, setProfile] = useState(blankProfile());
    return <><CatalogPanel entries={entries} onChange={setEntries} profile={profile} onPatch={(patch) => setProfile({ ...profile, ...patch, basics: profile.basics, coc: profile.coc })} />
      <output data-testid="copy">{JSON.stringify(profile.skills)}</output></>;
  }
  render(<Harness />);
  fireEvent.click(screen.getByRole("button", { name: "法术" }));
  fireEvent.click(screen.getByRole("button", { name: "新建法术模板" }));
  fireEvent.change(screen.getByLabelText("模板名称"), { target: { value: "微光" } });
  fireEvent.change(screen.getByLabelText("模板内容"), { target: { value: "照亮一小片区域。" } });
  fireEvent.change(screen.getByLabelText("模板等级"), { target: { value: "Lv.3" } });
  fireEvent.click(screen.getByRole("button", { name: "保存模板" }));
  fireEvent.click(screen.getByRole("button", { name: "添加到当前版本" }));
  const copy = JSON.parse(screen.getByTestId("copy").textContent!)[0];
  expect(copy.kind).toBe("spell");
  fireEvent.click(screen.getByRole("button", { name: "编辑模板" }));
  fireEvent.change(screen.getByLabelText("模板内容"), { target: { value: "新的模板说明" } });
  fireEvent.click(screen.getByRole("button", { name: "保存模板" }));
  expect(JSON.parse(screen.getByTestId("copy").textContent!)[0].text).toBe("照亮一小片区域。");
  fireEvent.click(screen.getByRole("button", { name: "删除模板" }));
  expect(screen.queryByRole("button", { name: "添加到当前版本" })).toBeNull();
  expect(JSON.parse(screen.getByTestId("copy").textContent!)).toHaveLength(1);
});

it("共享条目随 ZIP 备份迁移，并拒绝重复模板编号", async () => {
  const lib = { schemaVersion: 2 as const, characters: [createCharacter("测试")], catalog: [{ id: "template", title: "罗盘", text: "指示方向", kind: "item" as const, rank: "", common: false }] };
  const restored = parseBackup(await exportBackup(lib)).library;
  expect(restored.catalog).toEqual(lib.catalog);
  lib.catalog.push({ ...lib.catalog[0] });
  expect(() => validateLibrary(lib)).toThrow("资料库条目无效");
});

it("低阶与通用能力默认收起，重点能力覆盖隐藏规则", () => {
  const skill: Skill = { id: "s", title: "观察", text: "", rank: "Lv.2" };
  expect(isProminentAbility(skill)).toBe(false);
  expect(isProminentAbility({ ...skill, rank: "精通", common: true })).toBe(false);
  expect(isProminentAbility({ ...skill, common: true, featured: true })).toBe(true);
  expect(isProminentAbility({ ...skill, rank: "未分类等级" })).toBe(true);
});
