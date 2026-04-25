use std::io::{BufRead, BufReader};
use std::process::{Child, Command, Stdio};
use std::sync::Mutex;
use std::thread;
use std::time::Duration;
use tauri::Manager;

static SIDECAR: Mutex<Option<Child>> = Mutex::new(None);
static SIDECAR_PORT: Mutex<Option<u16>> = Mutex::new(None);

fn find_node() -> Result<std::path::PathBuf, String> {
    if let Ok(p) = which::which("node") {
        return Ok(p);
    }

    let extra_paths = [
        "/opt/homebrew/bin",
        "/usr/local/bin",
        "/opt/local/bin",
        "/run/current-system/sw/bin",
    ];

    if let Ok(path_env) = std::env::var("PATH") {
        let existing: Vec<&str> = path_env.split(':').collect();
        let mut new_path = path_env.clone();
        for p in &extra_paths {
            if !existing.iter().any(|e| e == p) {
                new_path.push(':');
                new_path.push_str(p);
            }
        }
        std::env::set_var("PATH", &new_path);
        if let Ok(p) = which::which("node") {
            return Ok(p);
        }
    }

    for dir in &extra_paths {
        let candidate = std::path::Path::new(dir).join("node");
        if candidate.exists() {
            return Ok(candidate);
        }
    }

    Err("node not found in PATH or common locations".to_string())
}

fn start_sidecar(app: &tauri::AppHandle) -> Result<(), String> {
    let node_path = find_node()?;

    let resource_dir = app
        .path()
        .resource_dir()
        .map_err(|e| format!("Failed to get resource dir: {}", e))?;

    let sidecar_path = resource_dir
        .join("resources")
        .join("sidecar")
        .join("index.mjs");

    if !sidecar_path.exists() {
        return Err(format!("Sidecar not found at: {:?}", sidecar_path));
    }

    eprintln!("[inkwell] Starting sidecar from: {:?}", sidecar_path);
    eprintln!("[inkwell] Using node at: {:?}", node_path);

    let mut child = Command::new(&node_path)
        .arg(&sidecar_path)
        .current_dir(sidecar_path.parent().unwrap())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| format!("Failed to spawn sidecar: {}", e))?;

    let stdout = child.stdout.take();
    let stderr = child.stderr.take();

    if let Some(stdout) = stdout {
        thread::spawn(move || {
            let reader = BufReader::new(stdout);
            for line in reader.lines().flatten() {
                eprintln!("[sidecar:out] {}", line);
            }
        });
    }

    if let Some(stderr) = stderr {
        thread::spawn(move || {
            let reader = BufReader::new(stderr);
            for line in reader.lines().flatten() {
                if line.starts_with("SIDECAR_PORT:") {
                    if let Some(port_str) = line.strip_prefix("SIDECAR_PORT:") {
                        if let Ok(port) = port_str.parse::<u16>() {
                            *SIDECAR_PORT.lock().unwrap() = Some(port);
                            eprintln!("[inkwell] Sidecar started on port {}", port);
                        }
                    }
                } else {
                    eprintln!("[sidecar] {}", line);
                }
            }
        });
    }

    *SIDECAR.lock().unwrap() = Some(child);

    let timeout = Duration::from_secs(10);
    let start = std::time::Instant::now();
    loop {
        if SIDECAR_PORT.lock().unwrap().is_some() {
            break;
        }
        if start.elapsed() > timeout {
            eprintln!("[inkwell] Warning: timed out waiting for sidecar port, frontend will retry");
            break;
        }
        thread::sleep(Duration::from_millis(50));
    }

    Ok(())
}

fn stop_sidecar() {
    if let Ok(mut guard) = SIDECAR.lock() {
        if let Some(ref mut child) = *guard {
            let _ = child.kill();
            let _ = child.wait();
            eprintln!("[inkwell] Sidecar stopped");
        }
        *guard = None;
    }
    *SIDECAR_PORT.lock().unwrap() = None;
}

#[tauri::command]
fn get_sidecar_port() -> Option<u16> {
    *SIDECAR_PORT.lock().unwrap()
}

#[tauri::command]
async fn save_file_dialog(
    app: tauri::AppHandle,
    content: String,
    file_name: String,
) -> Result<bool, String> {
    use tauri_plugin_dialog::{DialogExt, FilePath};
    use std::sync::mpsc;

    let (tx, rx) = mpsc::channel();

    app.dialog().file()
        .set_file_name(&file_name)
        .add_filter("Markdown", &["md"])
        .save_file(move |path| {
            let _ = tx.send(path);
        });

    match rx.recv() {
        Ok(Some(FilePath::Path(p))) => {
            std::fs::write(&p, content).map_err(|e| e.to_string())?;
            Ok(true)
        }
        Ok(Some(FilePath::Url(_))) => Err("URL paths not supported".to_string()),
        Ok(None) => Ok(false),
        Err(_) => Err("Dialog failed".to_string()),
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    eprintln!("[inkwell] App starting, PID: {}", std::process::id());

    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![get_sidecar_port, save_file_dialog])
        .setup(|app| {
            eprintln!("[inkwell] Setup running, PID: {}", std::process::id());

            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Debug)
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
