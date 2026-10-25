//! Read-only access to the automatic SQLite backups; never accepts an arbitrary path.
use crate::{err, validate_data, AppResult, LibraryState};
use rusqlite::{Connection, OpenFlags};
use serde::Serialize;
use serde_json::Value;
use std::{fs, path::{Path, PathBuf}};
use tauri::State;

fn stamp(id: &str) -> Option<u64> {
    let digits = id.strip_prefix("library-")?.strip_suffix(".sqlite")?;
    if digits.is_empty() || !digits.bytes().all(|c| c.is_ascii_digit()) { return None; }
    digits.parse::<u64>().ok().filter(|n| *n <= 253402300799)
}
fn snapshot_path(root: &Path, id: &str) -> AppResult<PathBuf> {
    if stamp(id).is_none() { return Err("自动备份编号无效".into()); }
    let folder = root.join("backups");
    let path = folder.join(id);
    if fs::symlink_metadata(&path).map_err(err)?.file_type().is_symlink() { return Err("不能读取链接形式的备份".into()); }
    let real = path.canonicalize().map_err(err)?;
    if real.parent() != Some(folder.canonicalize().map_err(err)?.as_path()) { return Err("备份不在资料库目录内".into()); }
    Ok(real)
}
fn read(root: &Path, id: &str) -> AppResult<String> {
    let path = snapshot_path(root, id)?;
    let db = Connection::open_with_flags(path, OpenFlags::SQLITE_OPEN_READ_ONLY | OpenFlags::SQLITE_OPEN_NO_MUTEX).map_err(err)?;
    let size: i64 = db.query_row("SELECT length(CAST(data AS BLOB)) FROM library WHERE id=1", [], |r| r.get(0)).map_err(err)?;
    if !(0..=64 * 1024 * 1024).contains(&size) { return Err("自动备份资料超过 64 MB".into()); }
    let text: String = db.query_row("SELECT data FROM library WHERE id=1", [], |r| r.get(0)).map_err(err)?;
    validate_data(&text)?;
    Ok(text)
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SnapshotInfo { id: String, created_at: u64, characters: Option<usize>, versions: Option<usize>, error: Option<String> }
fn list(root: &Path) -> AppResult<Vec<SnapshotInfo>> {
    let folder = root.join("backups");
    if !folder.exists() { return Ok(vec![]); }
    let mut ids: Vec<_> = fs::read_dir(folder).map_err(err)?.filter_map(Result::ok)
        .filter_map(|e| e.file_name().into_string().ok()).filter_map(|id| stamp(&id).map(|time| (id, time))).collect();
    ids.sort_by_key(|(_, time)| std::cmp::Reverse(*time));
    Ok(ids.into_iter().take(10).map(|(id, created_at)| {
        let parsed = read(root, &id).and_then(|s| serde_json::from_str::<Value>(&s).map_err(err));
        match parsed {
            Ok(value) => {
                let characters = value["characters"].as_array();
                SnapshotInfo { id, created_at, characters: characters.map(Vec::len), versions: characters.map(|cs| cs.iter().map(|c| c["versions"].as_array().map_or(0, Vec::len)).sum()), error: None }
            },
            Err(error) => SnapshotInfo { id, created_at, characters: None, versions: None, error: Some(error) },
        }
    }).collect())
}
#[tauri::command]
pub fn list_snapshots(state: State<LibraryState>) -> AppResult<Vec<SnapshotInfo>> { let root = state.root.lock().map_err(err)?; list(&root) }
#[tauri::command]
pub fn read_snapshot(state: State<LibraryState>, id: String) -> AppResult<String> { let root = state.root.lock().map_err(err)?; read(&root, &id) }
#[derive(Serialize)]
pub struct AssetInfo { name: String, bytes: u64 }
#[tauri::command]
pub fn list_asset_files(state: State<LibraryState>) -> AppResult<Vec<AssetInfo>> {
    let root = state.root.lock().map_err(err)?;
    let mut rows = Vec::new();
    for entry in fs::read_dir(root.join("assets")).map_err(err)?.filter_map(Result::ok) {
        let Some(name) = entry.file_name().to_str().map(str::to_owned) else { continue };
        if crate::asset_path(&root, &name).is_err() || !entry.file_type().map_err(err)?.is_file() { continue; }
        rows.push(AssetInfo { name, bytes: entry.metadata().map_err(err)?.len() });
    }
    Ok(rows)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test] fn readonly_preview_lists_corruption_and_rejects_paths() {
        let nonce = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_nanos();
        let root = std::env::temp_dir().join(format!("atlas-snapshots-{nonce}"));
        fs::create_dir_all(root.join("backups")).unwrap();
        let good = root.join("backups/library-100.sqlite");
        let db = Connection::open(&good).unwrap();
        db.execute_batch("CREATE TABLE library(id INTEGER PRIMARY KEY,data TEXT); INSERT INTO library VALUES(1,'{\"schemaVersion\":2,\"characters\":[]}');").unwrap(); drop(db);
        fs::write(root.join("backups/library-200.sqlite"), b"broken").unwrap();
        let rows = list(&root).unwrap();
        assert_eq!(rows[0].id, "library-200.sqlite"); assert!(rows[0].error.is_some());
        assert_eq!(rows[1].characters, Some(0)); assert!(read(&root, "library-100.sqlite").is_ok());
        for id in ["../library.sqlite", "library-../100.sqlite", "library.sqlite"] { assert!(read(&root, id).is_err()); }
        assert!(!root.join("backups/library-100.sqlite-journal").exists());
        fs::remove_dir_all(root).unwrap();
    }
}
