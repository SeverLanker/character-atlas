//! 原生文件写入的加固：路径只来自 Rust 侧弹出的系统保存对话框，并在写入前统一校验。
//!
//! 前端只传内容和建议文件名，不再传路径（见 lib.rs 的 save_backup / save_export）。
//! 这里放与 Tauri 无关的纯函数，方便单元测试。
use std::{
    fs,
    path::{Component, Path, PathBuf},
};

pub type WriteResult<T> = Result<T, String>;

/// 写入种类与对应的扩展名白名单。
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum WriteKind {
    /// 完整备份：只允许 .zip
    Backup,
    /// Markdown 单角色导出：只允许 .md
    ExportMarkdown,
    /// Markdown 整库导出：只允许 .zip
    ExportZip,
}

const MB: usize = 1024 * 1024;
/// 统一的体积上限配置。
pub const MAX_BACKUP_BYTES: usize = 512 * MB;
pub const MAX_EXPORT_MARKDOWN_BYTES: usize = 32 * MB;
pub const MAX_EXPORT_ZIP_BYTES: usize = 512 * MB;

impl WriteKind {
    pub fn extension(self) -> &'static str {
        match self {
            WriteKind::Backup | WriteKind::ExportZip => "zip",
            WriteKind::ExportMarkdown => "md",
        }
    }
    pub fn max_bytes(self) -> usize {
        match self {
            WriteKind::Backup => MAX_BACKUP_BYTES,
            WriteKind::ExportMarkdown => MAX_EXPORT_MARKDOWN_BYTES,
            WriteKind::ExportZip => MAX_EXPORT_ZIP_BYTES,
        }
    }
    pub fn label(self) -> &'static str {
        match self {
            WriteKind::Backup => "备份文件",
            WriteKind::ExportMarkdown => "Markdown 文件",
            WriteKind::ExportZip => "Markdown 压缩包",
        }
    }
    pub fn filter_name(self) -> &'static str {
        match self {
            WriteKind::Backup => "叙册备份",
            WriteKind::ExportMarkdown => "Markdown",
            WriteKind::ExportZip => "Markdown 压缩包",
        }
    }
}

/// 体积检查：在弹对话框之前就做，超限时直接给出中文说明。
pub fn check_size(kind: WriteKind, size: usize) -> WriteResult<()> {
    let limit = kind.max_bytes();
    if size > limit {
        return Err(format!(
            "{}约 {:.1} MB，超过 {} MB 上限，未写入。请减少图片或拆分资料库后再试。",
            kind.label(),
            size as f64 / MB as f64,
            limit / MB
        ));
    }
    Ok(())
}

const RESERVED: [&str; 22] = [
    "CON", "PRN", "AUX", "NUL", "COM1", "COM2", "COM3", "COM4", "COM5", "COM6", "COM7", "COM8",
    "COM9", "LPT1", "LPT2", "LPT3", "LPT4", "LPT5", "LPT6", "LPT7", "LPT8", "LPT9",
];

/// Windows 保留设备名（不区分大小写，忽略扩展名，如 `nul.zip`、`Com1.md`）。
pub fn is_reserved_name(file_name: &str) -> bool {
    let stem = file_name.split('.').next().unwrap_or("").trim_end_matches([' ', '.']);
    RESERVED.iter().any(|r| r.eq_ignore_ascii_case(stem))
}

/// UNC（`\\server\share`）与设备路径（`\\?\`、`\\.\`）。
pub fn is_unc_or_device(raw: &str) -> bool {
    let s = raw.replace('/', "\\");
    if s.starts_with("\\\\") {
        return true;
    }
    #[cfg(windows)]
    {
        use std::path::Prefix;
        if let Some(Component::Prefix(p)) = Path::new(raw).components().next() {
            return !matches!(p.kind(), Prefix::Disk(_));
        }
    }
    false
}

/// 把前端给的建议文件名收敛成安全的单个文件名，并补上正确扩展名。
pub fn suggested_file_name(name: &str, kind: WriteKind) -> String {
    let base = name.rsplit(['/', '\\']).next().unwrap_or("");
    let mut clean: String = base
        .chars()
        .filter(|c| !c.is_control() && !matches!(c, ':' | '*' | '?' | '"' | '<' | '>' | '|'))
        .take(120)
        .collect();
    clean = clean.trim().trim_matches('.').to_string();
    let ext = kind.extension();
    let has_ext = clean
        .rsplit_once('.')
        .is_some_and(|(stem, e)| !stem.is_empty() && e.eq_ignore_ascii_case(ext));
    if !has_ext {
        clean = format!("{}.{ext}", if clean.is_empty() { "叙册导出" } else { &clean });
    }
    if is_reserved_name(&clean) {
        clean = format!("_{clean}");
    }
    clean
}

