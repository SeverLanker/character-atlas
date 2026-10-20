use base64::{engine::general_purpose::STANDARD, Engine};
use rusqlite::{params, Connection, OptionalExtension};
use serde_json::Value;
use std::{
    fs,
    path::{Path, PathBuf},
    sync::Mutex,
    time::{SystemTime, UNIX_EPOCH},
};
use tauri::{AppHandle, Manager, State};
use tauri_plugin_dialog::DialogExt;

mod native_write;
use native_write::{check_size, suggested_file_name, validate_target, WriteKind};

struct LibraryState {
    root: Mutex<PathBuf>,
    config: PathBuf,
    /// 应用数据目录（含 library-config.json 与默认资料库），任何导出都不能写到这里。
    data_dir: PathBuf,
}
type AppResult<T> = Result<T, String>;
fn err(e: impl std::fmt::Display) -> String {
    e.to_string()
}
fn prepare(root: &Path) -> AppResult<Connection> {
    fs::create_dir_all(root.join("assets")).map_err(err)?;
    fs::create_dir_all(root.join("backups")).map_err(err)?;
    let connection = Connection::open(root.join("library.sqlite")).map_err(err)?;
    connection
        .busy_timeout(std::time::Duration::from_secs(5))
        .map_err(err)?;
    connection.execute_batch("PRAGMA journal_mode=DELETE; PRAGMA synchronous=FULL; CREATE TABLE IF NOT EXISTS library (id INTEGER PRIMARY KEY CHECK(id=1), data TEXT NOT NULL);").map_err(err)?;
    Ok(connection)
}
fn validate_data(data: &str) -> AppResult<()> {
    let value: Value = serde_json::from_str(data).map_err(err)?;
    if !matches!(value.get("schemaVersion").and_then(Value::as_u64), Some(1 | 2))
        || !value.get("characters").is_some_and(Value::is_array)
    {
        return Err("资料库结构无效".into());
    }
    Ok(())
}
fn asset_path(root: &Path, name: &str) -> AppResult<PathBuf> {
    let (stem, extension) = name.rsplit_once('.').ok_or("图片名称无效")?;
    if stem.is_empty()
        || stem.len() > 128
        || !stem
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_')
        || !["png", "jpg", "jpeg", "webp", "gif"].contains(&extension)
    {
        return Err("图片名称无效".into());
    }
    Ok(root.join("assets").join(name))
}
fn atomic_write(path: &Path, data: &[u8]) -> AppResult<()> {
    let nonce = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(err)?
        .as_nanos();
    let temporary = path.with_file_name(format!(".atlas-{}-{nonce}.tmp", std::process::id()));
    let file = fs::OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(&temporary)
        .map_err(err)?;
    let result = (|| -> AppResult<()> {
        use std::io::Write;
        let mut file = file;
        file.write_all(data).map_err(err)?;
        file.sync_all().map_err(err)?;
        drop(file);
        // Rust rename replaces files atomically on Windows and Unix.
        fs::rename(&temporary, path).map_err(err)
    })();
    if result.is_err() {
        let _ = fs::remove_file(&temporary);
    }
    result
}
fn snapshot(root: &Path) -> AppResult<()> {
    let seconds = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(err)?
        .as_secs();
    let folder = root.join("backups");
    let mut previous: Vec<_> = fs::read_dir(&folder)
        .map_err(err)?
        .filter_map(Result::ok)
        .filter(|entry| entry.path().extension().is_some_and(|ext| ext == "sqlite"))
        .collect();
    previous.sort_by_key(|entry| entry.file_name());
    let newest = previous
        .last()
        .and_then(|entry| entry.metadata().ok())
        .and_then(|m| m.modified().ok());
    if newest.is_some_and(|t| {
        SystemTime::now()
            .duration_since(t)
            .unwrap_or_default()
            .as_secs()
            < 1800
    }) {
        return Ok(());
    }
    if root.join("library.sqlite").exists() {
        fs::copy(
            root.join("library.sqlite"),
            folder.join(format!("library-{seconds}.sqlite")),
        )
        .map_err(err)?;
    }
    while previous.len() >= 10 {
        let entry = previous.remove(0);
        fs::remove_file(entry.path()).map_err(err)?;
    }
    Ok(())
}
#[tauri::command]
fn load_library(state: State<LibraryState>) -> AppResult<Option<String>> {
    let root = state.root.lock().map_err(err)?;
    let connection = prepare(&root)?;
    connection
        .query_row("SELECT data FROM library WHERE id=1", [], |r| r.get(0))
        .optional()
        .map_err(err)
}
#[tauri::command]
fn save_library(state: State<LibraryState>, data: String) -> AppResult<()> {
    validate_data(&data)?;
    let root = state.root.lock().map_err(err)?;
    let connection = prepare(&root)?;
    let old: Option<String> = connection
        .query_row("SELECT data FROM library WHERE id=1", [], |r| r.get(0))
        .optional()
        .map_err(err)?;
    if old.as_deref() == Some(data.as_str()) {
        return Ok(());
    }
    if old.is_some() {
        snapshot(&root)?;
    }
    connection.execute("INSERT INTO library(id,data) VALUES(1,?1) ON CONFLICT(id) DO UPDATE SET data=excluded.data",params![data]).map_err(err)?;
    Ok(())
}
#[tauri::command]
fn write_asset(state: State<LibraryState>, name: String, data: String) -> AppResult<()> {
    let bytes = STANDARD.decode(data).map_err(err)?;
    if bytes.len() > 12 * 1024 * 1024 {
        return Err("图片超过 12 MB".into());
    }
    let root = state.root.lock().map_err(err)?;
    atomic_write(&asset_path(&root, &name)?, &bytes)
}
#[tauri::command]
fn read_asset(state: State<LibraryState>, name: String) -> AppResult<String> {
    let root = state.root.lock().map_err(err)?;
    Ok(STANDARD.encode(fs::read(asset_path(&root, &name)?).map_err(err)?))
}
/// 弹出系统保存对话框（Rust 侧），校验用户选的路径后原子写入。返回 false 表示用户取消。
/// 前端只提供内容和建议文件名，路径从不经过前端。
fn save_with_dialog(
    app: &AppHandle,
    state: &LibraryState,
    kind: WriteKind,
    suggested_name: &str,
    data: &str,
) -> AppResult<bool> {
    // base64 解码前先按长度估算，避免对超大输入做无谓的解码。
    check_size(kind, data.len() / 4 * 3)?;
    let bytes = STANDARD.decode(data).map_err(|_| "导出内容损坏，未写入。".to_string())?;
    check_size(kind, bytes.len())?;
    let mut dialog = app
        .dialog()
        .file()
        .set_file_name(suggested_file_name(suggested_name, kind))
        .add_filter(kind.filter_name(), &[kind.extension()]);
    if let Some(window) = app.get_webview_window("main") {
        dialog = dialog.set_parent(&window);
    }
    let Some(chosen) = dialog.blocking_save_file() else {
        return Ok(false);
    };
    let chosen = chosen
        .into_path()
        .map_err(|_| "保存位置无效，请重新选择。".to_string())?;
    let protected = [state.root.lock().map_err(err)?.clone(), state.data_dir.clone()];
    let target = validate_target(&chosen, kind, &protected)?;
    atomic_write(&target, &bytes)?;
    Ok(true)
}
#[tauri::command]
async fn save_backup(
    app: AppHandle,
    state: State<'_, LibraryState>,
    suggested_name: String,
    data: String,
) -> AppResult<bool> {
    save_with_dialog(&app, &state, WriteKind::Backup, &suggested_name, &data)
}
#[tauri::command]
async fn save_export(
    app: AppHandle,
    state: State<'_, LibraryState>,
    suggested_name: String,
    kind: String,
    data: String,
) -> AppResult<bool> {
    let kind = match kind.as_str() {
        "md" => WriteKind::ExportMarkdown,
        "zip" => WriteKind::ExportZip,
        "json" => WriteKind::ExportJson,
        "csv" => WriteKind::ExportCsv,
        _ => return Err("不支持的导出类型".into()),
    };
    save_with_dialog(&app, &state, kind, &suggested_name, &data)
}
#[tauri::command]
fn library_location(state: State<LibraryState>) -> AppResult<String> {
    let root = state.root.lock().map_err(err)?;
    Ok(root.to_string_lossy().into_owned())
}
#[tauri::command]
fn open_library_folder(state: State<LibraryState>) -> AppResult<()> {
    let root = state.root.lock().map_err(err)?;
    #[cfg(target_os = "windows")]
    std::process::Command::new("explorer.exe")
        .arg(&*root)
        .spawn()
        .map_err(err)?;
    #[cfg(target_os = "macos")]
    std::process::Command::new("open")
        .arg(&*root)
        .spawn()
        .map_err(err)?;
    #[cfg(target_os = "linux")]
    std::process::Command::new("xdg-open")
        .arg(&*root)
        .spawn()
        .map_err(err)?;
    Ok(())
}
fn copy_directory(source: &Path, destination: &Path) -> AppResult<()> {
    fs::create_dir_all(destination).map_err(err)?;
    for entry in fs::read_dir(source).map_err(err)? {
        let entry = entry.map_err(err)?;
        let path = entry.path();
        let target = destination.join(entry.file_name());
        let file_type = entry.file_type().map_err(err)?;
        if file_type.is_symlink() {
            continue; // 资料库里不应有符号链接，迁移时不跟随
        } else if file_type.is_dir() {
            copy_directory(&path, &target)?;
        } else {
            fs::copy(path, target).map_err(err)?;
        }
    }
    Ok(())
}
fn relocate_to(state: &LibraryState, destination: &Path) -> AppResult<String> {
    let mut root = state.root.lock().map_err(err)?;
    if native_write::is_unc_or_device(&destination.to_string_lossy()) {
        return Err("不支持网络共享（UNC）或设备路径，请选择本机磁盘上的文件夹。".into());
    }
    let meta = fs::symlink_metadata(destination).map_err(|_| "请选择一个已存在的空文件夹".to_string())?;
    if meta.file_type().is_symlink() || !meta.is_dir() {
        return Err("请选择一个已存在的空文件夹（不支持符号链接）".into());
    }
    let destination = fs::canonicalize(destination).map_err(err)?;
    let current = fs::canonicalize(&*root).map_err(err)?;
    if destination == current || destination.starts_with(&current) {
        return Err("请选择资料库以外的空文件夹".into());
    }
    if fs::read_dir(&destination).map_err(err)?.next().is_some() {
        return Err("目标文件夹不是空的，请新建一个空文件夹".into());
    }
    copy_directory(&root, &destination)?;
    let value = serde_json::json!({"libraryPath":destination.to_string_lossy()});
    atomic_write(
        &state.config,
        serde_json::to_string(&value).map_err(err)?.as_bytes(),
    )?;
    *root = destination;
    Ok(root.to_string_lossy().to_string())
}
/// 迁移资料库：文件夹由 Rust 侧弹出的系统对话框选择，前端不再传路径。返回 None 表示取消。
#[tauri::command]
async fn relocate_library(app: AppHandle, state: State<'_, LibraryState>) -> AppResult<Option<String>> {
    let mut dialog = app.dialog().file().set_title("选择用于存放资料库的空文件夹");
    if let Some(window) = app.get_webview_window("main") {
        dialog = dialog.set_parent(&window);
    }
    let Some(folder) = dialog.blocking_pick_folder() else {
        return Ok(None);
    };
    let folder = folder
        .into_path()
        .map_err(|_| "文件夹无效，请重新选择。".to_string())?;
    relocate_to(&state, &folder).map(Some)
}
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _, _| {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.unminimize();
                let _ = window.set_focus();
            }
        }))
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            let data_dir = app.path().app_local_data_dir()?;
            fs::create_dir_all(&data_dir)?;
            let config = data_dir.join("library-config.json");
            let root = if config.exists() {
                let value: Value = serde_json::from_slice(&fs::read(&config)?)?;
                let path = value
                    .get("libraryPath")
                    .and_then(Value::as_str)
                    .ok_or("资料库路径配置无效")?;
                let root = PathBuf::from(path);
                if !root.is_dir() {
                    return Err("资料库目录不可访问，请恢复目录后重新打开叙册".into());
                }
                root
            } else {
                data_dir.join("library")
            };
            prepare(&root).map_err(std::io::Error::other)?;
            app.manage(LibraryState {
                root: Mutex::new(root),
                config,
                data_dir,
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            load_library,
            save_library,
            write_asset,
            read_asset,
            save_backup,
            save_export,
            library_location,
            open_library_folder,
            relocate_library
        ])
        .run(tauri::generate_context!())
        .expect("无法启动叙册，请检查资料库路径及文件权限");
}

