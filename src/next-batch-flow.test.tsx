// @vitest-environment happy-dom
import "fake-indexeddb/auto";
import { afterEach, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { strToU8 } from "fflate";
import App from "./App";
import { createCharacter, duplicateVersion } from "./model";
import { loadLibrary, saveLibrary } from "./storage";
afterEach(cleanup);

it("全文检索需主动包含秘密，点击命中后打开对应版本和状态栏目", async () => {
  const role = createCharacter("城中旅人");
  const later = duplicateVersion(role.versions[0], "冬季");
  later.secret.enabled = true;
  later.secret.overrides.conditions = [{ id: "secret", title: "观察记录", text: "回声编码", area: "感官", severity: "notice" }];
  role.versions.push(later);
  await saveLibrary({ schemaVersion: 2, characters: [role] });
  const { container } = render(<App />);
  await screen.findByRole("button", { name: "打开城中旅人的档案" });
  fireEvent.click(container.querySelector(".global-search-panel > summary")!);
  fireEvent.change(screen.getByLabelText("搜索全部角色档案内容"), { target: { value: "回声编码" } });
  expect(screen.getByRole("status").textContent).toContain("0 个角色");
  fireEvent.click(screen.getByRole("checkbox", { name: /包含已启用的秘密档案/ }));
  fireEvent.click(screen.getByRole("button", { name: /回声编码/ }));
  expect((screen.getByRole("combobox", { name: "当前剧情版本" }) as HTMLSelectElement).value).toBe(later.id);
  expect(container.querySelector(".book-shell.theme-prison")).toBeTruthy();
  expect(within(screen.getByRole("navigation", { name: "档案目录" })).getByRole("button", { name: /医疗记录/ }).classList.contains("active")).toBe(true);
});

it("设置页预览冲突，明确选择副本后追加保存，不替换原角色", async () => {
  const role = createCharacter("原角色");
  await saveLibrary({ schemaVersion: 2, characters: [role] });
  const source = structuredClone(role); source.name = "导入修订";
  render(<App />);
  fireEvent.click(await screen.findByRole("button", { name: "打开资料库设置" }));
  const input = screen.getByLabelText("选择追加导入文件");
  fireEvent.change(input, { target: { files: [new File([strToU8(JSON.stringify({ schemaVersion: 2, characters: [source] }))], "role.json")] } });
  const select = await screen.findByRole("combobox", { name: "导入处理：导入修订" });
  expect((select as HTMLSelectElement).value).toBe("skip");
  fireEvent.change(select, { target: { value: "copy" } });
  fireEvent.click(screen.getByRole("button", { name: "确认追加导入" }));
  await screen.findByText("追加导入完成，未选中的原有角色保持不变。");
  await waitFor(async () => expect((await loadLibrary())!.characters).toHaveLength(2));
  const result = (await loadLibrary())!;
  expect(result.characters[0].name).toBe("原角色");
  expect(result.characters[1].id).not.toBe(role.id);
});
