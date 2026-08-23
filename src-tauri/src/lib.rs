mod compile;
mod fsops;
mod pty;

use tauri::Manager;

// Ctrl+scroll and touchpad pinch gestures are handled by WebKitGTK itself as
// a native page-zoom, independent of any DOM/JS event handling — so our
// PDF-only zoom (implemented in JS) can't stop it from also zooming the rest
// of the UI. Lock the WebView's zoom level at 1.0 to disable that native
// zoom entirely and leave zooming exclusively to the PDF preview.
#[cfg(any(
    target_os = "linux",
    target_os = "dragonfly",
    target_os = "freebsd",
    target_os = "netbsd",
    target_os = "openbsd"
))]
fn disable_webview_zoom(window: &tauri::WebviewWindow) {
    use webkit2gtk::WebViewExt;
    let _ = window.with_webview(|webview| {
        let webview = webview.inner();
        webview.set_zoom_level(1.0);

        // WebKitGTK's touchpad-pinch gesture handler sets the page's zoom
        // factor directly, bypassing the public `zoom-level` property setter
        // — so `notify::zoom-level` never fires and we can't just listen for
        // the change. Instead, poll and force it back to 1.0 whenever a
        // gesture (or Ctrl+scroll) manages to move it.
        glib::timeout_add_local(std::time::Duration::from_millis(50), move || {
            if webview.zoom_level() != 1.0 {
                webview.set_zoom_level(1.0);
            }
            glib::ControlFlow::Continue
        });
    });
}

#[cfg(not(any(
    target_os = "linux",
    target_os = "dragonfly",
    target_os = "freebsd",
    target_os = "netbsd",
    target_os = "openbsd"
)))]
fn disable_webview_zoom(_window: &tauri::WebviewWindow) {}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .manage(pty::PtyState::default())
        .setup(|app| {
            if let Some(window) = app.get_webview_window("main") {
                disable_webview_zoom(&window);
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            pty::pty_spawn,
            pty::pty_write,
            pty::pty_resize,
            pty::pty_kill,
            compile::compile_tex,
            compile::read_text_file,
            compile::write_text_file,
            compile::read_binary_file_base64,
            compile::ensure_default_project,
            fsops::list_project_tree,
            fsops::create_file,
            fsops::create_folder,
            fsops::rename_path,
            fsops::delete_path,
            fsops::path_exists,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
