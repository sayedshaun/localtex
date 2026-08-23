use serde::Serialize;
use std::path::Path;

#[derive(Serialize, Clone)]
pub struct FileEntry {
    name: String,
    path: String,
    is_dir: bool,
    children: Option<Vec<FileEntry>>,
}

fn read_dir_entry(path: &Path) -> Result<Vec<FileEntry>, String> {
    let mut entries: Vec<FileEntry> = std::fs::read_dir(path)
        .map_err(|e| e.to_string())?
        .filter_map(|entry| entry.ok())
        .filter(|entry| {
            !entry
                .file_name()
                .to_string_lossy()
                .starts_with('.')
        })
        .map(|entry| {
            let path = entry.path();
            let is_dir = path.is_dir();
            FileEntry {
                name: entry.file_name().to_string_lossy().to_string(),
                path: path.to_string_lossy().to_string(),
                children: if is_dir {
                    read_dir_entry(&path).ok()
                } else {
                    None
                },
                is_dir,
            }
        })
        .collect();

    entries.sort_by(|a, b| match (a.is_dir, b.is_dir) {
        (true, false) => std::cmp::Ordering::Less,
        (false, true) => std::cmp::Ordering::Greater,
        _ => a.name.to_lowercase().cmp(&b.name.to_lowercase()),
    });

    Ok(entries)
}

#[tauri::command]
pub fn list_project_tree(root: String) -> Result<Vec<FileEntry>, String> {
    read_dir_entry(Path::new(&root))
}

#[tauri::command]
pub fn create_file(path: String) -> Result<(), String> {
    let p = Path::new(&path);
    if p.exists() {
        return Err("a file with that name already exists".to_string());
    }
    if let Some(parent) = p.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    std::fs::write(p, "").map_err(|e| e.to_string())
}

#[tauri::command]
pub fn create_folder(path: String) -> Result<(), String> {
    std::fs::create_dir_all(&path).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn path_exists(path: String) -> bool {
    Path::new(&path).exists()
}

#[tauri::command]
pub fn rename_path(from: String, to: String) -> Result<(), String> {
    if Path::new(&to).exists() {
        return Err("a file or folder with that name already exists".to_string());
    }
    std::fs::rename(&from, &to).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn delete_path(path: String) -> Result<(), String> {
    let p = Path::new(&path);
    if p.is_dir() {
        std::fs::remove_dir_all(p).map_err(|e| e.to_string())
    } else {
        std::fs::remove_file(p).map_err(|e| e.to_string())
    }
}