fn canonical_or_self(path: &Path) -> PathBuf {
    fs::canonicalize(path).unwrap_or_else(|_| path.to_path_buf())
}

/// 校验对话框返回的目标路径，返回规范化后的写入路径。
///
/// `protected` 是资料库根目录、应用数据目录等禁止写入的位置（含子目录，如 assets/、backups/）。
pub fn validate_target(raw: &Path, kind: WriteKind, protected: &[PathBuf]) -> WriteResult<PathBuf> {
    let text = raw.to_string_lossy();
    if is_unc_or_device(&text) {
        return Err("不支持网络共享（UNC）或设备路径，请保存到本机磁盘上的文件夹。".into());
    }
    if !raw.is_absolute() || raw.components().any(|c| matches!(c, Component::ParentDir)) {
        return Err("保存位置无效，请重新选择。".into());
    }
    let file_name = raw
        .file_name()
        .and_then(|n| n.to_str())
        .ok_or("文件名无效，请重新选择。")?;
    if file_name.ends_with([' ', '.']) {
        return Err("文件名不能以空格或句点结尾。".into());
    }
    if is_reserved_name(file_name) {
        return Err(format!("“{file_name}”是 Windows 保留名称，请换一个文件名。"));
    }
    let ext_ok = Path::new(file_name)
        .extension()
        .and_then(|e| e.to_str())
        .is_some_and(|e| e.eq_ignore_ascii_case(kind.extension()));
    if !ext_ok {
        return Err(format!("{}必须使用 .{} 扩展名。", kind.label(), kind.extension()));
    }
    let parent = raw.parent().ok_or("保存位置无效，请重新选择。")?;
    let parent_meta = fs::metadata(parent).map_err(|_| "保存位置所在的文件夹不存在。".to_string())?;
    if !parent_meta.is_dir() {
        return Err("保存位置所在的文件夹不存在。".into());
    }
    let parent = fs::canonicalize(parent).map_err(|e| format!("无法访问保存位置：{e}"))?;
    let target = parent.join(file_name);
    match fs::symlink_metadata(&target) {
        Ok(meta) if meta.file_type().is_symlink() => {
            return Err("目标是符号链接，为安全起见不会覆盖，请换一个文件名。".into())
        }
        Ok(meta) if meta.is_dir() => return Err("目标是一个已存在的文件夹，请换一个文件名。".into()),
        Ok(meta) if !meta.is_file() => return Err("目标不是普通文件，请换一个文件名。".into()),
        _ => {}
    }
    for dir in protected {
        let dir = canonical_or_self(dir);
        if target.starts_with(&dir) {
            return Err("不能保存到叙册资料库自己的数据文件夹里，请选择其他位置。".into());
        }
    }
    Ok(target)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::{SystemTime, UNIX_EPOCH};

    fn temp_dir() -> PathBuf {
        let path = std::env::temp_dir().join(format!(
            "atlas-write-{}",
            SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_nanos()
        ));
        fs::create_dir_all(&path).unwrap();
        fs::canonicalize(path).unwrap()
    }

    #[test]
    fn accepts_normal_paths_with_case_insensitive_extensions() {
        let dir = temp_dir();
        let ok = validate_target(&dir.join("备份.zip"), WriteKind::Backup, &[]).unwrap();
        assert_eq!(ok, dir.join("备份.zip"));
        assert!(validate_target(&dir.join("A.ZIP"), WriteKind::Backup, &[]).is_ok());
        assert!(validate_target(&dir.join("角色.Md"), WriteKind::ExportMarkdown, &[]).is_ok());
        assert!(validate_target(&dir.join("lib.zip"), WriteKind::ExportZip, &[]).is_ok());
        // 已存在的普通文件允许覆盖
        fs::write(dir.join("old.zip"), b"x").unwrap();
        assert!(validate_target(&dir.join("old.zip"), WriteKind::Backup, &[]).is_ok());
        fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn rejects_wrong_extensions_per_kind() {
        let dir = temp_dir();
        for (name, kind) in [
            ("a.md", WriteKind::Backup),
            ("a.zip", WriteKind::ExportMarkdown),
            ("a.exe", WriteKind::ExportZip),
            ("a.zip.exe", WriteKind::Backup),
            ("noext", WriteKind::Backup),
            (".zip", WriteKind::Backup),
        ] {
            assert!(validate_target(&dir.join(name), kind, &[]).is_err(), "{name}");
        }
        fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn rejects_reserved_names_and_bad_file_names() {
        let dir = temp_dir();
        for name in ["CON.zip", "nul.zip", "Com1.zip", "lpt9.backup.zip", "aux .zip", "a.zip.", "a.zip "] {
            assert!(validate_target(&dir.join(name), WriteKind::Backup, &[]).is_err(), "{name}");
        }
        assert!(is_reserved_name("con"));
        assert!(!is_reserved_name("console.zip"));
        assert!(!is_reserved_name("com10.zip"));
        fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn rejects_unc_device_relative_and_parent_dir_paths() {
        for raw in [r"\\server\share\a.zip", r"\\?\C:\a.zip", r"\\.\PhysicalDrive0", "//server/share/a.zip"] {
            assert!(is_unc_or_device(raw), "{raw}");
            assert!(validate_target(Path::new(raw), WriteKind::Backup, &[]).is_err(), "{raw}");
        }
        assert!(!is_unc_or_device("/home/user/a.zip"));
        assert!(validate_target(Path::new("relative/a.zip"), WriteKind::Backup, &[]).is_err());
        let dir = temp_dir();
        fs::create_dir(dir.join("sub")).unwrap();
        assert!(validate_target(&dir.join("sub").join("..").join("a.zip"), WriteKind::Backup, &[]).is_err());
        fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn rejects_missing_parent_and_existing_directory() {
        let dir = temp_dir();
        assert!(validate_target(&dir.join("missing").join("a.zip"), WriteKind::Backup, &[]).is_err());
        fs::create_dir(dir.join("folder.zip")).unwrap();
        let e = validate_target(&dir.join("folder.zip"), WriteKind::Backup, &[]).unwrap_err();
        assert!(e.contains("文件夹"), "{e}");
        fs::write(dir.join("file"), b"").unwrap();
        assert!(validate_target(&dir.join("file").join("a.zip"), WriteKind::Backup, &[]).is_err());
        fs::remove_dir_all(dir).unwrap();
    }

    #[cfg(unix)]
    #[test]
    fn rejects_symlink_targets() {
        let dir = temp_dir();
        fs::write(dir.join("real.sqlite"), b"db").unwrap();
        std::os::unix::fs::symlink(dir.join("real.sqlite"), dir.join("link.zip")).unwrap();
        std::os::unix::fs::symlink(dir.join("nowhere"), dir.join("dangling.zip")).unwrap();
        assert!(validate_target(&dir.join("link.zip"), WriteKind::Backup, &[]).is_err());
        assert!(validate_target(&dir.join("dangling.zip"), WriteKind::Backup, &[]).is_err());
        assert_eq!(fs::read(dir.join("real.sqlite")).unwrap(), b"db");
        fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn rejects_writes_into_library_and_app_data() {
        let dir = temp_dir();
        let library = dir.join("library");
        let data_dir = dir.join("appdata");
        for d in [library.join("assets"), library.join("backups"), data_dir.clone()] {
            fs::create_dir_all(d).unwrap();
        }
        let protected = [library.clone(), data_dir.clone()];
        for target in [
            library.join("library.zip"),
            library.join("assets").join("x.zip"),
            library.join("backups").join("x.zip"),
            data_dir.join("x.zip"),
        ] {
            let e = validate_target(&target, WriteKind::Backup, &protected).unwrap_err();
            assert!(e.contains("数据文件夹"), "{e}");
        }
        assert!(validate_target(&dir.join("ok.zip"), WriteKind::Backup, &protected).is_ok());
        fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn size_limits_are_unified_and_explained() {
        assert!(check_size(WriteKind::Backup, MAX_BACKUP_BYTES).is_ok());
        let e = check_size(WriteKind::Backup, MAX_BACKUP_BYTES + 1).unwrap_err();
        assert!(e.contains("512 MB") && e.contains("备份文件"), "{e}");
        assert!(check_size(WriteKind::ExportMarkdown, MAX_EXPORT_MARKDOWN_BYTES + 1).unwrap_err().contains("32 MB"));
        assert!(check_size(WriteKind::ExportZip, MAX_EXPORT_ZIP_BYTES + 1).is_err());
    }

    #[test]
    fn sanitizes_suggested_file_names() {
        assert_eq!(suggested_file_name("叙册备份-2026.zip", WriteKind::Backup), "叙册备份-2026.zip");
        assert_eq!(suggested_file_name("../../etc/passwd", WriteKind::Backup), "passwd.zip");
        assert_eq!(suggested_file_name(r"C:\x\林弥.MD", WriteKind::ExportMarkdown), "林弥.MD");
        assert_eq!(suggested_file_name("a<b>|c?.md", WriteKind::ExportMarkdown), "abc.md");
        assert_eq!(suggested_file_name("", WriteKind::ExportZip), "叙册导出.zip");
        assert_eq!(suggested_file_name("CON", WriteKind::Backup), "_CON.zip");
        assert_eq!(suggested_file_name("notes.md", WriteKind::Backup), "notes.md.zip");
    }
}
