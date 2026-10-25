//! Loopback transport only. The running frontend executes the shared TS domain rules.
use crate::{err, prepare, snapshot, validate_data, AppResult, LibraryState};
use rusqlite::{params, OptionalExtension};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use std::{collections::HashMap, fs, io::{ErrorKind, Read, Write}, net::{Shutdown, TcpListener, TcpStream}, path::PathBuf, sync::{atomic::{AtomicBool, AtomicUsize, Ordering}, mpsc, Arc, Mutex}, time::{Duration, Instant, SystemTime, UNIX_EPOCH}};
use tauri::{AppHandle, Emitter, Manager, State};

#[derive(Clone, Serialize, Deserialize)]
pub struct Reply {
    status: u16, body: String, content_type: String,
    /// "base64" for binary bodies (GET /backup); decoded before writing.
    #[serde(default, skip_serializing_if = "Option::is_none")] encoding: Option<String>,
    /// Affected ids for the optional audit log; never sent to the client.
    #[serde(default, skip_serializing_if = "Option::is_none")] audit_ids: Option<Vec<String>>,
}
impl Reply {
    fn bytes(&self) -> std::borrow::Cow<'_, [u8]> {
        use base64::Engine;
        if self.encoding.as_deref() == Some("base64") {
            if let Ok(bytes) = base64::engine::general_purpose::STANDARD.decode(&self.body) { return bytes.into(); }
        }
        self.body.as_bytes().into()
    }
}
struct Pending { sender: mpsc::Sender<Reply>, deadline: u128, root: PathBuf, request_id: Option<String>, fingerprint: String }
pub struct AgentState { ready: AtomicBool, pending: Mutex<HashMap<String, Pending>>, connection: Mutex<Option<(PathBuf, String)>>, audit: AtomicBool, data_dir: PathBuf }
const MAX_BODY: usize = 64 * 1024 * 1024;
const MAX_HEAD: usize = 16 * 1024;
/// Transport limits. Every socket read and write has a deadline, so an idle or stalled
/// connection is closed and its slot released within the timeout.
#[derive(Clone, Copy)]
struct Limits {
    /// Request line and headers must arrive within this window after accept.
    header_timeout: Duration,
    /// The body must arrive within this window after the headers.
    body_timeout: Duration,
    write_timeout: Duration,
    /// Open connections (any phase); extra connections get 503 immediately.
    max_connections: usize,
    /// Requests being read, queued or executed at once; extra requests get 503 instead of waiting.
    max_in_flight: usize,
}
const LIMITS: Limits = Limits { header_timeout: Duration::from_secs(10), body_timeout: Duration::from_secs(10), write_timeout: Duration::from_secs(10), max_connections: 32, max_in_flight: 8 };
struct Slot(Arc<AtomicUsize>);
impl Drop for Slot { fn drop(&mut self) { self.0.fetch_sub(1, Ordering::SeqCst); } }
fn take_slot(counter: &Arc<AtomicUsize>, limit: usize) -> Option<Slot> {
    if counter.fetch_add(1, Ordering::SeqCst) >= limit { counter.fetch_sub(1, Ordering::SeqCst); return None; }
    Some(Slot(counter.clone()))
}
/// A parsed HTTP/1.1 request; the stream stays open for the single reply (`Connection: close`).
struct HttpRequest { method: String, url: String, headers: Vec<(String, String)>, stream: TcpStream }
impl HttpRequest {
    fn header(&self, key: &str) -> Option<String> { self.headers.iter().find(|(name, _)| name.eq_ignore_ascii_case(key)).map(|(_, value)| value.clone()) }
}
struct Job { request: HttpRequest, bytes: Vec<u8>, _slot: Slot }
/// One read bounded by `deadline`; Err(408) on timeout, Err(400) on other socket errors.
fn read_some(stream: &mut TcpStream, buffer: &mut [u8], deadline: Instant) -> Result<usize, u16> {
    let left = deadline.saturating_duration_since(Instant::now());
    if left.is_zero() { return Err(408); }
    stream.set_read_timeout(Some(left)).map_err(|_| 400u16)?;
    match stream.read(buffer) {
        Ok(n) => Ok(n),
        Err(error) if matches!(error.kind(), ErrorKind::WouldBlock | ErrorKind::TimedOut) => Err(408),
        Err(_) => Err(400),
    }
}
/// Reads the request head. Err(0) means the peer closed before sending a request.
fn read_head(stream: &mut TcpStream, deadline: Instant) -> Result<(String, String, Vec<(String, String)>, Vec<u8>), u16> {
    let mut data = Vec::new(); let mut buffer = [0u8; 4096];
    let end = loop {
        if let Some(index) = data.windows(4).position(|w| w == b"\r\n\r\n") { break index; }
        if data.len() > MAX_HEAD { return Err(431); }
        let n = read_some(stream, &mut buffer, deadline)?;
        if n == 0 { return Err(if data.is_empty() { 0 } else { 400 }); }
        data.extend_from_slice(&buffer[..n]);
    };
    if end > MAX_HEAD { return Err(431); }
    let head = std::str::from_utf8(&data[..end]).map_err(|_| 400u16)?;
    let mut lines = head.split("\r\n");
    let mut parts = lines.next().unwrap_or("").split(' ');
    let (Some(method), Some(url), Some(version), None) = (parts.next(), parts.next(), parts.next(), parts.next()) else { return Err(400) };
    if !version.starts_with("HTTP/1.") || method.is_empty() || !url.starts_with('/') { return Err(400); }
    let mut headers = Vec::new();
    for line in lines {
        let (name, value) = line.split_once(':').ok_or(400u16)?;
        if name.is_empty() || name.contains(' ') { return Err(400); }
        headers.push((name.to_string(), value.trim().to_string()));
    }
    Ok((method.to_string(), url.to_string(), headers, data[end + 4..].to_vec()))
}
/// Reads exactly `length` body bytes (after `initial`) before `deadline`.
fn read_body(stream: &mut TcpStream, mut initial: Vec<u8>, length: usize, deadline: Instant) -> Result<Vec<u8>, u16> {
    initial.truncate(length);
    let mut buffer = vec![0u8; 64 * 1024];
    while initial.len() < length {
        let want = (length - initial.len()).min(buffer.len());
        let n = read_some(stream, &mut buffer[..want], deadline)?;
        if n == 0 { return Err(400); }
        initial.extend_from_slice(&buffer[..n]);
    }
    Ok(initial)
}
fn reason(status: u16) -> &'static str {
    match status { 200 => "OK", 400 => "Bad Request", 401 => "Unauthorized", 404 => "Not Found", 405 => "Method Not Allowed", 408 => "Request Timeout", 409 => "Conflict", 411 => "Length Required", 413 => "Payload Too Large", 415 => "Unsupported Media Type", 422 => "Unprocessable Entity", 431 => "Request Header Fields Too Large", 500 => "Internal Server Error", 503 => "Service Unavailable", 504 => "Gateway Timeout", _ => "Status" }
}
/// Total time spent discarding unread input after a reply (bounded even if the client keeps trickling).
const DRAIN_DEADLINE: Duration = Duration::from_millis(500);
const DRAIN_MAX: usize = 256 * 1024;
/// Writes all bytes before `deadline`; each write waits at most the remaining time.
fn write_all_deadline(stream: &mut TcpStream, mut bytes: &[u8], deadline: Instant) -> bool {
    while !bytes.is_empty() {
        let left = deadline.saturating_duration_since(Instant::now());
        if left.is_zero() || stream.set_write_timeout(Some(left)).is_err() { return false; }
        match stream.write(bytes) {
            Ok(0) => return false,
            Ok(n) => bytes = &bytes[n..],
            Err(error) if error.kind() == ErrorKind::Interrupted => {}
            Err(_) => return false,
        }
    }
    true
}
/// Discards unread input until EOF, `DRAIN_MAX` bytes or a fixed total deadline.
fn drain(stream: &mut TcpStream) {
    let deadline = Instant::now() + DRAIN_DEADLINE;
    let mut sink = [0u8; 4096]; let mut drained = 0;
    while drained < DRAIN_MAX {
        let left = deadline.saturating_duration_since(Instant::now());
        if left.is_zero() || stream.set_read_timeout(Some(left)).is_err() { break; }
        match stream.read(&mut sink) { Ok(0) => break, Ok(n) => drained += n, Err(error) if error.kind() == ErrorKind::Interrupted => {}, Err(_) => break }
    }
}
/// Writes the reply within `write_timeout` in total, then half-closes and drains briefly
/// so the client sees the reply instead of a reset.
fn write_reply(stream: &mut TcpStream, reply: &Reply, write_timeout: Duration) {
    let content_type = if reply.content_type.contains(['\r', '\n']) { "application/octet-stream" } else { reply.content_type.as_str() };
    let body = reply.bytes();
    let head = format!("HTTP/1.1 {} {}\r\nContent-Type: {content_type}\r\nContent-Length: {}\r\nCache-Control: no-store\r\nX-Content-Type-Options: nosniff\r\nConnection: close\r\n\r\n", reply.status, reason(reply.status), body.len());
    let deadline = Instant::now() + write_timeout;
    if !(write_all_deadline(stream, head.as_bytes(), deadline) && write_all_deadline(stream, &body, deadline)) {
        let _ = stream.shutdown(Shutdown::Both); return;
    }
    let _ = stream.shutdown(Shutdown::Write);
    drain(stream);
}
/// Used on the accept thread when full: one non-blocking write, no drain, so no client can stall accepting.
fn reject_busy(mut stream: TcpStream) {
    let reply = failure(503, "连接过多，请稍后重试");
    let text = format!("HTTP/1.1 503 Service Unavailable\r\nContent-Type: {}\r\nContent-Length: {}\r\nCache-Control: no-store\r\nConnection: close\r\n\r\n{}", reply.content_type, reply.body.len(), reply.body);
    if stream.set_nonblocking(true).is_err() { return; }
    let _ = stream.write(text.as_bytes());
    // Discard only input that has already arrived (non-blocking), so closing is less likely to reset the reply.
    let mut sink = [0u8; 4096];
    for _ in 0..16 { match stream.read(&mut sink) { Ok(n) if n > 0 => {}, _ => break } }
    let _ = stream.shutdown(Shutdown::Write);
}
/// Request checks shared by the desktop app and tests.
struct Gate { token: String, port: u16, ready: Box<dyn Fn() -> bool + Send + Sync>, in_flight: Arc<AtomicUsize>, limits: Limits }
fn serve(listener: TcpListener, gate: Arc<Gate>, work: mpsc::Sender<Job>) {
    let connections = Arc::new(AtomicUsize::new(0));
    for stream in listener.incoming() {
        // Back off on accept errors (e.g. out of file descriptors) instead of spinning.
        let Ok(stream) = stream else { std::thread::sleep(Duration::from_millis(50)); continue };
        let Some(connection) = take_slot(&connections, gate.limits.max_connections) else { reject_busy(stream); continue };
        let (gate, work) = (gate.clone(), work.clone());
        std::thread::spawn(move || handle(stream, &gate, &work, connection));
    }
}
fn handle(mut stream: TcpStream, gate: &Gate, work: &mpsc::Sender<Job>, _connection: Slot) {
    let write_timeout = gate.limits.write_timeout;
    let (method, url, headers, initial) = match read_head(&mut stream, Instant::now() + gate.limits.header_timeout) {
        Ok(head) => head,
        Err(0) => return,
        Err(408) => { write_reply(&mut stream, &failure(408, "请求头传输超时"), write_timeout); return; }
        Err(431) => { write_reply(&mut stream, &failure(431, "请求头过大"), write_timeout); return; }
        Err(_) => { write_reply(&mut stream, &failure(400, "HTTP 请求格式错误"), write_timeout); return; }
    };
    let request = HttpRequest { method, url, headers, stream };
    let host = format!("127.0.0.1:{}", gate.port);
    if request.header("Origin").is_some() || request.header("Host").as_deref() != Some(host.as_str()) || !authorized(&request.header("Authorization").unwrap_or_default(), &format!("Bearer {}", gate.token)) {
        answer(request, failure(401, "需要本机 Bearer token，拒绝网页跨站请求")); return;
    }
    if request.header("Transfer-Encoding").is_some() { answer(request, failure(411, "请使用 Content-Length 发送请求体")); return; }
    let length = match request.header("Content-Length").map(|value| value.parse::<usize>()) { None => 0, Some(Ok(n)) => n, Some(Err(_)) => { answer(request, failure(400, "Content-Length 无效")); return; } };
    if length > MAX_BODY { answer(request, failure(413, "请求超过 64 MB")); return; }
    // A write without a body (e.g. DELETE with Idempotency-Key) needs no Content-Type.
    let has_body = request.header("Content-Length").is_some_and(|n| n.trim() != "0") || request.header("Transfer-Encoding").is_some();
    if request.method != "GET" && has_body && request.header("Content-Type").unwrap_or_default().split(';').next().unwrap_or("").trim() != "application/json" { answer(request, failure(415, "请求使用 application/json")); return; }
    if !(gate.ready)() { answer(request, failure(503, "应用尚未就绪，请稍后重试")); return; }
    let Some(slot) = take_slot(&gate.in_flight, gate.limits.max_in_flight) else { answer(request, failure(503, "排队请求过多，请稍后用相同 request_id 重试")); return; };
    let mut request = request;
    match read_body(&mut request.stream, initial, length, Instant::now() + gate.limits.body_timeout) {
        Ok(bytes) => { let _ = work.send(Job { request, bytes, _slot: slot }); }
        // Release the request slot before replying, so it is free once the client sees the error.
        Err(408) => { drop(slot); answer(request, failure(408, "请求体传输超时")) }
        Err(_) => { drop(slot); answer(request, failure(400, "读取请求失败")) }
    }
}
/// Removes agent.json on exit, but only if it still holds this run's token.
pub fn cleanup(app: &AppHandle) {
    let Some(state) = app.try_state::<AgentState>() else { return };
    let Ok(connection) = state.connection.lock() else { return };
    if let Some((path, token)) = connection.as_ref() { remove_connection_file(path, token); }
}
/// Deletes the connection file only when it still belongs to this run (a newer instance may own it).
fn remove_connection_file(path: &std::path::Path, token: &str) -> bool {
    let ours = fs::read_to_string(path).ok().and_then(|text| serde_json::from_str::<Value>(&text).ok()).is_some_and(|value| value["token"].as_str() == Some(token));
    ours && fs::remove_file(path).is_ok()
}
fn millis() -> u128 { SystemTime::now().duration_since(UNIX_EPOCH).unwrap_or_default().as_millis() }
fn random() -> AppResult<String> { let mut bytes = [0u8; 32]; getrandom::fill(&mut bytes).map_err(err)?; Ok(bytes.iter().map(|byte| format!("{byte:02x}")).collect()) }
fn canonical(value: &Value) -> Value {
    match value {
        Value::Object(map) => { let mut keys: Vec<_> = map.keys().collect(); keys.sort(); Value::Object(keys.into_iter().map(|key| (key.clone(), canonical(&map[key]))).collect()) },
        Value::Array(items) => Value::Array(items.iter().map(canonical).collect()),
        _ => value.clone(),
    }
}
fn failure(status: u16, message: &str) -> Reply { Reply { status, body: json!({"error":message}).to_string(), content_type: "application/json;charset=utf-8".into(), encoding: None, audit_ids: None } }
fn answer(mut request: HttpRequest, reply: Reply) { write_reply(&mut request.stream, &reply, LIMITS.write_timeout); }
fn authorized(actual: &str, expected: &str) -> bool {
    actual.len() == expected.len() && actual.bytes().zip(expected.bytes()).fold(0u8, |n, (a,b)| n | (a ^ b)) == 0
}
fn ledger(connection: &rusqlite::Connection) -> AppResult<()> {
    connection.execute_batch("CREATE TABLE IF NOT EXISTS agent_requests (request_id TEXT PRIMARY KEY, fingerprint TEXT NOT NULL, reply TEXT NOT NULL)").map_err(err)
}

