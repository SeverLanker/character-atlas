// @vitest-environment happy-dom
import { useState } from "react";
import { afterEach, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { CocEditor, CocSkills } from "./components/CocPanel";
import { blankProfile } from "./model";
import { mergeCoc } from "./coc";

afterEach(cleanup);
it("搜索选取后才添加技能，基础值技能可显示，移除后不再展示", () => {
  function Harness() {
    const [profile, setProfile] = useState(blankProfile("调查员"));
    return <><CocEditor profile={profile} onPatch={(patch) => setProfile({ ...profile, coc: mergeCoc(profile.coc!, patch) })} /><CocSkills profile={profile} /></>;
  }
  const { container } = render(<Harness />);
  expect(container.querySelectorAll('.coc-edit-skills details')).toHaveLength(0);
  expect(screen.queryByLabelText("搜索库中条目")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "添加技能或专长" }));
  fireEvent.change(screen.getByLabelText("搜索库中条目"), { target: { value: "图书馆" } });
  expect(container.querySelectorAll('.coc-edit-skills details')).toHaveLength(0);
  expect(screen.getByRole("dialog", { name: "从数值技能库添加" })).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: /图书馆使用 基础/ }));
  fireEvent.click(screen.getByRole("button", { name: "添加选中条目" }));
  expect(container.querySelectorAll('.coc-edit-skills details')).toHaveLength(1);
  expect(screen.queryByRole("button", { name: "图书馆使用 常规 20" })).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "全部已选" }));
  expect(screen.getByRole("button", { name: "图书馆使用 常规 20" })).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "移除此项" }));
  expect(screen.queryByRole("button", { name: "图书馆使用 常规 20" })).toBeNull();
});

it("旧版已修改技能保留，阅读时分批显示", () => {
  const profile = blankProfile();
  profile.coc!.skills.slice(0, 12).forEach((skill) => { skill.value = 60; });
  const { container } = render(<CocSkills profile={profile} />);
  expect(container.querySelectorAll('.coc-skill-row')).toHaveLength(8);
  fireEvent.click(screen.getByRole("button", { name: /再显示 8 项/ }));
  expect(container.querySelectorAll('.coc-skill-row')).toHaveLength(12);
});

it("通用与低值数值技能收起，重点技能始终可见", () => {
  const profile = blankProfile();
  const [common, low, featured] = profile.coc!.skills;
  common.value = 80; common.common = true;
  low.value = 30;
  featured.value = 10; featured.common = true; featured.featured = true;
  const { container } = render(<CocSkills profile={profile} />);
  expect(screen.queryByLabelText("搜索技能")).toBeNull();
  expect(container.querySelectorAll('.coc-skill-row')).toHaveLength(1);
  fireEvent.click(screen.getByRole("button", { name: "全部已选" }));
  expect(container.querySelectorAll('.coc-skill-row')).toHaveLength(3);
});
