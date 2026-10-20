//! Loopback transport only. The running frontend executes the shared TS domain rules.
use crate::{err, prepare, snapshot, validate_data, AppResult, LibraryState};
use rusqlite::{params, OptionalExtension};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use std::{collections::HashMap, fs, io::Read, net::TcpListener, path::PathBuf, sync::{atomic::{AtomicBool, Ordering}, mpsc, Mutex}, time::{Duration, SystemTime, UNIX_EPOCH}};
use tauri::{AppHandle, Emitter, Manager, State};

#[derive(Clone, Serialize, Deserialize)]
pub struct Reply { status: u16, body: String, content_type: String }
struct Pending { sender: mpsc::Sender<Reply>, deadline: u128, root: PathBuf, request_id: Option<String>, fingerprint: String }
pub struct AgentState { ready: AtomicBool, pending: Mutex<HashMap<String, Pending>> }
fn millis() -> u128 { SystemTime::now().duration_since(UNIX_EPOCH).unwrap_or_default().as_millis() }
fn random() -> AppResult<String> { let mut bytes = [0u8; 32]; getrandom::fill(&mut bytes).map_err(err)?; Ok(bytes.iter().map(|byte| format!("{byte:02x}")).collect()) }
fn failure(status: u16, message: &str) -> Reply { Reply { status, body: json!({"error":message}).to_string(), content_type: "application/json;charset=utf-8".into() } }
fn answer(request: tiny_http::Request, reply: Reply) {
    let mut response = tiny_http::Response::from_string(reply.body).with_status_code(reply.status);
    for (name, value) in [("Content-Type", reply.content_type.as_str()), ("Cache-Control", "no-store"), ("X-Content-Type-Options", "nosniff")] {
        if let Ok(header) = tiny_http::Header::from_bytes(name.as_bytes(), value.as_bytes()) { response.add_header(header); }
    }
    let _ = request.respond(response);
}
fn authorized(actual: &str, expected: &str) -> bool {
    actual.len() == expected.len() && actual.bytes().zip(expected.bytes()).fold(0u8, |n, (a,b)| n | (a ^ b)) == 0
}
fn header(request: &tiny_http::Request, key: &str) -> Option<String> { request.headers().iter().find(|h| h.field.equiv(key)).map(|h| h.value.as_str().to_string()) }
fn ledger(connection: &rusqlite::Connection) -> AppResult<()> {
    connection.execute_batch("CREATE TABLE IF NOT EXISTS agent_requests (request_id TEXT PRIMARY KEY, fingerprint TEXT NOT NULL, reply TEXT NOT NULL)").map_err(err)
}

