import { readFile, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import assert from "node:assert/strict";

// Creates only a uniquely marked temporary row, then deletes that exact id.
const connection = JSON.parse(await readFile(process.argv[2] ?? ".agent/connection.json", "utf8"));
assert.equal(new URL(connection.url).hostname, "127.0.0.1");
const prefix = `agent-smoke-${randomUUID()}`, world = prefix;
const call = async (method, path, body, extra = {}) => {
  const response = await fetch(new URL(path, connection.url), { method, headers: { Authorization: `Bearer ${connection.token}`, "Content-Type": "application/json", ...extra }, ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: AbortSignal.timeout(35000) });
  return { status: response.status, text: await response.text() };
};
const json = async (...args) => { const reply = await call(...args); assert.equal(reply.status, 200, reply.text); return JSON.parse(reply.text); };
const baseline = await json("GET", "/catalog/export?format=json&scope=all");
const before = await json("GET", "/stats");
let id;
const report = { before, checks: [] };
try {
  assert.equal((await fetch(`${connection.url}/stats`)).status, 401);
  assert.equal((await call("GET", "/stats", undefined, { Origin: "https://example.invalid" })).status, 401);
  report.checks.push("missing-token and browser-origin rejected");
  if (process.argv[4]) {
    const privateFile = await fetch(new URL("/.agent/connection.json", process.argv[4]));
    assert.notEqual(privateFile.status, 200, "私有连接文件不应被 Vite 静态服务公开");
    report.checks.push("private connection file not served by UI host");
  }
  const csv = `名称,类别,等级,标签,说明,世界\n${prefix},专长,专家,甲/乙/丙,临时接口验证,${world}\n,技能,,,,${world}`;
  const preview = await json("POST", "/catalog/import?dry_run=1", { format: "csv", text: csv });
  assert.equal(preview.will_add, 1); assert.equal(preview.errors.length, 1);
  assert.equal((await json("GET", "/stats")).catalog, before.catalog);
  report.checks.push("dry-run does not write, bad row isolated");
  const body = { format: "csv", text: csv, request_id: `${prefix}:import` };
  const first = await json("POST", "/catalog/import", body);
  const imported = await json("GET", `/catalog/export?format=json&scope=${encodeURIComponent(`world:${world}`)}`);
  assert.equal(imported.entries.length, 1); id = imported.entries[0].id;
  assert.deepEqual(imported.entries[0].tags, ["甲", "乙", "丙"]);
  assert.deepEqual(await json("POST", "/catalog/import", { request_id: body.request_id, text: body.text, format: body.format }), first);
  const originalCopy = await json("GET", `/catalog/${id}`);
  await json("POST", "/undo", { request_id: `${prefix}:undo-import` });
  assert.equal((await json("GET", "/stats")).catalog, before.catalog);
  await json("POST", "/redo", { request_id: `${prefix}:redo-import` });
  assert.deepEqual(await json("GET", `/catalog/${id}`), originalCopy);
  report.checks.push("HTTP undo/redo restores exact id and timestamps");
  assert.equal((await json("GET", "/stats")).catalog, before.catalog + 1);
  assert.equal((await call("POST", "/catalog/import", { ...body, text: "名称,类别,等级,标签,说明" })).status, 409);
  report.checks.push("import, durable replay and request-id conflict");
  assert.equal((await call("PATCH", `/catalog/${id}`, { request_id: `${prefix}:bad-patch`, tags: [42] })).status, 422);
  await json("PATCH", `/catalog/${id}`, { request_id: `${prefix}:patch`, rank: "验证通过", text: "临时修订" });
  assert.equal((await json("GET", `/catalog/${id}`)).rank, "验证通过");
  const exported = await call("GET", `/catalog/export?format=csv&world=${encodeURIComponent(world)}&kind=specialty`);
  assert.equal(exported.status, 200); assert.ok(exported.text.includes("验证通过"));
  report.checks.push("single entry validation, patch/get and filtered CSV export");
} finally {
  if (id) await json("DELETE", `/catalog/${id}`, { request_id: `${prefix}:cleanup` });
}
report.after = await json("GET", "/stats");
assert.equal(report.after.catalog, before.catalog);
assert.deepEqual(await json("GET", "/catalog/export?format=json&scope=all"), baseline);
report.checks.push("temporary row deleted; original catalog exactly unchanged");
if (process.argv[3]) await writeFile(process.argv[3], JSON.stringify(report, null, 2));
process.stdout.write(JSON.stringify(report, null, 2) + "\n");
