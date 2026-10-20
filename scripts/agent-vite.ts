import { createServer } from "node:http";
import { createHash, randomBytes, timingSafeEqual, randomUUID } from "node:crypto";
import { mkdir, writeFile, rename, rm, readFile } from "node:fs/promises";
import { join } from "node:path";
import type { Plugin, WebSocketClient } from "vite";
import type { AgentReply, AgentRequest } from "../src/agent-api";

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical((value as Record<string, unknown>)[key])]));
  return value;
}

/** Development transport only. All library operations run in the active app tab. */
export function atlasAgent(): Plugin {
  return { name: "atlas-loopback-agent", apply: "serve", async configureServer(vite) {
    if (vite.config.mode === "test" || process.env.ATLAS_AGENT_DISABLED === "1") return;
    const token = randomBytes(32).toString("hex");
    let active: WebSocketClient | undefined;
    const pending = new Map<string, { client: WebSocketClient; resolve: (reply: AgentReply) => void }>();
    vite.ws.on("atlas:agent-ready", (_data, client) => { if (!active || active.socket.readyState !== 1) active = client; });
    vite.ws.on("atlas:agent-not-ready", (_data, client) => { if (active === client) active = undefined; });
    vite.ws.on("atlas:agent-reply", (value: { id: string; reply: AgentReply }, client) => {
      const item = pending.get(value.id);
      if (item?.client === client) item.resolve(value.reply);
    });
    const http = createServer(async (req, res) => {
      const answer = (status: number, data: unknown) => { res.writeHead(status, { "Content-Type": "application/json", "Cache-Control": "no-store" }); res.end(JSON.stringify(data)); };
      const authorization = Buffer.from(req.headers.authorization ?? "");
      const expected = Buffer.from(`Bearer ${token}`);
      if (req.headers.origin || req.headers.host !== `127.0.0.1:${(http.address() as { port: number }).port}` || authorization.length !== expected.length || !timingSafeEqual(authorization, expected)) { answer(401, { error: "需要本机 Bearer token，拒绝网页跨站请求" }); return; }
      if (req.method !== "GET" && req.headers["content-type"]?.split(";")[0].trim() !== "application/json") { answer(415, { error: "请求使用 application/json" }); return; }
      if (Number(req.headers["content-length"] ?? 0) > 64 * 1024 * 1024) { answer(413, { error: "请求超过 64 MB" }); return; }
      req.setTimeout(10000, () => req.destroy());
      try {
        const chunks: Buffer[] = []; let size = 0;
        for await (const chunk of req) { size += chunk.length; if (size > 64 * 1024 * 1024) { answer(413, { error: "请求超过 64 MB" }); return; } chunks.push(chunk); }
        const text = Buffer.concat(chunks).toString("utf8");
        let body: unknown;
        try { body = text ? JSON.parse(text) : undefined; } catch { answer(400, { error: "JSON 语法错误" }); return; }
        if (!active || active.socket.readyState !== 1) { answer(503, { error: "请打开本地预览应用；尚无就绪的应用连接" }); return; }
        const id = randomUUID(), deadline = Date.now() + 30000;
        const fingerprint = createHash("sha256").update(`${req.method}\n${req.url}\n${JSON.stringify(canonical(body ?? {}))}`).digest("hex");
        const client = active;
        const reply = await new Promise<AgentReply>(resolve => {
          const timer = setTimeout(() => resolve({ status: 504, body: JSON.stringify({ error: "请求超时；写操作请使用相同 request_id 重试" }), content_type: "application/json" }), 30000);
          pending.set(id, { client, resolve: value => { clearTimeout(timer); resolve(value); } });
          client.send("atlas:agent-request", { id, deadline, fingerprint, method: req.method, url: req.url, body, request_id: req.headers["x-request-id"] } as AgentRequest);
        });
        pending.delete(id);
        res.writeHead(reply.status, { "Content-Type": reply.content_type, "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" }); res.end(reply.body);
      } catch { if (!res.headersSent) answer(500, { error: "请求未完成，请用相同 request_id 重试" }); else res.end(); }
    });
    const configured = process.env.ATLAS_AGENT_PORT === undefined ? 0 : Number(process.env.ATLAS_AGENT_PORT);
    if (!Number.isInteger(configured) || configured < 0 || configured > 65535) throw new Error("ATLAS_AGENT_PORT 无效");
    await new Promise<void>((resolve, reject) => { http.once("error", reject); http.listen(configured, "127.0.0.1", resolve); });
    const folder = join(vite.config.root, ".agent");
    await mkdir(folder, { recursive: true });
    const path = join(folder, "connection.json"), temporary = `${path}.${randomUUID()}.tmp`;
    await writeFile(temporary, JSON.stringify({ protocol: 1, url: `http://127.0.0.1:${(http.address() as { port: number }).port}`, token, pid: process.pid, mode: "preview" }), { mode: 0o600 });
    await rename(temporary, path);
    vite.httpServer?.once("close", () => { http.close(); void readFile(path, "utf8").then(text => { if (JSON.parse(text).token === token) return rm(path, { force: true }); }).catch(() => {}); });
  } };
}
