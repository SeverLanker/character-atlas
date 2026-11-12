//! Machine-local Obsidian roots. Paths live in the app data directory, never in library.sqlite or the ZIP.
use crate::native_write::is_unc_or_device;
use crate::{atomic_write, err, AppResult, LibraryState};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::BTreeMap;
use std::fs::{self, File};
use std::io::Read;
use std::path::{Path, PathBuf};
use tauri::{AppHandle, Manager, State};
use tauri_plugin_dialog::DialogExt;

const READ_LIMIT: usize = 256 * 1024;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PickedPath {
    absolute_path: String,
    name: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ArchiveProbe {
    status: String,
    detail: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ArchiveText {
    text: String,
    truncated: bool,
}

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BoundRoot {
    root_id: String,
    absolute_path: String,
}

pub fn bindings_file(data_dir: &Path) -> PathBuf {
    data_dir.join("archive-roots.json")
}

pub fn safe_relative(value: &str) -> bool {
    if value.is_empty() || value.len() > 500 || value.contains('\\') || value.contains(':') || value.contains('\0') {
        return false;
    }
    value.split('/').all(|part| !part.is_empty() && part != "." && part != "..")
}

fn valid_root_id(id: &str) -> bool {
    !id.is_empty() && id.len() <= 80 && id.chars().all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_')
}

fn load_map(file: &Path) -> AppResult<BTreeMap<String, String>> {
    if !file.exists() {
        return Ok(BTreeMap::new());
    }
    let text = fs::read_to_string(file).map_err(err)?;
    let value: Value = serde_json::from_str(&text).map_err(err)?;
    let Some(roots) = value.get("roots").and_then(Value::as_object) else {
        return Err("本机根目录映射无法读取".into());
    };
    let mut map = BTreeMap::new();
    for (id, path) in roots {
        let Some(path) = path.as_str() else { return Err("本机根目录映射无法读取".into()); };
        if !valid_root_id(id) {
            return Err("本机根目录映射无法读取".into());
        }
        map.insert(id.clone(), path.to_string());
    }
    Ok(map)
}

fn store_map(file: &Path, map: &BTreeMap<String, String>) -> AppResult<()> {
    let body = serde_json::json!({ "roots": map });
    atomic_write(file, serde_json::to_string_pretty(&body).map_err(err)?.as_bytes())
}

/// `canonicalize` on Windows returns `\\?\C:\...`. That is a local disk path, not a share.
/// Bindings store the plain form so the next lookup is not rejected as UNC.
fn local_disk_path(path: &Path) -> PathBuf {
    #[cfg(windows)]
    {
        use std::path::{Component, Prefix};
        let mut parts = path.components();
        if let Some(Component::Prefix(prefix)) = parts.next() {
            if let Prefix::VerbatimDisk(disk) = prefix.kind() {
                let mut plain = PathBuf::from(format!("{}:", disk as char));
                plain.push(parts.as_path());
                return plain;
            }
        }
    }
    path.to_path_buf()
}

pub fn canonicalize_dir(path: &Path) -> AppResult<PathBuf> {
    let path = local_disk_path(path);
    if is_unc_or_device(&path.to_string_lossy()) {
        return Err("不支持网络共享或设备路径".into());
    }
    let meta = fs::symlink_metadata(&path).map_err(|_| "根目录不存在".to_string())?;
    if meta.file_type().is_symlink() {
        return Err("根目录不能是符号链接".into());
    }
    if !meta.is_dir() {
        return Err("根目录必须是文件夹".into());
    }
    let canonical = local_disk_path(&path.canonicalize().map_err(|_| "根目录无法访问".to_string())?);
    if is_unc_or_device(&canonical.to_string_lossy()) {
        return Err("不支持网络共享或设备路径".into());
    }
    Ok(canonical)
}

pub fn save_root(file: &Path, root_id: &str, absolute: &Path) -> AppResult<()> {
    if !valid_root_id(root_id) {
        return Err("根目录编号无效".into());
    }
    let canonical = canonicalize_dir(absolute)?;
    let mut map = load_map(file)?;
    map.insert(root_id.to_string(), canonical.to_string_lossy().into_owned());
    store_map(file, &map)
}

pub fn relative_of(root: &Path, file: &Path) -> AppResult<String> {
    let root = canonicalize_dir(root)?;
    let meta = fs::symlink_metadata(file).map_err(|_| "找不到所选文件".to_string())?;
    if meta.file_type().is_symlink() || !meta.is_file() {
        return Err("请选择根目录内的普通文件".into());
    }
    let file = local_disk_path(&file.canonicalize().map_err(|_| "找不到所选文件".to_string())?);
    let relative = file.strip_prefix(&root).map_err(|_| "文件不在所选根目录内".to_string())?;
    let text = relative
        .components()
        .map(|part| part.as_os_str().to_string_lossy().replace('\\', "/"))
        .collect::<Vec<_>>()
        .join("/");
    if !safe_relative(&text) {
        return Err("相对路径无效".into());
    }
    Ok(text)
}

fn join_relative(root: &Path, relative: &str) -> AppResult<PathBuf> {
    if !safe_relative(relative) {
        return Err("相对路径无效".into());
    }
    let mut path = root.to_path_buf();
    for part in relative.split('/') {
        path.push(part);
    }
    if !path.starts_with(root) {
        return Err("相对路径无效".into());
    }
    Ok(path)
}

fn resolve_file(bindings: &Path, root_id: &str, relative: &str) -> AppResult<Result<PathBuf, ArchiveProbe>> {
    if !valid_root_id(root_id) || !safe_relative(relative) {
        return Err("相对路径无效".into());
    }
    let Some(stored) = load_map(bindings)?.get(root_id).cloned() else {
        return Ok(Err(ArchiveProbe { status: "unbound".into(), detail: "这台电脑还没有这个根目录的位置".into() }));
    };
    let root = match canonicalize_dir(Path::new(&stored)) {
        Ok(path) => path,
        Err(_) => return Ok(Err(ArchiveProbe { status: "missing".into(), detail: "本机映射处找不到根目录，可以重新选择".into() })),
    };
    let path = join_relative(&root, relative)?;
    let meta = match fs::symlink_metadata(&path) {
        Ok(meta) => meta,
        Err(_) => return Ok(Err(ArchiveProbe { status: "missing".into(), detail: "本机映射处找不到文件，可以重新选择".into() })),
    };
    if meta.file_type().is_symlink() {
        let canon = local_disk_path(&path.canonicalize().map_err(|_| "文件无法读取，或引用离开了根目录".to_string())?);
        if !canon.starts_with(&root) {
            return Ok(Err(ArchiveProbe { status: "unreadable".into(), detail: "文件无法读取，或引用离开了根目录".into() }));
        }
        return Ok(Err(ArchiveProbe { status: "unreadable".into(), detail: "文件无法读取，或引用离开了根目录".into() }));
    }
    if !meta.is_file() {
        return Ok(Err(ArchiveProbe { status: "unreadable".into(), detail: "文件无法读取，或引用离开了根目录".into() }));
    }
    Ok(Ok(path))
}

pub fn probe(bindings: &Path, root_id: &str, relative: &str) -> AppResult<ArchiveProbe> {
    match resolve_file(bindings, root_id, relative)? {
        Ok(_) => Ok(ArchiveProbe { status: "valid".into(), detail: "本机可以打开原文".into() }),
        Err(status) => Ok(status),
    }
}

fn text_extension(relative: &str) -> bool {
    let Some((_, ext)) = relative.rsplit_once('.') else { return false; };
    matches!(ext.to_ascii_lowercase().as_str(), "md" | "markdown" | "txt" | "text")
}

pub fn read_text(bindings: &Path, root_id: &str, relative: &str) -> AppResult<ArchiveText> {
    if !text_extension(relative) {
        return Err("界面只预览 Markdown 或纯文本，不把文件内容写入资料库".into());
    }
    let path = match resolve_file(bindings, root_id, relative)? {
        Ok(path) => path,
        Err(status) => return Err(status.detail),
    };
    let mut file = File::open(&path).map_err(|_| "文件无法读取，或引用离开了根目录".to_string())?;
    let mut buf = vec![0_u8; READ_LIMIT + 1];
    let mut read = 0;
    while read < buf.len() {
        let n = file.read(&mut buf[read..]).map_err(|_| "文件无法读取，或引用离开了根目录".to_string())?;
        if n == 0 { break; }
        read += n;
    }
    let truncated = read > READ_LIMIT;
    let end = read.min(READ_LIMIT);
    Ok(ArchiveText { text: String::from_utf8_lossy(&buf[..end]).into_owned(), truncated })
}

fn bindings_of(state: &LibraryState) -> PathBuf {
    bindings_file(&state.data_dir)
}

#[tauri::command]
pub fn archive_bindings(state: State<LibraryState>) -> AppResult<Vec<BoundRoot>> {
    let file = bindings_of(&state);
    Ok(load_map(&file)?.into_iter().map(|(root_id, absolute_path)| BoundRoot { root_id, absolute_path }).collect())
}

#[tauri::command]
pub fn archive_bind_root(state: State<LibraryState>, root_id: String, absolute_path: String) -> AppResult<()> {
    save_root(&bindings_of(&state), &root_id, Path::new(&absolute_path))
}

/// Removes machine paths for the given root ids. Does not delete, move, or open vault files.
pub fn forget_roots(file: &Path, root_ids: &[String]) -> AppResult<Vec<BoundRoot>> {
    let mut map = load_map(file)?;
    let mut removed = Vec::new();
    for id in root_ids {
        if !valid_root_id(id) {
            return Err("根目录编号无效".into());
        }
        if let Some(path) = map.remove(id) {
            removed.push(BoundRoot { root_id: id.clone(), absolute_path: path });
        }
    }
    if !removed.is_empty() {
        store_map(file, &map)?;
    }
    Ok(removed)
}

/// Writes machine paths back without opening them. Used when a deletion is undone.
pub fn restore_roots(file: &Path, roots: &[BoundRoot]) -> AppResult<()> {
    if roots.is_empty() {
        return Ok(());
    }
    let mut map = load_map(file)?;
    for root in roots {
        if !valid_root_id(&root.root_id) || root.absolute_path.is_empty() || root.absolute_path.len() > 1024 || root.absolute_path.contains('\0') {
            return Err("本机根目录映射无法恢复".into());
        }
        map.insert(root.root_id.clone(), root.absolute_path.clone());
    }
    store_map(file, &map)
}

#[tauri::command]
pub fn archive_forget_roots(state: State<LibraryState>, root_ids: Vec<String>) -> AppResult<Vec<BoundRoot>> {
    forget_roots(&bindings_of(&state), &root_ids)
}

#[tauri::command]
pub fn archive_restore_roots(state: State<LibraryState>, roots: Vec<BoundRoot>) -> AppResult<()> {
    restore_roots(&bindings_of(&state), &roots)
}

#[tauri::command]
pub fn archive_relative(state: State<LibraryState>, root_id: String, absolute_file: String) -> AppResult<String> {
    let Some(root) = load_map(&bindings_of(&state))?.get(&root_id).cloned() else {
        return Err("这台电脑还没有这个根目录的位置".into());
    };
    relative_of(Path::new(&root), Path::new(&absolute_file))
}

#[tauri::command]
pub fn archive_bind_parent(state: State<LibraryState>, root_id: String, absolute_file: String) -> AppResult<String> {
    let file = PathBuf::from(&absolute_file);
    let parent = file.parent().ok_or("文件没有所在文件夹")?;
    save_root(&bindings_of(&state), &root_id, parent)?;
    relative_of(parent, &file)
}

#[tauri::command]
pub fn archive_probe(state: State<LibraryState>, root_id: String, relative_path: String) -> AppResult<ArchiveProbe> {
    probe(&bindings_of(&state), &root_id, &relative_path)
}

#[tauri::command]
pub fn archive_read(state: State<LibraryState>, root_id: String, relative_path: String) -> AppResult<ArchiveText> {
    read_text(&bindings_of(&state), &root_id, &relative_path)
}

#[tauri::command]
pub fn archive_open(state: State<LibraryState>, root_id: String, relative_path: String) -> AppResult<()> {
    let path = match resolve_file(&bindings_of(&state), &root_id, &relative_path)? {
        Ok(path) => path,
        Err(status) => return Err(status.detail),
    };
    #[cfg(target_os = "windows")]
    std::process::Command::new("explorer.exe").arg(&path).spawn().map_err(err)?;
    #[cfg(target_os = "macos")]
    std::process::Command::new("open").arg(&path).spawn().map_err(err)?;
    #[cfg(target_os = "linux")]
    std::process::Command::new("xdg-open").arg(&path).spawn().map_err(err)?;
    Ok(())
}

fn picked_from_dialog(path: PathBuf, kind: &str) -> AppResult<PickedPath> {
    let meta = fs::symlink_metadata(&path).map_err(|_| "请重新选择。".to_string())?;
    if meta.file_type().is_symlink() {
        return Err("请选择普通文件或文件夹，不选择链接。".into());
    }
    let ok = if kind == "file" { meta.is_file() } else { meta.is_dir() };
    if !ok {
        return Err(if kind == "file" { "请选择文件，而不是文件夹。" } else { "请选择文件夹，而不是文件。" }.into());
    }
    let name = path.file_name().and_then(|item| item.to_str()).ok_or("名称无效")?.to_string();
    Ok(PickedPath { absolute_path: path.to_string_lossy().into_owned(), name })
}

#[tauri::command]
pub async fn archive_pick_file(app: AppHandle) -> AppResult<Option<PickedPath>> {
    let mut dialog = app.dialog().file().set_title("选择要引用的文件");
    if let Some(window) = app.get_webview_window("main") {
        dialog = dialog.set_parent(&window);
    }
    let Some(file) = dialog.blocking_pick_file() else { return Ok(None); };
    let path = file.into_path().map_err(|_| "文件无效，请重新选择。".to_string())?;
    picked_from_dialog(path, "file").map(Some)
}

#[tauri::command]
pub async fn archive_pick_root(app: AppHandle) -> AppResult<Option<PickedPath>> {
    let mut dialog = app.dialog().file().set_title("选择外部档案的根目录");
    if let Some(window) = app.get_webview_window("main") {
        dialog = dialog.set_parent(&window);
    }
    let Some(folder) = dialog.blocking_pick_folder() else { return Ok(None); };
    let path = folder.into_path().map_err(|_| "文件夹无效，请重新选择。".to_string())?;
    picked_from_dialog(path, "dir").map(Some)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::prepare;
    use rusqlite::params;
    use std::time::{SystemTime, UNIX_EPOCH};

    fn temp() -> PathBuf {
        let path = std::env::temp_dir().join(format!(
            "atlas-archives-{}",
            SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_nanos()
        ));
        fs::create_dir_all(&path).unwrap();
        path
    }

    #[test]
    fn rejects_escaping_relative_paths() {
        for value in ["../secret.md", "/etc/passwd", "C:/note.md", "foo/../../x.md", "foo//x.md", "foo\\x.md", ""] {
            assert!(!safe_relative(value), "{value}");
        }
        assert!(safe_relative("notes/角色.md"));
    }

    #[test]
    fn machine_path_stays_out_of_sqlite_and_read_does_not_rewrite_the_file() {
        let data = temp();
        let library = data.join("library");
        let vault = data.join("vault");
        let note = vault.join("notes").join("a.md");
        fs::create_dir_all(note.parent().unwrap()).unwrap();
        let original = "第一段。\n\n第二段仍然很长。\n";
        fs::write(&note, original).unwrap();
        let bindings = bindings_file(&data);
        assert!(!bindings.starts_with(&library));
        let root_id = "root-1";
        save_root(&bindings, root_id, &vault).unwrap();
        assert_eq!(relative_of(&vault, &note).unwrap(), "notes/a.md");
        assert_eq!(probe(&bindings, root_id, "notes/a.md").unwrap().status, "valid");
        assert_eq!(probe(&bindings, root_id, "notes/missing.md").unwrap().status, "missing");
        let text = read_text(&bindings, root_id, "notes/a.md").unwrap();
        assert_eq!(text.text, original);
        assert!(!text.truncated);
        assert_eq!(fs::read_to_string(&note).unwrap(), original);
        let db = prepare(&library).unwrap();
        let payload = r#"{"schemaVersion":2,"characters":[],"archiveRoots":[{"id":"root-1","label":"合成库"}],"externalArchives":[{"id":"ref-1","title":"札记","rootId":"root-1","relativePath":"notes/a.md","visibility":"private","note":"","createdAt":"2026-11-07T00:00:00.000Z","updatedAt":"2026-11-07T00:00:00.000Z"}]}"#;
        db.execute("INSERT INTO library (id,data) VALUES(1,?1)", params![payload]).unwrap();
        drop(db);
        let stored = fs::read(library.join("library.sqlite")).unwrap();
        let stored = String::from_utf8_lossy(&stored);
        let canonical = canonicalize_dir(&vault).unwrap();
        let encoded = serde_json::to_string(&canonical.to_string_lossy().to_string()).unwrap();
        let encoded = encoded.trim_matches('"');
        let absolute = fs::read_to_string(&bindings).unwrap();
        assert!(absolute.contains(encoded), "{absolute}");
        assert!(!absolute.contains('?'), "{absolute}");
        assert!(!stored.contains(encoded));
        assert!(!stored.contains(canonical.to_string_lossy().as_ref()));
        assert!(stored.contains("notes/a.md"));
        fs::remove_dir_all(data).unwrap();
    }

    #[cfg(unix)]
    #[test]
    fn symlink_root_and_escaping_link_are_refused() {
        let data = temp();
        let vault = data.join("vault");
        let outside = data.join("outside");
        fs::create_dir_all(&vault).unwrap();
        fs::create_dir_all(&outside).unwrap();
        fs::write(outside.join("secret.md"), b"secret-body").unwrap();
        let link_root = data.join("link-root");
        std::os::unix::fs::symlink(&outside, &link_root).unwrap();
        let bindings = bindings_file(&data);
        assert!(save_root(&bindings, "root-1", &link_root).is_err());
        save_root(&bindings, "root-1", &vault).unwrap();
        std::os::unix::fs::symlink(outside.join("secret.md"), vault.join("alias.md")).unwrap();
        let status = probe(&bindings, "root-1", "alias.md").unwrap();
        assert_eq!(status.status, "unreadable");
        assert!(!status.detail.contains("secret"));
        fs::remove_dir_all(data).unwrap();
    }

    #[test]
    fn forgetting_a_root_drops_only_the_mapping_and_leaves_the_file() {
        let data = temp();
        let library = data.join("library");
        let vault = data.join("vault");
        let note = vault.join("notes").join("a.md");
        fs::create_dir_all(note.parent().unwrap()).unwrap();
        let original = "不要删这篇。\n";
        fs::write(&note, original).unwrap();
        let bindings = bindings_file(&data);
        save_root(&bindings, "root-used", &vault).unwrap();
        save_root(&bindings, "root-spare", &vault).unwrap();
        let removed = forget_roots(&bindings, &["root-used".into()]).unwrap();
        assert_eq!(removed.len(), 1);
        assert_eq!(removed[0].root_id, "root-used");
        assert_eq!(fs::read_to_string(&note).unwrap(), original);
        assert!(note.is_file());
        let left = fs::read_to_string(&bindings).unwrap();
        assert!(!left.contains("root-used"));
        assert!(left.contains("root-spare"));
        let db = prepare(&library).unwrap();
        let payload = r#"{"schemaVersion":2,"characters":[{"id":"c1","name":"甲","collection":"雾港"}],"archiveRoots":[{"id":"root-used","label":"合成库"}]}"#;
        db.execute("INSERT INTO library (id,data) VALUES(1,?1)", params![payload]).unwrap();
        drop(db);
        let stored = String::from_utf8_lossy(&fs::read(library.join("library.sqlite")).unwrap()).into_owned();
        let absolute = removed[0].absolute_path.clone();
        assert!(!stored.contains(&absolute));
        assert!(stored.contains("雾港"));
        restore_roots(&bindings, &removed).unwrap();
        let restored = fs::read_to_string(&bindings).unwrap();
        assert!(restored.contains("root-used"));
        assert!(restored.contains(&absolute));
        assert_eq!(fs::read_to_string(&note).unwrap(), original);
        assert!(forget_roots(&bindings, &["../vault".into()]).is_err());
        fs::remove_dir_all(data).unwrap();
    }
}
