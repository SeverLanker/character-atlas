import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";

/** Desktop only: records Agent writes (time, endpoint, request_id, affected ids) to audit.jsonl in the app data folder. */
export function AgentAuditToggle() {
  const [enabled, setEnabled] = useState<boolean | null>(null), [error, setError] = useState("");
  useEffect(() => { invoke<boolean>("agent_audit", {}).then(setEnabled).catch(() => setEnabled(null)); }, []);
  if (enabled === null) return null;
  return <label className="agent-audit-toggle">
    <input type="checkbox" checked={enabled} onChange={e => { const next = e.target.checked; setError(""); invoke<boolean>("agent_audit", { enabled: next }).then(setEnabled).catch(err => setError(String(err))); }} />
    <span><strong>记录 Agent 接口审计日志</strong><small>写入应用数据目录的 audit.jsonl：时间、接口、request_id、受影响的 id；不记录 token 和条目内容。</small></span>
    {error && <small role="alert">{error}</small>}
  </label>;
}