pub fn start(app: &AppHandle) -> AppResult<()> {
    if std::env::var("ATLAS_AGENT_DISABLED").as_deref() == Ok("1") { return Ok(()); }
    let port: u16 = std::env::var("ATLAS_AGENT_PORT").unwrap_or_else(|_| "0".into()).parse().map_err(|_| "ATLAS_AGENT_PORT 无效")?;
    let listener = TcpListener::bind((std::net::Ipv4Addr::LOCALHOST, port)).map_err(err)?;
    let port = listener.local_addr().map_err(err)?.port();
    let token = random()?;
    let data_dir = app.state::<LibraryState>().data_dir.clone();
    let path = data_dir.join("agent.json");
    let temporary = data_dir.join("agent.json.tmp");
    let mut options = fs::OpenOptions::new(); options.write(true).create(true).truncate(true);
    #[cfg(unix)] { use std::os::unix::fs::OpenOptionsExt; options.mode(0o600); }
    {
        use std::io::Write;
        let mut file = options.open(&temporary).map_err(err)?;
        file.write_all(json!({"protocol":1,"url":format!("http://127.0.0.1:{port}"),"token":token,"pid":std::process::id(),"mode":"desktop"}).to_string().as_bytes()).map_err(err)?;
        file.sync_all().map_err(err)?;
    }
    // Windows has no mode bits: limit the file to the current user before it becomes visible.
    #[cfg(windows)] if let Err(error) = restrict_to_current_user(&temporary) { eprintln!("agent.json ACL: {error}"); }
    fs::rename(&temporary, &path).map_err(err)?;
    let audit = data_dir.join(AUDIT_FLAG).exists();
    app.manage(AgentState { ready: AtomicBool::new(false), pending: Mutex::new(HashMap::new()), connection: Mutex::new(Some((path, token.clone()))), audit: AtomicBool::new(audit), data_dir: data_dir.clone() });
    let (work, jobs) = mpsc::channel::<Job>();
    let worker = app.clone();
    // One worker keeps library operations serial; connections are read on their own threads.
    std::thread::spawn(move || { for job in jobs { process(&worker, job); } });
    let ready = app.clone();
    let gate = Arc::new(Gate { token, port, ready: Box::new(move || ready.state::<AgentState>().ready.load(Ordering::SeqCst)), in_flight: Arc::new(AtomicUsize::new(0)), limits: LIMITS });
    std::thread::spawn(move || serve(listener, gate, work));
    Ok(())
}

