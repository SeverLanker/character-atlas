// @vitest-environment happy-dom
import { expect, it } from "vitest";
import { executeAgentRequest, type AgentContext, type AgentRecord } from "./agent-api";
import { createArchiveRef, createArchiveRoot, withArchive, withRoot } from "./external-archives";
import { characterToMarkdown } from "./export/markdown";
import { buildRelationshipGraph } from "./graph";
import { createCharacter, migrateLibrary, type Library } from "./model";
import { buildSearchIndex } from "./search";
import type { HistoryState } from "./useLibraryHistory";
import { describeChange } from "./history-labels";
import { agentVisibleLibrary, assignCharacterWorld, createWorld, withWorld } from "./worlds";

const secretName = "私有世界秘名";
const secretPath = "vault/only-private.md";
const secretNote = "路径附注不要出现";

function sample(): Library {
  const role = createCharacter("甲", "分组原文");
  let library = migrateLibrary({ schemaVersion: 2, characters: [role] });
  const hidden = createWorld(secretName, "秘密简介不该出现", "private");
  const shown = createWorld("公开港", "公开简介", "public");
  library = withWorld(withWorld(library, hidden), shown);
  library = assignCharacterWorld(library, role.id, hidden.id);
  const root = createArchiveRoot("合成库");
  library = withRoot(library, root);
  library = withArchive(library, createArchiveRef({
    title: "私有札记", rootId: root.id, relativePath: secretPath, worldId: hidden.id, visibility: "private", note: secretNote,
  }));
  return library;
}

it("检索、图谱、Markdown 和操作记录不带出私有世界或档案路径", () => {
  const library = sample();
  const dumped = [
    JSON.stringify(buildSearchIndex(library, true)),
    characterToMarkdown(library.characters[0], library, { includeSecret: true }),
    JSON.stringify(buildRelationshipGraph(library)),
  ].join("\n");
  expect(dumped).not.toContain(secretName);
  expect(dumped).not.toContain(secretPath);
  expect(dumped).not.toContain(secretNote);
  expect(dumped).not.toContain("私有札记");
  expect(dumped).not.toContain("合成库");
  expect(dumped).toContain("分组原文");
  const before = { ...library, worlds: undefined, archiveRoots: undefined, externalArchives: undefined };
  const label = describeChange(before, library);
  expect(label).toBe("世界与外部档案引用变动");
  expect(label).not.toContain(secretName);
  expect(label).not.toContain(secretPath);
});

it("没有私有记录时 Agent 看到原库；有记录时备份和接口去掉标题与路径", async () => {
  const plain = migrateLibrary({ schemaVersion: 2, characters: [] });
  expect(agentVisibleLibrary(plain)).toBe(plain);
  const library = sample();
  let captured = "";
  let state: HistoryState = { current: library, past: [], future: [], time: 0, group: false };
  const receipts = new Map<string, AgentRecord>();
  const context: AgentContext = {
    lock: () => () => {}, flush: async () => {}, history: () => state, publish: (next) => { state = next; },
    lookup: async (id, fingerprint) => { const row = receipts.get(id); if (!row) return null; if (row.fingerprint !== fingerprint) throw new Error("409"); return row.reply; },
    commit: async () => {},
    backup: async (given) => { captured = JSON.stringify(given); return new Uint8Array([0x50, 0x4b, 3, 4]); },
  };
  const call = (method: string, url: string) => executeAgentRequest({
    id: crypto.randomUUID(), method, url, request_id: undefined, deadline: Date.now() + 30000, fingerprint: method + url,
  }, context);
  const characters = await call("GET", "/characters");
  const stats = await call("GET", "/stats");
  const backup = await call("GET", "/backup");
  const outward = characters.body + stats.body + captured;
  expect(backup.status).toBe(200);
  for (const secret of [secretName, secretPath, secretNote, "私有札记", "合成库", "秘密简介不该出现"]) {
    expect(outward).not.toContain(secret);
  }
  expect(characters.body).toContain("分组原文");
  expect(captured).toContain("公开港");
  expect(captured).not.toContain("vault/");
  expect(JSON.stringify(state.current)).toContain(secretPath);
});
