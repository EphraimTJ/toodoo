mod error;
mod events;
pub mod repo;

use serde_json::Value;
use sqlx::SqlitePool;
use tauri::{Emitter, Manager, State};

use events::EventBus;
use repo::check_items::CheckItem;
use repo::folders::{Folder, FolderPatch};
use repo::projects::{NewProject, Project, ProjectPatch};
use repo::tags::Tag;
use repo::tasks::{NewTask, SmartCounts, SmartView, Task, TaskPatch};

pub struct AppState {
    pool: SqlitePool,
    bus: EventBus,
}

type CmdResult<T> = Result<T, String>;

fn err(e: crate::error::RepoError) -> String {
    e.to_string()
}

// ---- projects & folders -----------------------------------------------------

#[tauri::command]
async fn list_projects(state: State<'_, AppState>) -> CmdResult<Vec<Project>> {
    repo::projects::list_projects(&state.pool).await.map_err(err)
}

#[tauri::command]
async fn create_project(state: State<'_, AppState>, input: NewProject) -> CmdResult<Project> {
    repo::projects::create_project(&state.pool, &state.bus, input).await.map_err(err)
}

#[tauri::command]
async fn update_project(
    state: State<'_, AppState>,
    id: String,
    patch: ProjectPatch,
) -> CmdResult<Project> {
    repo::projects::update_project(&state.pool, &state.bus, &id, patch).await.map_err(err)
}

#[tauri::command]
async fn delete_project(state: State<'_, AppState>, id: String) -> CmdResult<()> {
    repo::projects::soft_delete_project(&state.pool, &state.bus, &id).await.map_err(err)
}

#[tauri::command]
async fn reorder_project(
    state: State<'_, AppState>,
    id: String,
    after_id: Option<String>,
) -> CmdResult<()> {
    repo::projects::reorder_project(&state.pool, &state.bus, &id, after_id.as_deref())
        .await
        .map_err(err)
}

#[tauri::command]
async fn list_folders(state: State<'_, AppState>) -> CmdResult<Vec<Folder>> {
    repo::folders::list_folders(&state.pool).await.map_err(err)
}

#[tauri::command]
async fn create_folder(state: State<'_, AppState>, name: String) -> CmdResult<Folder> {
    repo::folders::create_folder(&state.pool, &state.bus, &name).await.map_err(err)
}

#[tauri::command]
async fn update_folder(
    state: State<'_, AppState>,
    id: String,
    patch: FolderPatch,
) -> CmdResult<Folder> {
    repo::folders::update_folder(&state.pool, &state.bus, &id, patch).await.map_err(err)
}

#[tauri::command]
async fn delete_folder(state: State<'_, AppState>, id: String) -> CmdResult<()> {
    repo::folders::soft_delete_folder(&state.pool, &state.bus, &id).await.map_err(err)
}

// ---- tasks -------------------------------------------------------------------

#[tauri::command]
async fn create_task(state: State<'_, AppState>, input: NewTask) -> CmdResult<Task> {
    repo::tasks::create_task(&state.pool, &state.bus, input).await.map_err(err)
}

#[tauri::command]
async fn get_task(state: State<'_, AppState>, id: String) -> CmdResult<Task> {
    repo::tasks::get_task(&state.pool, &id).await.map_err(err)
}

#[tauri::command]
async fn update_task(state: State<'_, AppState>, id: String, patch: TaskPatch) -> CmdResult<Task> {
    repo::tasks::update_task(&state.pool, &state.bus, &id, patch).await.map_err(err)
}

#[tauri::command]
async fn complete_task(state: State<'_, AppState>, id: String) -> CmdResult<Vec<String>> {
    repo::tasks::complete_task(&state.pool, &state.bus, &id).await.map_err(err)
}

#[tauri::command]
async fn reopen_task(state: State<'_, AppState>, id: String) -> CmdResult<()> {
    repo::tasks::reopen_task(&state.pool, &state.bus, &id).await.map_err(err)
}

#[tauri::command]
async fn trash_task(state: State<'_, AppState>, id: String) -> CmdResult<Vec<String>> {
    repo::tasks::trash_task(&state.pool, &state.bus, &id).await.map_err(err)
}

#[tauri::command]
async fn restore_task(state: State<'_, AppState>, id: String) -> CmdResult<Task> {
    repo::tasks::restore_task(&state.pool, &state.bus, &id).await.map_err(err)
}

#[tauri::command]
async fn delete_task_forever(state: State<'_, AppState>, id: String) -> CmdResult<()> {
    repo::tasks::delete_task_forever(&state.pool, &state.bus, &id).await.map_err(err)
}

#[tauri::command]
async fn move_task(state: State<'_, AppState>, id: String, project_id: String) -> CmdResult<()> {
    repo::tasks::move_task(&state.pool, &state.bus, &id, &project_id).await.map_err(err)
}

#[tauri::command]
async fn reorder_task(
    state: State<'_, AppState>,
    id: String,
    after_id: Option<String>,
) -> CmdResult<()> {
    repo::tasks::reorder_task(&state.pool, &state.bus, &id, after_id.as_deref())
        .await
        .map_err(err)
}