#[cfg(test)]
mod tests {
    use super::*;
    fn temporary_directory() -> PathBuf {
        let path = std::env::temp_dir().join(format!(
            "atlas-test-{}",
            SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        fs::create_dir_all(&path).unwrap();
        path
    }
    #[test]
    fn rejects_invalid_asset_paths() {
        let root = PathBuf::from("library");
        for name in ["../secret.png", "x/y.jpg", "a.svg", ".png", "file.png.exe"] {
            assert!(asset_path(&root, name).is_err());
        }
        assert_eq!(
            asset_path(&root, "photo-123.png").unwrap(),
            root.join("assets/photo-123.png")
        );
    }
    #[test]
    fn atomic_write_replaces_existing_files() {
        let root = temporary_directory();
        let file = root.join("test.zip");
        let unrelated = root.join("test.tmp");
        fs::write(&unrelated, b"existing user file").unwrap();
        atomic_write(&file, b"first").unwrap();
        atomic_write(&file, b"second").unwrap();
        assert_eq!(fs::read(&file).unwrap(), b"second");
        assert_eq!(fs::read(&unrelated).unwrap(), b"existing user file");
        assert_eq!(fs::read_dir(&root).unwrap().count(), 2);
        fs::remove_dir_all(root).unwrap();
    }
    #[test]
    fn atomic_write_cleans_up_temporary_file_on_failure() {
        let root = temporary_directory();
        // 目标是已存在的非空文件夹，rename 会失败
        fs::create_dir_all(root.join("taken.zip").join("inner")).unwrap();
        assert!(atomic_write(&root.join("taken.zip"), b"data").is_err());
        let leftovers: Vec<_> = fs::read_dir(&root)
            .unwrap()
            .filter_map(Result::ok)
            .filter(|e| e.file_name().to_string_lossy().ends_with(".tmp"))
            .collect();
        assert!(leftovers.is_empty());
        fs::remove_dir_all(root).unwrap();
    }
    #[test]
    fn relocate_rejects_symlinks_and_non_empty_folders() {
        let base = temporary_directory();
        let root = base.join("lib");
        fs::create_dir_all(root.join("assets")).unwrap();
        let state = LibraryState {
            root: Mutex::new(root.clone()),
            config: base.join("config.json"),
            data_dir: base.clone(),
        };
        fs::create_dir_all(base.join("full").join("x")).unwrap();
        assert!(relocate_to(&state, &base.join("full")).is_err());
        assert!(relocate_to(&state, &root.join("assets")).is_err());
        assert!(relocate_to(&state, &base.join("missing")).is_err());
        #[cfg(unix)]
        {
            fs::create_dir_all(base.join("empty")).unwrap();
            std::os::unix::fs::symlink(base.join("empty"), base.join("link")).unwrap();
            assert!(relocate_to(&state, &base.join("link")).is_err());
        }
        fs::create_dir_all(base.join("new")).unwrap();
        assert!(relocate_to(&state, &base.join("new")).is_ok());
        assert!(base.join("new").join("assets").is_dir());
        fs::remove_dir_all(base).unwrap();
    }
    #[test]
    fn supports_old_and_new_library_schemas() {
        assert!(validate_data(r#"{"schemaVersion":1,"characters":[]}"#).is_ok());
        assert!(validate_data(r#"{"schemaVersion":2,"characters":[]}"#).is_ok());
        assert!(validate_data(r#"{"schemaVersion":99,"characters":[]}"#).is_err());
    }
    #[test]
    fn sqlite_roundtrip_and_snapshot() {
        let root = temporary_directory();
        {
            let db = prepare(&root).unwrap();
            db.execute(
                "INSERT INTO library (id,data) VALUES(1,?1)",
                params!["{\"schemaVersion\":1,\"characters\":[]}"],
            )
            .unwrap();
        }
        snapshot(&root).unwrap();
        let entries: Vec<_> = fs::read_dir(root.join("backups")).unwrap().collect();
        assert_eq!(entries.len(), 1);
        let db = Connection::open(entries[0].as_ref().unwrap().path()).unwrap();
        let saved: String = db
            .query_row("SELECT data FROM library WHERE id=1", [], |r| r.get(0))
            .unwrap();
        validate_data(&saved).unwrap();
        drop(db);
        fs::remove_dir_all(root).unwrap();
    }
}