pub fn start(app: &AppHandle) -> AppResult<()> {
    if std::env::var("ATLAS_AGENT_DISABLED").as_deref() == Ok("1") { return Ok(()); }
    let port: u16 = std::env::var("ATLAS_AGENT_PORT").unwrap_or_else(|_| "0".into()).parse().map_err(|_| "ATLAS_AGENT_PORT 无效")?;
    let listener = TcpListener::bind((std::net::Ipv4Addr::LOCALHOST, port)).map_err(err)?;
    let port = listener.local_addr().map_err(err)?.port();
    let server = tiny_http::Server::from_listener(listener, None).map_err(err)?;
    let token = random()?;
    let data_dir = app.state::<LibraryState>().data_dir.clone();
    let path = data_dir.join("agent.json"), temporary = data_dir.join("agent.json.tmp");
    let mut options = fs::OpenOptions::new(); options.write(true).create(true).truncate(true);
    #[cfg(unix)] { use std::os::unix::fs::OpenOptionsExt; options.mode(0o600); }
    {
        use std::io::Write;
        let mut file = options.open(&temporary).map_err(err)?;
        file.write_all(json!({"protocol":1,"url":format!("http://127.0.0.1:{port}"),"token":token,"pid":std::process::id(),"mode":"desktop"}).to_string().as_bytes()).map_err(err)?;
        file.sync_all().map_err(err)?;
    }
    fs::rename(&temporary, path).map_err(err)?;
    app.manage(AgentState { ready: AtomicBool::new(false), pending: Mutex::new(HashMap::new()) });
    let app = app.clone();
    std::thread::spawn(move || {
        for mut request in server.incoming_requests() {
            let host = format!("127.0.0.1:{port}");
            if header(&request, "Origin").is_some() || header(&request, "Host").as_deref() != Some(host.as_str()) || !authorized(&header(&request, "Authorization").unwrap_or_default(), &format!("Bearer {token}")) {
                answer(request, failure(401, "需要本机 Bearer token，拒绝网页跨站请求")); continue;
            }
            if request.body_length().is_some_and(|n| n > 64 * 1024 * 1024) { answer(request, failure(413, "请求超过 64 MB")); continue; }
            let method = request.method().as_str().to_string();
            if method != "GET" && header(&request, "Content-Type").unwrap_or_default().split(';').next().unwrap_or("").trim() != "application/json" { answer(request, failure(415, "请求使用 application/json")); continue; }
            let state = app.state::<AgentState>();
            if !state.ready.load(Ordering::SeqCst) { answer(request, failure(503, "应用尚未就绪，请稍后重试")); continue; }
            let url = request.url().to_string();
            let request_header = header(&request, "X-Request-Id");
            let mut bytes = Vec::new();
            if request.as_reader().take(64 * 1024 * 1024 + 1).read_to_end(&mut bytes).is_err() { answer(request, failure(400, "读取请求失败")); continue; }
            if bytes.len() > 64 * 1024 * 1024 { answer(request, failure(413, "请求超过 64 MB")); continue; }
            let body: Value = if bytes.is_empty() { json!({}) } else { match serde_json::from_slice(&bytes) { Ok(value) => value, Err(_) => { answer(request, failure(400, "JSON 语法错误")); continue; } } };
            let request_id = request_header.or_else(|| body.get("request_id").and_then(Value::as_str).map(str::to_string));
            let id = match random() { Ok(id) => id, Err(_) => { answer(request, failure(500, "无法生成请求编号")); continue; } };
            let deadline = millis() + 30000;
            let fingerprint = format!("{:x}", Sha256::digest([format!("{method}\n{url}\n").as_bytes(), bytes.as_slice()].concat()));
            let root = match app.state::<LibraryState>().root.lock() { Ok(root) => root.clone(), Err(_) => { answer(request, failure(503, "资料库暂不可用")); continue; } };
            let (sender, receiver) = mpsc::channel();
            if let Ok(mut pending) = state.pending.lock() { pending.insert(id.clone(), Pending { sender, deadline, root, request_id: request_id.clone(), fingerprint: fingerprint.clone() }); }
            if app.emit_to("main", "atlas-agent-request", json!({"id":id,"method":method,"url":url,"body":body,"fingerprint":fingerprint,"request_id":request_id,"deadline":deadline})).is_err() {
                if let Ok(mut pending) = state.pending.lock() { pending.remove(&id); }
                answer(request, failure(503, "应用连接未就绪")); continue;
            }
            let reply = receiver.recv_timeout(Duration::from_secs(30)).unwrap_or_else(|_| failure(504, "请求超时；写操作请使用相同 request_id 重试"));
            if let Ok(mut pending) = state.pending.lock() { pending.remove(&id); }
            answer(request, reply);
        }
    });
    Ok(())
}

