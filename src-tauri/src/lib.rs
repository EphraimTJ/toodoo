mod error;
mod events;
pub mod repo;

use serde_json::Value;
use sqlx::SqlitePool;
use tauri::{Emitter, Manager, State};

use events::EventBus;
use repo::projects::{NewProject, Project};

pub struct AppState {
    pool: SqlitePool,
    bus: EventBus,
}

type CmdResult<T> = Result<T, String>;

#[tauri::command]
async fn list_projects(state: State<'_, AppState>) -> CmdResult<Vec<Project>> {
    repo::projects::list_projects(&state.pool).await.map_err(|e| e.to_string())
}

#[tauri::command]
async fn create_project(state: State<'_, AppState>, input: NewProject) -> CmdResult<Project> {
    repo::projects::create_project(&state.pool, &state.bus, input)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn delete_project(state: State<'_, AppState>, id: String) -> CmdResult<()> {
    repo::projects::soft_delete_project(&state.pool, &state.bus, &id)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn get_setting(state: State<'_, AppState>, key: String) -> CmdResult<Option<Value>> {
    repo::settings::get_setting(&state.pool, &key).await.map_err(|e| e.to_string())
}

#[tauri::command]
async fn set_setting(state: State<'_, AppState>, key: String, value: Value) -> CmdResult<()> {
    repo::settings::set_setting(&state.pool, &state.bus, &key, value)
        .await
        .map_err(|e| e.to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            let data_dir = app.path().app_data_dir()?;
            std::fs::create_dir_all(&data_dir)?;
            let db_path = data_dir.join("toodoo.db");

            let pool = tauri::async_runtime::block_on(repo::db::connect(&db_path))?;
            let bus = EventBus::new();

            // Forward every domain event to the webview so views stay live.
            let mut rx = bus.subscribe();
            let handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                while let Ok(event) = rx.recv().await {
                    let _ = handle.emit("domain-event", &event);
                }
            });

            app.manage(AppState { pool, bus });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            list_projects,
            create_project,
            delete_project,
            get_setting,
            set_setting
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
