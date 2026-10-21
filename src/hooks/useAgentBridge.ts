import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { desktop, readAgentRecord, saveLibrary } from "../storage";
import { executeAgentRequest, agentJson, type AgentRequest, type AgentReply } from "../agent-api";
import { queueSave } from "./useAutosave";
import type { useLibraryHistory } from "../useLibraryHistory";

export function useAgentBridge(history: ReturnType<typeof useLibraryHistory>, flush: (force?: boolean) => Promise<void>, busy: boolean) {
  const latest = useRef({ history, flush, busy }); latest.current = { history, flush, busy };
  const [agentBusy, setAgentBusy] = useState(false);
  useEffect(() => {
    let disposed = false, cleanup = () => {}, queue = Promise.resolve();
    const handle = (request: AgentRequest, respond: (reply: AgentReply) => Promise<void>) => {
      queue = queue.catch(() => {}).then(async () => {
        if (disposed) return;
        const reply = await executeAgentRequest(request, {
          lock: () => {
            if (latest.current.busy) throw new Error("应用正在执行其他操作，请稍后重试（503）");
            const release = latest.current.history.lock(); setAgentBusy(true);
            return () => { release(); if (!disposed) setAgentBusy(false); };
          },
          flush: async () => {
            await latest.current.flush(true);
            const current = latest.current.history.getState().current;
            if (current) await queueSave(current);
          },
          history: () => latest.current.history.getState(),
          publish: state => latest.current.history.publish(state),
          lookup: readAgentRecord,
          commit: (req, previous, next, record) => saveLibrary(next, false, previous, { ...record, id: req.id, deadline: req.deadline }),
        });
        await respond(reply);
      }).catch(async () => { await respond(agentJson(500, { error: "Agent 请求未完成，请使用相同 request_id 重试" })).catch(() => {}); });
    };
    if (desktop) {
      void listen<AgentRequest>("atlas-agent-request", event => handle(event.payload, reply => invoke("agent_respond", { id: event.payload.id, reply }))).then(async unlisten => {
        if (disposed) { unlisten(); return; }
        cleanup = () => { unlisten(); void invoke("agent_ready", { ready: false }); };
        await invoke("agent_ready", { ready: true });
      }).catch(() => {});
    } else if (import.meta.env.MODE !== "test" && import.meta.hot) {
      const hot = import.meta.hot;
      const handler = (request: AgentRequest) => handle(request, async reply => { hot.send("atlas:agent-reply", { id: request.id, reply }); });
      const ready = () => hot.send("atlas:agent-ready", {});
      hot.on("atlas:agent-request", handler); hot.on("vite:ws:connect", ready); ready();
      cleanup = () => { hot.off("atlas:agent-request", handler); hot.off("vite:ws:connect", ready); hot.send("atlas:agent-not-ready", {}); };
    }
    return () => { disposed = true; cleanup(); };
  }, []);
  return agentBusy;
}
