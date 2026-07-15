mod error;
mod events;
pub mod repo;

use serde_json::Value;
use sqlx::SqlitePool;
use tauri::{Emitter, Manager, State};
use tauri_plugin_notification::NotificationExt;

use events::EventBus;
use repo::activity::ActivityEntry;
use repo::check_items::CheckItem;
use repo::filter_rule::Rule;
use repo::filters::Filter;
use repo::folders::{Folder, FolderPatch};
use repo::matrix::{Quadrant, QuadrantTasks};
use repo::projects::{NewProject, Project, ProjectPatch};
use repo::reminders::Reminder;
use repo::sections::Section;
use repo::tags::Tag;
use repo::tasks::{NewTask, SmartCounts, SmartView, Task, TaskPatch};
use repo::templates::{TaskTemplate, TemplatePayload};

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
async fn list_tag_tasks(state: State<'_, AppState>, tag_id: String) -> CmdResult<Vec<Task>> {
    repo::tasks::list_tag_tasks(&state.pool, &tag_id).await.map_err(err)
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

// ---- recurrence, reminders, activity, pin ---------------------------------------

#[tauri::command]
async fn set_task_pinned(state: State<'_, AppState>, id: String, pinned: bool) -> CmdResult<()> {
    repo::tasks::set_pinned(&state.pool, &state.bus, &id, pinned).await.map_err(err)
}

#[tauri::command]
async fn list_reminders(state: State<'_, AppState>, task_id: String) -> CmdResult<Vec<Reminder>> {
    repo::reminders::list_reminders(&state.pool, &task_id).await.map_err(err)
}

#[tauri::command]
async fn add_reminder(
    state: State<'_, AppState>,
    task_id: String,
    trigger_kind: String,
    at: Option<String>,
    offset_min: Option<i64>,
) -> CmdResult<Reminder> {
    repo::reminders::add_reminder(
        &state.pool,
        &state.bus,
        &task_id,
        &trigger_kind,
        at.as_deref(),
        offset_min,
    )
    .await
    .map_err(err)
}

#[tauri::command]
async fn snooze_reminder(state: State<'_, AppState>, id: String, until: String) -> CmdResult<()> {
    repo::reminders::snooze(&state.pool, &state.bus, &id, &until).await.map_err(err)
}

#[tauri::command]
async fn delete_reminder(state: State<'_, AppState>, id: String) -> CmdResult<()> {
    repo::reminders::delete_reminder(&state.pool, &state.bus, &id).await.map_err(err)
}

#[tauri::command]
async fn list_activity(
    state: State<'_, AppState>,
    entity_kind: String,
    entity_id: String,
) -> CmdResult<Vec<ActivityEntry>> {
    repo::activity::list_activity(&state.pool, &entity_kind, &entity_id).await.map_err(err)
}

#[tauri::command]
async fn list_templates(state: State<'_, AppState>) -> CmdResult<Vec<TaskTemplate>> {
    repo::templates::list_templates(&state.pool).await.map_err(err)
}

#[tauri::command]
async fn create_template(
    state: State<'_, AppState>,
    name: String,
    payload: TemplatePayload,
) -> CmdResult<TaskTemplate> {
    repo::templates::create_template(&state.pool, &state.bus, &name, &payload).await.map_err(err)
}

#[tauri::command]
async fn update_template(
    state: State<'_, AppState>,
    id: String,
    name: Option<String>,
    payload: Option<TemplatePayload>,
) -> CmdResult<()> {
    repo::templates::update_template(&state.pool, &state.bus, &id, name.as_deref(), payload.as_ref())
        .await
        .map_err(err)
}

#[tauri::command]
async fn delete_template(state: State<'_, AppState>, id: String) -> CmdResult<()> {
    repo::templates::delete_template(&state.pool, &state.bus, &id).await.map_err(err)
}

#[tauri::command]
async fn instantiate_template(
    state: State<'_, AppState>,
    template_id: String,
    project_id: String,
) -> CmdResult<Task> {
    repo::templates::instantiate_template(&state.pool, &state.bus, &template_id, &project_id)
        .await
        .map_err(err)
}

// ---- sections (Kanban columns) --------------------------------------------------

#[tauri::command]
async fn list_sections(state: State<'_, AppState>, project_id: String) -> CmdResult<Vec<Section>> {
    repo::sections::list_sections(&state.pool, &project_id).await.map_err(err)
}

#[tauri::command]
async fn create_section(
    state: State<'_, AppState>,
    project_id: String,
    name: String,
) -> CmdResult<Section> {
    repo::sections::create_section(&state.pool, &state.bus, &project_id, &name).await.map_err(err)
}

#[tauri::command]
async fn rename_section(state: State<'_, AppState>, id: String, name: String) -> CmdResult<()> {
    repo::sections::rename_section(&state.pool, &state.bus, &id, &name).await.map_err(err)
}

#[tauri::command]
async fn reorder_section(
    state: State<'_, AppState>,
    id: String,
    after_id: Option<String>,
) -> CmdResult<()> {
    repo::sections::reorder_section(&state.pool, &state.bus, &id, after_id.as_deref())
        .await
        .map_err(err)
}

#[tauri::command]
async fn delete_section(state: State<'_, AppState>, id: String) -> CmdResult<()> {
    repo::sections::delete_section(&state.pool, &state.bus, &id).await.map_err(err)
}

#[tauri::command]
async fn move_task_to_section(
    state: State<'_, AppState>,
    task_id: String,
    section_id: Option<String>,
) -> CmdResult<()> {
    repo::sections::move_task_to_section(&state.pool, &state.bus, &task_id, section_id.as_deref())
        .await
        .map_err(err)
}

// ---- custom filters -------------------------------------------------------------

#[tauri::command]
async fn list_filters(state: State<'_, AppState>) -> CmdResult<Vec<Filter>> {
    repo::filters::list_filters(&state.pool).await.map_err(err)
}

#[tauri::command]
async fn create_filter(
    state: State<'_, AppState>,
    name: String,
    rule: Rule,
    color: Option<String>,
) -> CmdResult<Filter> {
    repo::filters::create_filter(&state.pool, &state.bus, &name, &rule, color.as_deref())
        .await
        .map_err(err)
}

#[tauri::command]
async fn update_filter(
    state: State<'_, AppState>,
    id: String,
    name: Option<String>,
    rule: Option<Rule>,
    color: Option<String>,
) -> CmdResult<()> {
    repo::filters::update_filter(&state.pool, &state.bus, &id, name.as_deref(), rule.as_ref(), color.as_deref())
        .await
        .map_err(err)
}

#[tauri::command]
async fn delete_filter(state: State<'_, AppState>, id: String) -> CmdResult<()> {
    repo::filters::delete_filter(&state.pool, &state.bus, &id).await.map_err(err)
}

#[tauri::command]
async fn parse_filter_query(state: State<'_, AppState>, text: String) -> CmdResult<Rule> {
    repo::filters::parse_query(&state.pool, &text).await.map_err(err)
}

#[tauri::command]
async fn list_filter_tasks(
    state: State<'_, AppState>,
    id: String,
    today: String,
    tz_offset_min: i32,
) -> CmdResult<Vec<Task>> {
    repo::filters::list_filter_tasks(&state.pool, &id, &today, tz_offset_min).await.map_err(err)
}

// ---- Eisenhower matrix ----------------------------------------------------------

#[tauri::command]
async fn get_matrix(state: State<'_, AppState>) -> CmdResult<Vec<Quadrant>> {
    repo::matrix::get_matrix(&state.pool).await.map_err(err)
}

#[tauri::command]
async fn set_quadrant(state: State<'_, AppState>, quadrant: i64, rule: Rule) -> CmdResult<()> {
    repo::matrix::set_quadrant(&state.pool, &state.bus, quadrant, &rule).await.map_err(err)
}

#[tauri::command]
async fn list_matrix(
    state: State<'_, AppState>,
    today: String,
    tz_offset_min: i32,
) -> CmdResult<Vec<QuadrantTasks>> {
    repo::matrix::list_matrix(&state.pool, &today, tz_offset_min).await.map_err(err)
}

#[tauri::command]
async fn assign_to_quadrant(
    state: State<'_, AppState>,
    task_id: String,
    quadrant: i64,
) -> CmdResult<()> {
    repo::matrix::assign_to_quadrant(&state.pool, &state.bus, &task_id, quadrant).await.map_err(err)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_notification::init())
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

            // Reminder scheduler: every 30s fire any reminder whose time has
            // arrived (including ones missed while the app was closed — the
            // first tick runs immediately), then record the fire so it doesn't
            // repeat. `mark_fired` before emit keeps a crash from double-nagging.
            let sched_pool = pool.clone();
            let sched_bus = bus.clone();
            let sched_handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                let mut tick = tokio::time::interval(std::time::Duration::from_secs(30));
                loop {
                    tick.tick().await;
                    let due = match repo::reminders::due_reminders(&sched_pool, chrono::Utc::now())
                        .await
                    {
                        Ok(due) => due,
                        Err(e) => {
                            eprintln!("reminder scan failed: {e}");
                            continue;
                        }
                    };
                    for r in due {
                        let _ = sched_handle
                            .notification()
                            .builder()
                            .title("Toodoo")
                            .body(&r.task_title)
                            .show();
                        if let Err(e) =
                            repo::reminders::mark_fired(&sched_pool, &r.reminder_id, &r.fire_at).await
                        {
                            eprintln!("mark_fired failed: {e}");
                            continue;
                        }
                        sched_bus.emit(events::DomainEvent::ReminderFired {
                            task_id: r.task_id,
                            reminder_id: r.reminder_id,
                        });
                    }
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
            list_tag_tasks,
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
            seed_demo_data,
            set_task_pinned,
            list_reminders,
            add_reminder,
            snooze_reminder,
            delete_reminder,
            list_activity,
            list_templates,
            create_template,
            update_template,
            delete_template,
            instantiate_template,
            list_sections,
            create_section,
            rename_section,
            reorder_section,
            delete_section,
            move_task_to_section,
            list_filters,
            create_filter,
            update_filter,
            delete_filter,
            parse_filter_query,
            list_filter_tasks,
            get_matrix,
            set_quadrant,
            list_matrix,
            assign_to_quadrant
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