fn process(app: &AppHandle, job: Job) {
    let Job { request, bytes, _slot } = job;
    let state = app.state::<AgentState>();
    if !state.ready.load(Ordering::SeqCst) { answer(request, failure(503, "应用尚未就绪，请稍后重试")); return; }
    let method = request.method.clone();
    let url = request.url.clone();
    let request_header = match (request.header("Idempotency-Key"), request.header("X-Request-Id")) {
        (Some(a), Some(b)) if a != b => { answer(request, failure(422, "Idempotency-Key 与 X-Request-Id 请求头不一致")); return; },
        (a, b) => a.or(b),
    };
    let body: Value = if bytes.is_empty() { json!({}) } else { match serde_json::from_slice(&bytes) { Ok(value) => value, Err(_) => { answer(request, failure(400, "JSON 语法错误")); return; } } };
    let request_id = request_header.or_else(|| body.get("request_id").and_then(Value::as_str).map(str::to_string));
    let id = match random() { Ok(id) => id, Err(_) => { answer(request, failure(500, "无法生成请求编号")); return; } };
    let deadline = millis() + 30000;
    let fingerprint = format!("{:x}", Sha256::digest([format!("{method}\n{url}\n").as_bytes(), canonical(&body).to_string().as_bytes()].concat()));
    let root = match app.state::<LibraryState>().root.lock() { Ok(root) => root.clone(), Err(_) => { answer(request, failure(503, "资料库暂不可用")); return; } };
    let (sender, receiver) = mpsc::channel();
    if let Ok(mut pending) = state.pending.lock() { pending.insert(id.clone(), Pending { sender, deadline, root, request_id: request_id.clone(), fingerprint: fingerprint.clone() }); }
    if app.emit_to("main", "atlas-agent-request", json!({"id":id,"method":method,"url":url,"body":body,"fingerprint":fingerprint,"request_id":request_id,"deadline":deadline})).is_err() {
        if let Ok(mut pending) = state.pending.lock() { pending.remove(&id); }
        answer(request, failure(503, "应用连接未就绪")); return;
    }
    let reply = receiver.recv_timeout(Duration::from_secs(30)).unwrap_or_else(|_| failure(504, "请求超时；写操作请使用相同 request_id 重试"));
    if let Ok(mut pending) = state.pending.lock() { pending.remove(&id); }
    if state.audit.load(Ordering::SeqCst) && (method != "GET" || url.starts_with("/backup")) {
        write_audit(&state.data_dir, &audit_line(&method, &url, request_id.as_deref(), &reply));
    }
    answer(request, reply);
}

