#!/usr/bin/env node
import { readFile, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { homedir } from "node:os";
import { join, extname } from "node:path";

const help = `Atlas Agent CLI (Node.js >= 20.19; keep the app running)
atlas stats
atlas catalog import --file x.csv --dry-run
atlas catalog import --file x.csv --request-id import-001 [--overwrite all]
atlas catalog export --format csv --scope all --out catalog.csv
atlas catalog export --format tsv --out catalog.tsv
atlas characters list
atlas characters import --file roles.json --dry-run [--on-conflict skip|replace|copy]
atlas characters import --file backup.zip --request-id chars-001 --on-conflict copy
atlas catalog get ID
atlas catalog patch ID --json '{"rank":"精通"}' --request-id edit-001
atlas catalog delete ID --request-id delete-001
atlas undo --request-id undo-001
atlas redo --request-id redo-001
Options: --connection-file PATH (or ATLAS_AGENT_FILE), --format csv|json|tsv (import and export),
--world NAME --kind skill|spell|specialty|item --tag TAG --q WORDS --favorite,
--overwrite-rows 1,2 --out PATH [--force], --data patch.json
Preview: --connection-file .agent/connection.json
`;
const args = process.argv.slice(2), options = {}, positionals = [];
const booleans = new Set(["dry-run", "force", "favorite", "help"]);
const allowed = new Set([...booleans, "on-conflict", "file", "format", "scope", "out", "connection-file", "request-id", "overwrite", "overwrite-rows", "json", "data", "world", "kind", "tag", "q"]);
try {
  for (let i = 0; i < args.length; i++) {
    if (!args[i].startsWith("--")) { positionals.push(args[i]); continue; }
    const key = args[i].slice(2);
    if (!allowed.has(key)) throw new Error(`未知参数 --${key}`);
    if (booleans.has(key)) options[key] = true;
    else { if (!args[i + 1] || args[i + 1].startsWith("--")) throw new Error(`--${key} 需要一个值`); options[key] = args[++i]; }
  }
  if (options.help || !positionals.length) { process.stdout.write(help); process.exit(0); }
  const connectionFile = options["connection-file"] ?? process.env.ATLAS_AGENT_FILE ?? join(process.platform === "win32" ? process.env.LOCALAPPDATA ?? join(homedir(), "AppData", "Local") : process.env.XDG_DATA_HOME ?? join(homedir(), ".local", "share"), "studio.characteratlas.desktop", "agent.json");
  const connection = JSON.parse(await readFile(connectionFile, "utf8").catch(error => { if (error?.code === "ENOENT") throw new Error(`叙册未在运行（找不到连接文件 ${connectionFile}）。请先启动叙册。`); throw error; }));
  if (Number.isInteger(connection.pid)) {
    // A stale connection file means the app is not running (or exited without cleanup).
    try { process.kill(connection.pid, 0); } catch (error) { if (error?.code === "ESRCH") throw new Error(`叙册未在运行（连接文件中的进程 ${connection.pid} 已退出）。请先启动叙册：${connectionFile}`); }
  }
  const base = new URL(connection.url);
  if (base.protocol !== "http:" || base.hostname !== "127.0.0.1" || typeof connection.token !== "string" || !/^[a-f0-9]{64}$/.test(connection.token)) throw new Error("连接文件无效，必须是 127.0.0.1 HTTP 地址和本机 token");
  let method = "GET", path, body;
  const [command, action, id] = positionals;
  if (command === "stats") path = "/stats";
  else if (command === "characters" && action === "list") path = "/characters";
  else if (command === "characters" && action === "import") {
    if (!options.file) throw new Error("导入需要 --file");
    const zip = extname(options.file).toLowerCase() === ".zip";
    if (options["on-conflict"] && !["skip", "replace", "copy"].includes(options["on-conflict"])) throw new Error("--on-conflict 必须为 skip、replace 或 copy");
    body = zip ? { format: "zip", data_base64: (await readFile(options.file)).toString("base64") } : { format: "json", text: await readFile(options.file, "utf8") };
    if (options["on-conflict"]) body.on_conflict = options["on-conflict"];
    method = "POST"; path = `/characters/import${options["dry-run"] ? "?dry_run=1" : ""}`;
  }
  else if (command === "undo" || command === "redo") { method = "POST"; path = `/${command}`; body = {}; }
  else if (command === "catalog" && action === "import") {
    if (!options.file) throw new Error("导入需要 --file");
    const format = options.format ?? extname(options.file).slice(1).toLowerCase();
    body = { format, text: await readFile(options.file, "utf8") };
    if (options.overwrite) body.overwrite = options.overwrite;
    if (options["overwrite-rows"]) body.overwrite_rows = options["overwrite-rows"].split(",").map(Number);
    method = "POST"; path = `/catalog/import${options["dry-run"] ? "?dry_run=1" : ""}`;
  } else if (command === "catalog" && action === "export") {
    const query = new URLSearchParams({ format: options.format ?? "json", scope: options.scope ?? "all" });
    for (const key of ["world", "kind", "tag", "q"]) if (options[key] !== undefined) query.set(key, options[key]);
    if (options.favorite) query.set("favorite", "1");
    path = `/catalog/export?${query}`;
  } else if (command === "catalog" && ["get", "patch", "delete"].includes(action) && id) {
    path = `/catalog/${encodeURIComponent(id)}`;
    if (action === "delete") { method = "DELETE"; body = {}; }
    if (action === "patch") { method = "PATCH"; body = JSON.parse(options.data ? await readFile(options.data, "utf8") : options.json ?? "{}"); }
  } else throw new Error("命令无效，运行 atlas --help 查看用法");
  const writing = method !== "GET" && !options["dry-run"];
  const requestId = writing ? options["request-id"] ?? randomUUID() : undefined;
  if (requestId) {
    if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error("请求数据必须是对象");
    body.request_id = requestId; process.stderr.write(`request_id=${requestId}\n`);
  }
  const request = { method, headers: { Authorization: `Bearer ${connection.token}`, ...(method !== "GET" ? { "Content-Type": "application/json" } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) };
  let response;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      response = await fetch(new URL(path, base), { ...request, signal: AbortSignal.timeout(35000) });
      if (![503, 504].includes(response.status) || attempt === 2) break;
      await response.arrayBuffer();
    } catch (error) { if (attempt === 2) throw error; }
    await new Promise(resolve => setTimeout(resolve, 750));
  }
  if (!response) throw new Error("无法连接正在运行的叙册");
  const bytes = Buffer.from(await response.arrayBuffer());
  if (!response.ok) throw new Error(`HTTP ${response.status}: ${bytes.toString("utf8")}`);
  if (options.out) { await writeFile(options.out, bytes, { flag: options.force ? "w" : "wx" }); process.stderr.write(`已保存：${options.out}\n`); }
  else { process.stdout.write(bytes); process.stdout.write("\n"); }
} catch (error) { process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`); process.exitCode = 1; }