#[tauri::command]
async fn list_project_tasks(state: State<'_, AppState>, project_id: String) -> CmdResult<Vec<Task>> {
    repo::tasks::list_project_tasks(&state.pool, &project_id).await.map_err(err)
}

#[tauri::command]
async fn list_smart(
    state: State<'_, AppState>,
    view: SmartView,
    today: String,
    tz_offset_min: i32,
) -> CmdResult<Vec<Task>> {
    repo::tasks::list_smart(&state.pool, view, &today, tz_offset_min).await.map_err(err)
}

#[tauri::command]
async fn smart_counts(
    state: State<'_, AppState>,
    today: String,
    tz_offset_min: i32,
) -> CmdResult<SmartCounts> {
    repo::tasks::smart_counts(&state.pool, &today, tz_offset_min).await.map_err(err)
}

#[tauri::command]
async fn search_tasks(state: State<'_, AppState>, query: String) -> CmdResult<Vec<Task>> {
    repo::search::search_tasks(&state.pool, &query, 50).await.map_err(err)
}

// ---- check items & tags --------------------------------------------------------

#[tauri::command]
async fn list_check_items(state: State<'_, AppState>, task_id: String) -> CmdResult<Vec<CheckItem>> {
    repo::check_items::list_check_items(&state.pool, &task_id).await.map_err(err)
}

#[tauri::command]
async fn add_check_item(
    state: State<'_, AppState>,
    task_id: String,
    title: String,
) -> CmdResult<CheckItem> {
    repo::check_items::add_check_item(&state.pool, &state.bus, &task_id, &title)
        .await
        .map_err(err)
}

#[tauri::command]
async fn set_check_item(
    state: State<'_, AppState>,
    id: String,
    title: Option<String>,
    done: Option<bool>,
) -> CmdResult<()> {
    repo::check_items::set_check_item(&state.pool, &state.bus, &id, title.as_deref(), done)
        .await
        .map_err(err)
}

#[tauri::command]
async fn delete_check_item(state: State<'_, AppState>, id: String) -> CmdResult<()> {
    repo::check_items::delete_check_item(&state.pool, &state.bus, &id).await.map_err(err)
}

#[tauri::command]
async fn list_tags(state: State<'_, AppState>) -> CmdResult<Vec<Tag>> {
    repo::tags::list_tags(&state.pool).await.map_err(err)
}

#[tauri::command]
async fn create_tag(
    state: State<'_, AppState>,
    name: String,
    color: Option<String>,
) -> CmdResult<Tag> {
    repo::tags::create_tag(&state.pool, &state.bus, &name, color.as_deref())
        .await
        .map_err(err)
}

#[tauri::command]
async fn update_tag(
    state: State<'_, AppState>,
    id: String,
    name: Option<String>,
    color: Option<Option<String>>,
) -> CmdResult<()> {
    let color_ref: Option<Option<&str>> = color.as_ref().map(|inner| inner.as_deref());
    repo::tags::update_tag(&state.pool, &state.bus, &id, name.as_deref(), color_ref)
        .await
        .map_err(err)
}

#[tauri::command]
async fn delete_tag(state: State<'_, AppState>, id: String) -> CmdResult<()> {
    repo::tags::delete_tag(&state.pool, &state.bus, &id).await.map_err(err)
}

#[tauri::command]
async fn assign_tag(state: State<'_, AppState>, task_id: String, tag_id: String) -> CmdResult<()> {
    repo::tags::assign_tag(&state.pool, &state.bus, &task_id, &tag_id).await.map_err(err)
}

#[tauri::command]
async fn unassign_tag(state: State<'_, AppState>, task_id: String, tag_id: String) -> CmdResult<()> {
    repo::tags::unassign_tag(&state.pool, &state.bus, &task_id, &tag_id).await.map_err(err)
}

// ---- settings & dev -------------------------------------------------------------

#[tauri::command]
async fn get_setting(state: State<'_, AppState>, key: String) -> CmdResult<Option<Value>> {
    repo::settings::get_setting(&state.pool, &key).await.map_err(err)
}

#[tauri::command]
async fn set_setting(state: State<'_, AppState>, key: String, value: Value) -> CmdResult<()> {
    repo::settings::set_setting(&state.pool, &state.bus, &key, value).await.map_err(err)
}

#[tauri::command]
async fn seed_demo_data(state: State<'_, AppState>, tasks: usize) -> CmdResult<()> {
    if !cfg!(debug_assertions) {
        return Err("seeding is only available in dev builds".into());
    }
    repo::seed::seed_demo_data(&state.pool, &state.bus, 20, tasks).await.map_err(err)
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
            update_project,
            delete_project,
            reorder_project,
            list_folders,
            create_folder,
            update_folder,
            delete_folder,
            create_task,
            get_task,
            update_task,
            complete_task,
            reopen_task,
            trash_task,
            restore_task,
            delete_task_forever,
            move_task,
            reorder_task,
            list_project_tasks,
            list_smart,
            smart_counts,
            search_tasks,
            list_check_items,
            add_check_item,
            set_check_item,
            delete_check_item,
            list_tags,
            create_tag,
            update_tag,
            delete_tag,
            assign_tag,
            unassign_tag,
            get_setting,
            set_setting,
            seed_demo_data
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
