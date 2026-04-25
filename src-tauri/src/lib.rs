use std::process::{Child, Command};
use std::sync::Mutex;
use tauri::Manager;

static SIDECAR: Mutex<Option<Child>> = Mutex::new(None);

fn start_sidecar(app: &tauri::AppHandle) -> Result<(), String> {
    let node_path = which::which("node").map_err(|e| format!("node not found: {}", e))?;

    let resource_dir = app.path().resource_dir()
        .map_err(|e| format!("Failed to get resource dir: {}", e))?;

    let sidecar_path = resource_dir
        .join("resources")
        .join("sidecar")
        .join("index.mjs");

    if !sidecar_path.exists() {
        return Err(format!("Sidecar not found at: {:?}", sidecar_path));
    }

    let child = Command::new(node_path)
        .arg(&sidecar_path)
        .current_dir(sidecar_path.parent().unwrap())
        .spawn()
        .map_err(|e| format!("Failed to start sidecar: {}", e))?;

    *SIDECAR.lock().unwrap() = Some(child);
    log::info!("Inkwell P2P sidecar started from: {:?}", sidecar_path);
    Ok(())
}

fn stop_sidecar() {
    if let Ok(mut guard) = SIDECAR.lock() {
        if let Some(ref mut child) = *guard {
            let _ = child.kill();
            let _ = child.wait();
            log::info!("Inkwell P2P sidecar stopped");
        }
        *guard = None;
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }

            start_sidecar(app.handle())?;

            Ok(())
        })
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::Destroyed = event {
                if window.label() == "main" {
                    stop_sidecar();
                }
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}