const AUDIT_FLAG: &str = "agent-audit.on";
const AUDIT_FILE: &str = "audit.jsonl";
const AUDIT_MAX: u64 = 10 * 1024 * 1024;
/// One line per request: time, endpoint, request_id, status and affected ids. No token, body or entry text.
fn audit_line(method: &str, url: &str, request_id: Option<&str>, reply: &Reply) -> String {
    let path = url.split('?').next().unwrap_or(url);
    let query: Vec<&str> = url.split_once('?').map(|(_, q)| q.split('&').filter_map(|pair| pair.split('=').next()).collect()).unwrap_or_default();
    json!({"time": millis() as u64, "method": method, "endpoint": path, "query_keys": query, "request_id": request_id, "status": reply.status, "ids": reply.audit_ids.clone().unwrap_or_default()}).to_string()
}
fn write_audit(dir: &std::path::Path, line: &str) {
    let path = dir.join(AUDIT_FILE);
    if fs::metadata(&path).map(|m| m.len() > AUDIT_MAX).unwrap_or(false) { let _ = fs::rename(&path, dir.join("audit.1.jsonl")); }
    if let Ok(mut file) = fs::OpenOptions::new().create(true).append(true).open(&path) { let _ = writeln!(file, "{line}"); }
}
#[tauri::command]
pub fn agent_audit(state: State<AgentState>, enabled: Option<bool>) -> AppResult<bool> {
    if let Some(enabled) = enabled {
        let flag = state.data_dir.join(AUDIT_FLAG);
        if enabled { fs::write(&flag, b"1").map_err(err)?; } else if flag.exists() { fs::remove_file(&flag).map_err(err)?; }
        state.audit.store(enabled, Ordering::SeqCst);
    }
    Ok(state.audit.load(Ordering::SeqCst))
}
/// Removes inherited ACEs and grants full control to the current user only.
#[cfg(windows)]
fn restrict_to_current_user(path: &std::path::Path) -> Result<(), String> {
    use std::os::windows::process::CommandExt;
    let user = std::env::var("USERNAME").map_err(|_| "USERNAME 未设置".to_string())?;
    let account = match std::env::var("USERDOMAIN") { Ok(domain) if !domain.is_empty() => format!("{domain}\\{user}"), _ => user };
    let output = std::process::Command::new("icacls").arg(path).args(["/inheritance:r", "/grant:r"]).arg(format!("{account}:F")).creation_flags(0x0800_0000).output().map_err(|e| e.to_string())?;
    if output.status.success() { Ok(()) } else { Err(String::from_utf8_lossy(&output.stderr).into_owned()) }
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
    #[test] fn slots_are_limited_and_released() {
        let counter = Arc::new(AtomicUsize::new(0));
        let a = take_slot(&counter, 2).unwrap(); let _b = take_slot(&counter, 2).unwrap();
        assert!(take_slot(&counter, 2).is_none());
        drop(a); assert!(take_slot(&counter, 2).is_some());
    }
    const TEST_LIMITS: Limits = Limits { header_timeout: Duration::from_millis(400), body_timeout: Duration::from_millis(400), write_timeout: Duration::from_millis(400), max_connections: 32, max_in_flight: 8 };
    /// Starts the real transport with a worker that answers every request with 200.
    fn test_server() -> (u16, Arc<AtomicUsize>) { test_server_with(TEST_LIMITS) }
    fn test_server_with(limits: Limits) -> (u16, Arc<AtomicUsize>) {
        let listener = TcpListener::bind((std::net::Ipv4Addr::LOCALHOST, 0)).unwrap();
        let port = listener.local_addr().unwrap().port();
        let in_flight = Arc::new(AtomicUsize::new(0));
        let gate = Arc::new(Gate { token: "t".into(), port, ready: Box::new(|| true), in_flight: in_flight.clone(), limits });
        let (work, jobs) = mpsc::channel::<Job>();
        std::thread::spawn(move || { for job in jobs { let body = String::from_utf8_lossy(&job.bytes).to_string(); answer(job.request, Reply { status: 200, body, content_type: "text/plain\r\nX-Evil: 1".into(), encoding: None, audit_ids: None }); } });
        std::thread::spawn(move || serve(listener, gate, work));
        (port, in_flight)
    }
    fn send(port: u16, raw: String) -> String {
        let mut stream = TcpStream::connect(("127.0.0.1", port)).unwrap();
        stream.set_read_timeout(Some(Duration::from_secs(5))).unwrap();
        stream.write_all(raw.as_bytes()).unwrap();
        let mut text = String::new(); let _ = stream.read_to_string(&mut text); text
    }
    fn get(port: u16) -> String { send(port, format!("GET /stats HTTP/1.1\r\nHost: 127.0.0.1:{port}\r\nAuthorization: Bearer t\r\n\r\n")) }
    fn post_head(port: u16) -> String { format!("POST /undo HTTP/1.1\r\nHost: 127.0.0.1:{port}\r\nAuthorization: Bearer t\r\nContent-Type: application/json\r\nContent-Length: 10\r\n\r\n") }
    fn pair() -> (TcpStream, TcpStream) {
        let listener = TcpListener::bind((std::net::Ipv4Addr::LOCALHOST, 0)).unwrap();
        let client = TcpStream::connect(listener.local_addr().unwrap()).unwrap();
        (listener.accept().unwrap().0, client)
    }
    fn trickle(mut stream: TcpStream, every: Duration, total: Duration) -> std::thread::JoinHandle<()> {
        std::thread::spawn(move || { let end = Instant::now() + total; while Instant::now() < end { if stream.write_all(b"x").is_err() { break; } std::thread::sleep(every); } })
    }
    #[test] fn drain_stops_at_its_deadline_under_trickle() {
        let (mut server, client) = pair();
        let feeder = trickle(client.try_clone().unwrap(), Duration::from_millis(50), Duration::from_secs(3));
        let started = Instant::now();
        write_reply(&mut server, &failure(400, "x"), Duration::from_secs(1));
        assert!(started.elapsed() < DRAIN_DEADLINE + Duration::from_millis(300), "{:?}", started.elapsed());
        drop((server, client)); let _ = feeder.join();
    }
    #[test] fn slow_reader_cannot_hold_writer_past_deadline() {
        let (mut server, client) = pair();
        let big = Reply { status: 200, body: "a".repeat(64 * 1024 * 1024), content_type: "text/plain".into(), encoding: None, audit_ids: None };
        let started = Instant::now();
        write_reply(&mut server, &big, Duration::from_millis(300)); // client never reads
        assert!(started.elapsed() < Duration::from_millis(1500), "{:?}", started.elapsed());
        drop(client);
    }
    #[test] fn trickling_rejected_client_does_not_block_accept() {
        let limits = Limits { max_connections: 2, ..TEST_LIMITS };
        let (port, _) = test_server_with(limits);
        let held: Vec<TcpStream> = (0..2).map(|_| TcpStream::connect(("127.0.0.1", port)).unwrap()).collect();
        std::thread::sleep(Duration::from_millis(100));
        // Rejected with 503 (or reset), then keeps sending a byte every 100 ms.
        let rejected = TcpStream::connect(("127.0.0.1", port)).unwrap();
        let feeders: Vec<_> = (0..3).map(|_| trickle(TcpStream::connect(("127.0.0.1", port)).unwrap(), Duration::from_millis(100), Duration::from_secs(3))).collect();
        let feeder = trickle(rejected.try_clone().unwrap(), Duration::from_millis(100), Duration::from_secs(3));
        // Held slots free after the header timeout plus the bounded drain of their 408 reply.
        std::thread::sleep(limits.header_timeout + DRAIN_DEADLINE + Duration::from_millis(300));
        let started = Instant::now();
        let reply = get(port);
        assert!(reply.starts_with("HTTP/1.1 200"), "{reply}");
        assert!(started.elapsed() < Duration::from_millis(1000), "{:?}", started.elapsed());
        drop((held, rejected)); let _ = feeder.join(); for f in feeders { let _ = f.join(); }
    }
    #[test] fn transport_keeps_security_checks() {
        let (port, _) = test_server();
        let ok = get(port);
        assert!(ok.starts_with("HTTP/1.1 200"), "{ok}"); assert!(!ok.contains("X-Evil"));
        assert!(send(port, format!("GET /stats HTTP/1.1\r\nHost: 127.0.0.1:{port}\r\n\r\n")).starts_with("HTTP/1.1 401"));
        assert!(send(port, format!("GET /stats HTTP/1.1\r\nHost: 127.0.0.1:{port}\r\nAuthorization: Bearer t\r\nOrigin: http://evil\r\n\r\n")).starts_with("HTTP/1.1 401"));
        assert!(send(port, "GET /stats HTTP/1.1\r\nHost: localhost\r\nAuthorization: Bearer t\r\n\r\n".into()).starts_with("HTTP/1.1 401"));
        assert!(send(port, format!("POST /undo HTTP/1.1\r\nHost: 127.0.0.1:{port}\r\nAuthorization: Bearer t\r\nContent-Type: text/plain\r\nContent-Length: 2\r\n\r\n{{}}")).starts_with("HTTP/1.1 415"));
        assert!(send(port, format!("POST /undo HTTP/1.1\r\nHost: 127.0.0.1:{port}\r\nAuthorization: Bearer t\r\nContent-Type: application/json\r\nContent-Length: 999999999\r\n\r\n")).starts_with("HTTP/1.1 413"));
        assert!(send(port, format!("POST /undo HTTP/1.1\r\nHost: 127.0.0.1:{port}\r\nAuthorization: Bearer t\r\nContent-Type: application/json\r\nTransfer-Encoding: chunked\r\n\r\n")).starts_with("HTTP/1.1 411"));
        assert!(send(port, format!("DELETE /catalog/x HTTP/1.1\r\nHost: 127.0.0.1:{port}\r\nAuthorization: Bearer t\r\nIdempotency-Key: k1\r\n\r\n")).starts_with("HTTP/1.1 200"));
        let echoed = send(port, format!("POST /undo HTTP/1.1\r\nHost: 127.0.0.1:{port}\r\nAuthorization: Bearer t\r\nContent-Type: application/json\r\nContent-Length: 2\r\n\r\n{{}}"));
        assert!(echoed.starts_with("HTTP/1.1 200") && echoed.ends_with("{}"), "{echoed}");
        assert!(send(port, format!("GET /x HTTP/1.1\r\n{}\r\n\r\n", "a: b\r\n".repeat(4000))).starts_with("HTTP/1.1 431"));
    }
    #[test] fn idle_connection_is_dropped_within_timeout_and_frees_its_slot() {
        let (port, in_flight) = test_server();
        let started = Instant::now();
        // Sends nothing at all.
        let mut silent = TcpStream::connect(("127.0.0.1", port)).unwrap();
        silent.set_read_timeout(Some(Duration::from_secs(5))).unwrap();
        let mut text = String::new(); let _ = silent.read_to_string(&mut text);
        assert!(text.starts_with("HTTP/1.1 408"), "{text}");
        assert!(started.elapsed() < Duration::from_secs(2));
        // Sends headers, then stalls the body while holding a request slot.
        let mut stalled = TcpStream::connect(("127.0.0.1", port)).unwrap();
        stalled.write_all(post_head(port).as_bytes()).unwrap();
        std::thread::sleep(Duration::from_millis(100));
        assert_eq!(in_flight.load(Ordering::SeqCst), 1);
        stalled.set_read_timeout(Some(Duration::from_secs(5))).unwrap();
        let mut text = String::new(); let _ = stalled.read_to_string(&mut text);
        assert!(text.starts_with("HTTP/1.1 408"), "{text}");
        assert_eq!(in_flight.load(Ordering::SeqCst), 0);
    }
    #[test] fn eight_stalled_requests_stop_blocking_after_timeout() {
        let (port, in_flight) = test_server();
        let stalled: Vec<TcpStream> = (0..8).map(|_| { let mut s = TcpStream::connect(("127.0.0.1", port)).unwrap(); s.write_all(post_head(port).as_bytes()).unwrap(); s }).collect();
        std::thread::sleep(Duration::from_millis(100));
        assert_eq!(in_flight.load(Ordering::SeqCst), 8);
        assert!(get(port).starts_with("HTTP/1.1 503"));
        std::thread::sleep(TEST_LIMITS.body_timeout + Duration::from_millis(300));
        assert_eq!(in_flight.load(Ordering::SeqCst), 0);
        assert!(get(port).starts_with("HTTP/1.1 200"));
        // Let the stalled connections finish their bounded drain so all connection slots are free.
        drop(stalled); std::thread::sleep(DRAIN_DEADLINE + Duration::from_millis(100));
        // Connections that never send anything are also bounded and released.
        let idle: Vec<TcpStream> = (0..TEST_LIMITS.max_connections).map(|_| TcpStream::connect(("127.0.0.1", port)).unwrap()).collect();
        std::thread::sleep(Duration::from_millis(100));
        // Rejected without blocking: the client sees the 503, or a reset if its request arrived after the close.
        let busy = get(port);
        assert!(busy.starts_with("HTTP/1.1 503") || busy.is_empty(), "{busy}");
        std::thread::sleep(TEST_LIMITS.header_timeout + DRAIN_DEADLINE + Duration::from_millis(300));
        assert!(get(port).starts_with("HTTP/1.1 200"));
        drop(idle);
    }
    #[test] fn connection_file_removed_only_with_matching_token() {
        let path = std::env::temp_dir().join(format!("atlas-agent-{}.json", random().unwrap()));
        fs::write(&path, json!({"token":"other"}).to_string()).unwrap();
        assert!(!remove_connection_file(&path, "mine")); assert!(path.exists());
        fs::write(&path, json!({"token":"mine"}).to_string()).unwrap();
        assert!(remove_connection_file(&path, "mine")); assert!(!path.exists());
    }
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
    #[test]
    fn base64_bodies_are_decoded_and_audit_lines_carry_no_body() {
        let reply = Reply { status: 200, body: "UEsDBA==".into(), content_type: "application/zip".into(), encoding: Some("base64".into()), audit_ids: Some(vec!["a".into()]) };
        assert_eq!(&*reply.bytes(), b"PK\x03\x04");
        let plain = Reply { status: 200, body: "{\"secret\":1}".into(), content_type: "application/json".into(), encoding: None, audit_ids: None };
        assert_eq!(&*plain.bytes(), plain.body.as_bytes());
        let line: Value = serde_json::from_str(&audit_line("PATCH", "/catalog/x?dry_run=1&token=abc", Some("r1"), &plain)).unwrap();
        assert_eq!(line["endpoint"], "/catalog/x");
        assert_eq!(line["query_keys"], json!(["dry_run", "token"]));
        assert!(!line.to_string().contains("abc") && !line.to_string().contains("secret"));
        let dir = std::env::temp_dir().join(format!("atlas-audit-{}", random().unwrap()));
        fs::create_dir_all(&dir).unwrap();
        write_audit(&dir, "{\"a\":1}"); write_audit(&dir, "{\"a\":2}");
        assert_eq!(fs::read_to_string(dir.join(AUDIT_FILE)).unwrap().lines().count(), 2);
        let _ = fs::remove_dir_all(dir);
    }
    #[cfg(windows)]
    #[test]
    fn connection_file_acl_is_current_user_only() {
        let path = std::env::temp_dir().join(format!("atlas-acl-{}.json", random().unwrap()));
        fs::write(&path, "{}").unwrap();
        restrict_to_current_user(&path).unwrap();
        let output = std::process::Command::new("icacls").arg(&path).output().unwrap();
        let text = String::from_utf8_lossy(&output.stdout).to_lowercase();
        assert!(text.contains(&std::env::var("USERNAME").unwrap().to_lowercase()), "{text}");
        assert!(!text.contains("everyone") && !text.contains("builtin\\users") && !text.contains("(i)"), "{text}");
        let _ = fs::remove_file(path);
    }
}