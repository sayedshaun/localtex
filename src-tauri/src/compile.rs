use serde::Serialize;
use std::path::Path;
use std::process::Command;

#[derive(Serialize)]
pub struct CompileResult {
    success: bool,
    log: String,
    pdf_path: Option<String>,
}

#[tauri::command]
pub fn compile_tex(path: String) -> Result<CompileResult, String> {
    let tex_path = Path::new(&path);
    let dir = tex_path
        .parent()
        .ok_or("invalid tex path: no parent directory")?;
    let file_name = tex_path
        .file_name()
        .ok_or("invalid tex path: no file name")?
        .to_string_lossy()
        .to_string();

    let output = Command::new("tectonic")
        .arg("--keep-logs")
        .arg("--outdir")
        .arg(dir)
        .arg(&file_name)
        .current_dir(dir)
        .output()
        .map_err(|e| format!("failed to run tectonic: {e}"))?;

    let mut log = String::new();
    log.push_str(&String::from_utf8_lossy(&output.stdout));
    log.push_str(&String::from_utf8_lossy(&output.stderr));

    let pdf_path = tex_path.with_extension("pdf");
    let success = output.status.success() && pdf_path.exists();

    Ok(CompileResult {
        success,
        log,
        pdf_path: if success {
            Some(pdf_path.to_string_lossy().to_string())
        } else {
            None
        },
    })
}

#[tauri::command]
pub fn read_text_file(path: String) -> Result<String, String> {
    std::fs::read_to_string(&path).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn write_text_file(path: String, contents: String) -> Result<(), String> {
    std::fs::write(&path, contents).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn read_binary_file_base64(path: String) -> Result<String, String> {
    use base64::{engine::general_purpose::STANDARD, Engine as _};
    let bytes = std::fs::read(&path).map_err(|e| e.to_string())?;
    Ok(STANDARD.encode(bytes))
}

#[derive(Serialize)]
pub struct ProjectInfo {
    dir: String,
    tex_path: String,
}

const STARTER_TEX: &str = r#"\documentclass{article}
\title{New Document}
\author{}
\date{\today}

\begin{document}
\maketitle

Hello, \LaTeX{}!

\end{document}
"#;

#[tauri::command]
pub fn ensure_default_project() -> Result<ProjectInfo, String> {
    let home = std::env::var("HOME").map_err(|_| "HOME not set".to_string())?;
    let dir = Path::new(&home).join("localtex-workspace");
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let tex_path = dir.join("main.tex");
    if !tex_path.exists() {
        std::fs::write(&tex_path, STARTER_TEX).map_err(|e| e.to_string())?;
    }
    Ok(ProjectInfo {
        dir: dir.to_string_lossy().to_string(),
        tex_path: tex_path.to_string_lossy().to_string(),
    })
}