#[tauri::command]
pub fn agent_ready(state: State<AgentState>, ready: bool) { state.ready.store(ready, Ordering::SeqCst); }
#[tauri::command]
pub fn agent_respond(state: State<AgentState>, id: String, reply: Reply) -> AppResult<()> {
    let pending = state.pending.lock().map_err(err)?;
    if let Some(item) = pending.get(&id) { item.sender.send(reply).map_err(err)?; }
    Ok(())
}
#[tauri::command]
pub fn read_agent_record(state: State<LibraryState>, request_id: String) -> AppResult<Option<String>> {
    let root = state.root.lock().map_err(err)?; let connection = prepare(&root)?; ledger(&connection)?;
    let row: Option<(String, String)> = connection.query_row("SELECT fingerprint,reply FROM agent_requests WHERE request_id=?1", [&request_id], |r| Ok((r.get(0)?,r.get(1)?))).optional().map_err(err)?;
    row.map(|(fingerprint,reply)| serde_json::from_str::<Value>(&reply).map(|reply| json!({"fingerprint":fingerprint,"reply":reply}).to_string()).map_err(err)).transpose()
}
fn persist(root: &std::path::Path, expected: &str, data: &str, record: &Value) -> AppResult<()> {
    validate_data(data)?;
    let request_id = record["request_id"].as_str().ok_or("request_id 无效")?;
    let fingerprint = record["fingerprint"].as_str().ok_or("fingerprint 无效")?;
    let mut connection = prepare(root)?; ledger(&connection)?;
    snapshot(root)?;
    let tx = connection.transaction().map_err(err)?;
    let duplicate: bool = tx.query_row("SELECT EXISTS(SELECT 1 FROM agent_requests WHERE request_id=?1)", [request_id], |r| r.get(0)).map_err(err)?;
    if duplicate { return Err("request_id 已被处理，请重试读取原结果（409）".into()); }
    let current: Option<String> = tx.query_row("SELECT data FROM library WHERE id=1", [], |r| r.get(0)).optional().map_err(err)?;
    if current.as_deref().map(serde_json::from_str::<Value>).transpose().map_err(err)? != Some(serde_json::from_str::<Value>(expected).map_err(err)?) { return Err("资料库已变化，未提交，请重试（409）".into()); }
    tx.execute("INSERT INTO library(id,data) VALUES(1,?1) ON CONFLICT(id) DO UPDATE SET data=excluded.data", [data]).map_err(err)?;
    tx.execute("INSERT INTO agent_requests(request_id,fingerprint,reply) VALUES(?1,?2,?3)", params![request_id,fingerprint,record["reply"].to_string()]).map_err(err)?;
    tx.commit().map_err(err)
}
#[tauri::command]
pub fn save_agent_library(library: State<LibraryState>, agent: State<AgentState>, id: String, expected: String, data: String, record: String) -> AppResult<()> {
    let record: Value = serde_json::from_str(&record).map_err(err)?;
    let pending = agent.pending.lock().map_err(err)?;
    let item = pending.get(&id).ok_or("请求已超时，未提交")?;
    if millis() > item.deadline { return Err("请求已超时，未提交".into()); }
    if record["request_id"].as_str() != item.request_id.as_deref() || record["fingerprint"].as_str() != Some(item.fingerprint.as_str()) { return Err("请求身份不匹配".into()); }
    let root = library.root.lock().map_err(err)?;
    if *root != item.root { return Err("资料库位置已变化，请重新请求（409）".into()); }
    persist(&root, &expected, &data, &record)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test] fn token_checks_exact_bearer_value() { assert!(authorized("Bearer abc", "Bearer abc")); assert!(!authorized("abc", "Bearer abc")); assert!(!authorized("Bearer abd", "Bearer abc")); }
    #[test] fn receipt_and_library_commit_together_and_reject_stale_or_duplicate() {
        let root = std::env::temp_dir().join(format!("atlas-agent-{}", random().unwrap()));
        let before = json!({"schemaVersion":2,"characters":[],"catalog":[]}).to_string();
        let after = json!({"schemaVersion":2,"characters":[],"catalog":[{"id":"x","title":"A","kind":"skill","rank":"","text":"","common":false}]}).to_string();
        let connection = prepare(&root).unwrap();
        connection.execute("INSERT INTO library(id,data) VALUES(1,?1)", [&before]).unwrap(); drop(connection);
        let record = json!({"request_id":"test-1","fingerprint":"abc","reply":{"status":200,"body":"ok","content_type":"application/json"}});
        assert!(persist(&root, "{}", &after, &record).is_err());
        persist(&root, &before, &after, &record).unwrap();
        assert!(persist(&root, &after, &before, &record).is_err());
        let connection = prepare(&root).unwrap();
        assert_eq!(connection.query_row("SELECT data FROM library WHERE id=1", [], |r| r.get::<_,String>(0)).unwrap(), after);
        assert_eq!(connection.query_row("SELECT COUNT(*) FROM agent_requests", [], |r| r.get::<_,u32>(0)).unwrap(),1);
        drop(connection); fs::remove_dir_all(root).unwrap();
    }
}
