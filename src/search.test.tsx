// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { createCharacter, duplicateVersion } from "./model";
import { buildSearchIndex, searchDocuments } from "./search";
import { LibrarySearch } from "./components/LibrarySearch";
afterEach(cleanup);
function fixture() {
  const role = createCharacter("寻访者");
  const version = role.versions[0];
  version.profile.background = "她在北塔发现一张旧地图。";
  const next = duplicateVersion(version, "第二章");
  next.profile.background = "搬离北塔。";
  next.secret.enabled = true;
  next.secret.overrides.conditions = [{ id: "condition", title: "隐藏记录", text: "银铃计划", area: "感官", severity: "notice" }];
  role.versions.push(next);
  return { schemaVersion: 2 as const, characters: [role] };
}
it("默认索引不含秘密内容，明档命中跨版本并按角色分组", () => {
  const library = fixture();
  const index = buildSearchIndex(library);
  expect(JSON.stringify(index)).not.toContain("银铃计划");
  expect(searchDocuments(index, "北塔")[0].total).toBe(2);
  const secret = searchDocuments(buildSearchIndex(library, true), "银铃计划")[0].hits[0];
  expect(secret.hidden).toBe(true); expect(secret.page).toBe("status");
  expect(secret.versionId).toBe(library.characters[0].versions[1].id);
});
it("未选用的内置基础技能不产生全员命中，已选低阶技能仍可搜索", () => {
  const library = fixture();
  expect(searchDocuments(buildSearchIndex(library), "会计")).toHaveLength(0);
  const skill = library.characters[0].versions[0].profile.coc!.skills.find((row) => row.key === "accounting")!;
  skill.selected = true; skill.value = 10;
  expect(searchDocuments(buildSearchIndex(library), "会计")[0].hits[0].field).toBe("数值技能");
});
it("结果高亮且点击能传回对应版本和秘密栏目，不执行输入文本", () => {
  const onOpen = vi.fn();
  const library = fixture();
  library.characters[0].versions[0].profile.customFields = [{ id: "literal", title: "原文", text: "<script>北塔</script>" }];
  const { container } = render(<LibrarySearch library={library} onOpen={onOpen} />);
  fireEvent.change(screen.getByLabelText("搜索全部角色档案内容"), { target: { value: "银铃计划" } });
  expect(screen.getByRole("status").textContent).toContain("0 个角色");
  fireEvent.click(screen.getByRole("checkbox", { name: /包含已启用的秘密档案/ }));
  fireEvent.click(screen.getByRole("button", { name: /银铃计划/ }));
  expect(onOpen.mock.calls[0][0]).toMatchObject({ hidden: true, page: "status" });
  expect(container.querySelector("mark")!.textContent).toBe("银铃计划");
  fireEvent.change(screen.getByLabelText("搜索全部角色档案内容"), { target: { value: "<script>" } });
  expect(container.querySelector("script")).toBeNull();
  expect(container.textContent).toContain("<script>北塔</script>");
});
