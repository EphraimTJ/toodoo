mod api;
mod deeplink;
mod error;
mod events;
pub mod repo;

use serde_json::Value;
use sqlx::SqlitePool;
use tauri::{Emitter, Manager, State};
use tauri_plugin_deep_link::DeepLinkExt;
use tauri_plugin_notification::NotificationExt;

use events::EventBus;
use repo::activity::ActivityEntry;
use repo::cal_subscriptions::Subscription;
use repo::calendar::{CalEvent, CalItem, NewEvent};
use repo::check_items::CheckItem;
use repo::countdowns::Countdown;
use repo::filter_rule::Rule;
use repo::filters::Filter;
use repo::focus::{FocusSession, FocusStats, TaskActuals};
use repo::habits::{Habit, HabitCheckin, HabitInput, HabitStats, HabitToday};
use repo::folders::{Folder, FolderPatch};
use repo::matrix::{Quadrant, QuadrantTasks};
use repo::projects::{NewProject, Project, ProjectPatch};
use repo::reminders::Reminder;
use repo::sections::Section;
use repo::stats::{AchievementInfo, ScorePoint, Summary};
use repo::sticky_notes::StickyView;
use repo::tags::Tag;
use repo::tasks::{NewTask, SmartCounts, SmartView, Task, TaskPatch};
use repo::templates::{TaskTemplate, TemplatePayload};

pub struct AppState {
    pool: SqlitePool,
    bus: EventBus,
    /// The app data directory (holds the DB, `backups/`, and staged restores).
    data_dir: std::path::PathBuf,
    /// The API bearer token, shared with a running server so regeneration is live.
    api_token: std::sync::Arc<std::sync::RwLock<String>>,
    /// The running REST server, if enabled.
    api_server: std::sync::Mutex<Option<api::ServerHandle>>,
}

impl AppState {
    fn backups_dir(&self) -> std::path::PathBuf {
        self.data_dir.join("backups")
    }
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
async fn complete_task(state: State<'_, AppState>, id: String, tz_offset_min: i32) -> CmdResult<Vec<String>> {
    repo::tasks::complete_task(&state.pool, &state.bus, &id, tz_offset_min).await.map_err(err)
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

// ---- calendar ------------------------------------------------------------------

#[tauri::command]
async fn list_calendar(
    state: State<'_, AppState>,
    from: String,
    to: String,
    include_completed: bool,
) -> CmdResult<Vec<CalItem>> {
    repo::calendar::list_calendar(&state.pool, &from, &to, include_completed).await.map_err(err)
}

#[tauri::command]
async fn create_event(state: State<'_, AppState>, input: NewEvent) -> CmdResult<CalEvent> {
    repo::calendar::create_event(&state.pool, &state.bus, input).await.map_err(err)
}

#[tauri::command]
async fn get_event(state: State<'_, AppState>, id: String) -> CmdResult<CalEvent> {
    repo::calendar::get_event(&state.pool, &id).await.map_err(err)
}

#[tauri::command]
#[allow(clippy::too_many_arguments)]
async fn update_event(
    state: State<'_, AppState>,
    id: String,
    title: Option<String>,
    start_at: Option<String>,
    end_at: Option<String>,
    all_day: Option<bool>,
    location: Option<String>,
    notes: Option<String>,
    color: Option<String>,
) -> CmdResult<CalEvent> {
    repo::calendar::update_event(
        &state.pool,
        &state.bus,
        &id,
        title.as_deref(),
        start_at.as_deref(),
        end_at.as_deref(),
        all_day,
        location.as_deref(),
        notes.as_deref(),
        color.as_deref(),
    )
    .await
    .map_err(err)
}

#[tauri::command]
async fn delete_event(state: State<'_, AppState>, id: String) -> CmdResult<()> {
    repo::calendar::delete_event(&state.pool, &state.bus, &id).await.map_err(err)
}

#[tauri::command]
async fn move_calendar_item(
    state: State<'_, AppState>,
    kind: String,
    id: String,
    start_at: String,
    all_day: bool,
) -> CmdResult<()> {
    repo::calendar::move_item(&state.pool, &state.bus, &kind, &id, &start_at, all_day).await.map_err(err)
}

#[tauri::command]
async fn resize_calendar_item(
    state: State<'_, AppState>,
    kind: String,
    id: String,
    end_at: String,
) -> CmdResult<()> {
    repo::calendar::resize_item(&state.pool, &state.bus, &kind, &id, &end_at).await.map_err(err)
}

#[tauri::command]
async fn schedule_task(
    state: State<'_, AppState>,
    task_id: String,
    start_at: String,
    all_day: bool,
    duration_min: Option<i64>,
) -> CmdResult<()> {
    repo::calendar::schedule_task(&state.pool, &state.bus, &task_id, &start_at, all_day, duration_min)
        .await
        .map_err(err)
}

// ---- calendar subscriptions & import/export ------------------------------------

#[tauri::command]
async fn list_subscriptions(state: State<'_, AppState>) -> CmdResult<Vec<Subscription>> {
    repo::cal_subscriptions::list_subscriptions(&state.pool).await.map_err(err)
}

#[tauri::command]
async fn add_subscription(
    state: State<'_, AppState>,
    url: String,
    name: String,
    color: Option<String>,
    refresh_min: Option<i64>,
) -> CmdResult<Subscription> {
    repo::cal_subscriptions::add_subscription(&state.pool, &state.bus, &url, &name, color.as_deref(), refresh_min)
        .await
        .map_err(err)
}

#[tauri::command]
async fn update_subscription(
    state: State<'_, AppState>,
    id: String,
    name: Option<String>,
    color: Option<String>,
    visible: Option<bool>,
    refresh_min: Option<i64>,
) -> CmdResult<()> {
    repo::cal_subscriptions::update_subscription(
        &state.pool,
        &state.bus,
        &id,
        name.as_deref(),
        color.as_deref(),
        visible,
        refresh_min,
    )
    .await
    .map_err(err)
}

#[tauri::command]
async fn delete_subscription(state: State<'_, AppState>, id: String) -> CmdResult<()> {
    repo::cal_subscriptions::delete_subscription(&state.pool, &state.bus, &id).await.map_err(err)
}

#[tauri::command]
async fn refresh_subscription(state: State<'_, AppState>, id: String) -> CmdResult<usize> {
    repo::cal_subscriptions::refresh_subscription(&state.pool, &state.bus, &id).await.map_err(err)
}

#[tauri::command]
async fn import_ics(state: State<'_, AppState>, text: String) -> CmdResult<usize> {
    repo::cal_subscriptions::import_ics(&state.pool, &state.bus, &text).await.map_err(err)
}

#[tauri::command]
async fn export_ics(state: State<'_, AppState>, project_id: Option<String>) -> CmdResult<String> {
    repo::cal_subscriptions::export_ics(&state.pool, project_id.as_deref()).await.map_err(err)
}

// ---- focus / pomodoro ----------------------------------------------------------

#[tauri::command]
async fn start_focus(
    state: State<'_, AppState>,
    task_id: Option<String>,
    habit_id: Option<String>,
    kind: String,
    planned_min: Option<i64>,
) -> CmdResult<FocusSession> {
    repo::focus::start_session(
        &state.pool,
        &state.bus,
        task_id.as_deref(),
        habit_id.as_deref(),
        &kind,
        planned_min,
    )
    .await
    .map_err(err)
}

#[tauri::command]
async fn complete_focus(
    state: State<'_, AppState>,
    id: String,
    pause_ms: i64,
    note: Option<String>,
    status: String,
) -> CmdResult<FocusSession> {
    repo::focus::complete_session(&state.pool, &state.bus, &id, pause_ms, note.as_deref(), &status)
        .await
        .map_err(err)
}

#[tauri::command]
async fn set_focus_paused(state: State<'_, AppState>, id: String, paused: bool) -> CmdResult<()> {
    repo::focus::set_paused(&state.pool, &state.bus, &id, paused).await.map_err(err)
}

#[tauri::command]
async fn active_focus(state: State<'_, AppState>) -> CmdResult<Option<FocusSession>> {
    repo::focus::active_session(&state.pool).await.map_err(err)
}

#[tauri::command]
async fn add_focus_session(
    state: State<'_, AppState>,
    task_id: Option<String>,
    kind: String,
    started_at: String,
    ended_at: String,
    note: Option<String>,
) -> CmdResult<FocusSession> {
    repo::focus::add_manual_session(
        &state.pool,
        &state.bus,
        task_id.as_deref(),
        &kind,
        &started_at,
        &ended_at,
        note.as_deref(),
    )
    .await
    .map_err(err)
}

#[tauri::command]
async fn update_focus_session(
    state: State<'_, AppState>,
    id: String,
    started_at: Option<String>,
    ended_at: Option<String>,
    note: Option<String>,
) -> CmdResult<FocusSession> {
    repo::focus::update_session(
        &state.pool,
        &state.bus,
        &id,
        started_at.as_deref(),
        ended_at.as_deref(),
        note.as_deref(),
    )
    .await
    .map_err(err)
}

#[tauri::command]
async fn delete_focus_session(state: State<'_, AppState>, id: String) -> CmdResult<()> {
    repo::focus::delete_session(&state.pool, &state.bus, &id).await.map_err(err)
}

#[tauri::command]
async fn list_focus_sessions(
    state: State<'_, AppState>,
    from: String,
    to: String,
) -> CmdResult<Vec<FocusSession>> {
    repo::focus::list_sessions(&state.pool, &from, &to).await.map_err(err)
}

#[tauri::command]
async fn list_task_focus(state: State<'_, AppState>, task_id: String) -> CmdResult<Vec<FocusSession>> {
    repo::focus::list_task_sessions(&state.pool, &task_id).await.map_err(err)
}

#[tauri::command]
async fn focus_stats(
    state: State<'_, AppState>,
    from: String,
    to: String,
    tz_offset_min: i32,
) -> CmdResult<FocusStats> {
    repo::focus::focus_stats(&state.pool, &from, &to, tz_offset_min).await.map_err(err)
}

#[tauri::command]
async fn task_focus_actuals(state: State<'_, AppState>, task_id: String) -> CmdResult<TaskActuals> {
    repo::focus::task_actuals(&state.pool, &task_id).await.map_err(err)
}

// ---- stats & achievements ------------------------------------------------------

#[tauri::command]
async fn achievement_info(state: State<'_, AppState>) -> CmdResult<AchievementInfo> {
    repo::stats::achievement_info(&state.pool).await.map_err(err)
}

#[tauri::command]
async fn score_history(state: State<'_, AppState>, from: String, to: String) -> CmdResult<Vec<ScorePoint>> {
    repo::stats::score_history(&state.pool, &from, &to).await.map_err(err)
}

#[tauri::command]
async fn stats_summary(
    state: State<'_, AppState>,
    from: String,
    to: String,
    tz_offset_min: i32,
) -> CmdResult<Summary> {
    repo::stats::summary(&state.pool, &from, &to, tz_offset_min).await.map_err(err)
}

// ---- habits --------------------------------------------------------------------

#[tauri::command]
async fn list_habits(state: State<'_, AppState>, include_archived: bool) -> CmdResult<Vec<Habit>> {
    repo::habits::list_habits(&state.pool, include_archived).await.map_err(err)
}

#[tauri::command]
async fn get_habit(state: State<'_, AppState>, id: String) -> CmdResult<Habit> {
    repo::habits::get_habit(&state.pool, &id).await.map_err(err)
}

#[tauri::command]
async fn create_habit(state: State<'_, AppState>, input: HabitInput) -> CmdResult<Habit> {
    repo::habits::create_habit(&state.pool, &state.bus, input).await.map_err(err)
}

#[tauri::command]
async fn update_habit(state: State<'_, AppState>, id: String, input: HabitInput) -> CmdResult<Habit> {
    repo::habits::update_habit(&state.pool, &state.bus, &id, input).await.map_err(err)
}

#[tauri::command]
async fn set_habit_archived(state: State<'_, AppState>, id: String, archived: bool) -> CmdResult<()> {
    repo::habits::set_archived(&state.pool, &state.bus, &id, archived).await.map_err(err)
}

#[tauri::command]
async fn delete_habit(state: State<'_, AppState>, id: String) -> CmdResult<()> {
    repo::habits::delete_habit(&state.pool, &state.bus, &id).await.map_err(err)
}

#[tauri::command]
async fn reorder_habit(
    state: State<'_, AppState>,
    id: String,
    after_id: Option<String>,
) -> CmdResult<()> {
    repo::habits::reorder_habit(&state.pool, &state.bus, &id, after_id.as_deref()).await.map_err(err)
}

#[tauri::command]
async fn record_checkin(
    state: State<'_, AppState>,
    habit_id: String,
    date: String,
    status: String,
    value: Option<f64>,
    note: Option<String>,
) -> CmdResult<HabitCheckin> {
    repo::habits::record_checkin(&state.pool, &state.bus, &habit_id, &date, &status, value, note.as_deref())
        .await
        .map_err(err)
}

#[tauri::command]
async fn delete_checkin(state: State<'_, AppState>, habit_id: String, date: String) -> CmdResult<()> {
    repo::habits::delete_checkin(&state.pool, &state.bus, &habit_id, &date).await.map_err(err)
}

#[tauri::command]
async fn list_checkins(
    state: State<'_, AppState>,
    habit_id: String,
    from: String,
    to: String,
) -> CmdResult<Vec<HabitCheckin>> {
    repo::habits::list_checkins(&state.pool, &habit_id, &from, &to).await.map_err(err)
}

#[tauri::command]
async fn habit_stats(state: State<'_, AppState>, habit_id: String, today: String) -> CmdResult<HabitStats> {
    repo::habits::habit_stats(&state.pool, &habit_id, &today).await.map_err(err)
}

#[tauri::command]
async fn list_today_habits(state: State<'_, AppState>, today: String) -> CmdResult<Vec<HabitToday>> {
    repo::habits::list_today(&state.pool, &today).await.map_err(err)
}

// ---- notes (convert) -----------------------------------------------------------

#[tauri::command]
async fn set_task_kind(state: State<'_, AppState>, id: String, kind: String) -> CmdResult<()> {
    repo::tasks::set_task_kind(&state.pool, &state.bus, &id, &kind).await.map_err(err)
}

// ---- countdowns ----------------------------------------------------------------

#[tauri::command]
async fn list_countdowns(state: State<'_, AppState>) -> CmdResult<Vec<Countdown>> {
    repo::countdowns::list_countdowns(&state.pool).await.map_err(err)
}

#[tauri::command]
async fn create_countdown(
    state: State<'_, AppState>,
    title: String,
    target_date: String,
    repeat_annual: bool,
    style_json: Option<String>,
) -> CmdResult<Countdown> {
    repo::countdowns::create_countdown(&state.pool, &state.bus, &title, &target_date, repeat_annual, style_json.as_deref())
        .await
        .map_err(err)
}

#[tauri::command]
async fn update_countdown(
    state: State<'_, AppState>,
    id: String,
    title: Option<String>,
    target_date: Option<String>,
    repeat_annual: Option<bool>,
    style_json: Option<String>,
) -> CmdResult<Countdown> {
    repo::countdowns::update_countdown(
        &state.pool,
        &state.bus,
        &id,
        title.as_deref(),
        target_date.as_deref(),
        repeat_annual,
        style_json.as_deref(),
    )
    .await
    .map_err(err)
}

#[tauri::command]
async fn set_countdown_pinned(state: State<'_, AppState>, id: String, pinned: bool) -> CmdResult<()> {
    repo::countdowns::set_pinned(&state.pool, &state.bus, &id, pinned).await.map_err(err)
}

#[tauri::command]
async fn delete_countdown(state: State<'_, AppState>, id: String) -> CmdResult<()> {
    repo::countdowns::delete_countdown(&state.pool, &state.bus, &id).await.map_err(err)
}

// ---- sticky notes --------------------------------------------------------------

#[tauri::command]
async fn list_stickies(state: State<'_, AppState>) -> CmdResult<Vec<StickyView>> {
    repo::sticky_notes::list_open(&state.pool).await.map_err(err)
}

#[tauri::command]
async fn new_quick_sticky(state: State<'_, AppState>, text: String, color: Option<String>) -> CmdResult<String> {
    repo::sticky_notes::new_quick(&state.pool, &state.bus, &text, color.as_deref()).await.map_err(err)
}

#[tauri::command]
async fn sticky_from_note(state: State<'_, AppState>, note_id: String, color: Option<String>) -> CmdResult<String> {
    repo::sticky_notes::sticky_from_note(&state.pool, &state.bus, &note_id, color.as_deref()).await.map_err(err)
}

#[tauri::command]
async fn sticky_from_task(state: State<'_, AppState>, task_id: String, color: Option<String>) -> CmdResult<String> {
    repo::sticky_notes::sticky_from_task(&state.pool, &state.bus, &task_id, color.as_deref()).await.map_err(err)
}

#[tauri::command]
async fn update_sticky(
    state: State<'_, AppState>,
    id: String,
    x: Option<i64>,
    y: Option<i64>,
    w: Option<i64>,
    h: Option<i64>,
    color: Option<String>,
) -> CmdResult<()> {
    repo::sticky_notes::update_sticky(&state.pool, &state.bus, &id, x, y, w, h, color.as_deref())
        .await
        .map_err(err)
}

#[tauri::command]
async fn close_sticky(state: State<'_, AppState>, id: String) -> CmdResult<()> {
    repo::sticky_notes::close_sticky(&state.pool, &state.bus, &id).await.map_err(err)
}

#[tauri::command]
async fn delete_sticky(state: State<'_, AppState>, id: String) -> CmdResult<()> {
    repo::sticky_notes::delete_sticky(&state.pool, &state.bus, &id).await.map_err(err)
}

// ---- local REST API & URL scheme -----------------------------------------------

#[tauri::command]
async fn api_config(state: State<'_, AppState>) -> CmdResult<api::ApiConfig> {
    api::config(&state.pool, &state.bus).await.map_err(err)
}

#[tauri::command]
async fn api_set_enabled(state: State<'_, AppState>, enabled: bool) -> CmdResult<api::ApiConfig> {
    api::set_enabled_flag(&state.pool, &state.bus, enabled).await.map_err(err)?;
    if enabled {
        let running = state.api_server.lock().unwrap().is_some();
        if !running {
            let handle = api::serve(api::ApiState::new(
                state.pool.clone(),
                state.bus.clone(),
                state.api_token.clone(),
            ))
            .await
            .map_err(err)?;
            *state.api_server.lock().unwrap() = Some(handle);
        }
    } else if let Some(handle) = state.api_server.lock().unwrap().take() {
        handle.stop();
    }
    api::config(&state.pool, &state.bus).await.map_err(err)
}

#[tauri::command]
async fn api_regenerate_token(state: State<'_, AppState>) -> CmdResult<String> {
    let token = api::regenerate_token(&state.pool, &state.bus).await.map_err(err)?;
    // Update the live token in place — the running server picks it up immediately.
    *state.api_token.write().unwrap() = token.clone();
    Ok(token)
}

#[tauri::command]
fn copy_task_link(id: String) -> String {
    format!("toodoo://task/{id}")
}

// ---- data: import / export / backups -------------------------------------------

#[tauri::command]
async fn export_json(state: State<'_, AppState>) -> CmdResult<String> {
    repo::exporters::export_json(&state.pool).await.map_err(err)
}

#[tauri::command]
async fn export_csv(state: State<'_, AppState>) -> CmdResult<String> {
    repo::exporters::export_csv(&state.pool).await.map_err(err)
}

#[tauri::command]
async fn export_markdown(state: State<'_, AppState>) -> CmdResult<String> {
    repo::exporters::export_markdown(&state.pool).await.map_err(err)
}

#[tauri::command]
async fn import_csv(state: State<'_, AppState>, kind: String, text: String) -> CmdResult<usize> {
    let kind = repo::importers::ImportKind::parse(&kind)
        .ok_or_else(|| format!("unknown import kind: {kind}"))?;
    let rows = repo::importers::parse_csv(kind, &text);
    repo::importers::import_tasks(&state.pool, &state.bus, rows).await.map_err(err)
}

#[tauri::command]
async fn create_backup(state: State<'_, AppState>) -> CmdResult<repo::backup::BackupInfo> {
    repo::backup::backup_now(&state.pool, &state.bus, &state.backups_dir()).await.map_err(err)
}

#[tauri::command]
async fn list_backups(state: State<'_, AppState>) -> CmdResult<Vec<repo::backup::BackupInfo>> {
    repo::backup::list_backups(&state.backups_dir()).map_err(err)
}

#[tauri::command]
async fn restore_backup(state: State<'_, AppState>, path: String) -> CmdResult<()> {
    // Stage the snapshot; it is swapped in on the next launch (before the pool opens).
    let staged = state.data_dir.join(repo::backup::PENDING_RESTORE);
    repo::backup::stage_restore(std::path::Path::new(&path), &staged).map_err(err)
}

#[tauri::command]
async fn delete_backup(path: String) -> CmdResult<()> {
    repo::backup::delete_backup(std::path::Path::new(&path)).map_err(err)
}

#[tauri::command]
async fn backup_config(state: State<'_, AppState>) -> CmdResult<repo::backup::BackupConfig> {
    repo::backup::config(&state.pool).await.map_err(err)
}

#[tauri::command]
async fn set_backup_config(
    state: State<'_, AppState>,
    auto_enabled: bool,
    keep: i64,
) -> CmdResult<repo::backup::BackupConfig> {
    repo::backup::set_config(&state.pool, &state.bus, auto_enabled, keep).await.map_err(err)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_deep_link::init())
        .setup(|app| {
            let data_dir = app.path().app_data_dir()?;
            std::fs::create_dir_all(&data_dir)?;
            let db_path = data_dir.join("toodoo.db");

            // Apply a staged restore before opening the pool, so we never swap
            // the database out from under a live connection.
            match repo::backup::apply_pending_restore(&data_dir) {
                Ok(true) => eprintln!("restored database from a staged backup"),
                Ok(false) => {}
                Err(e) => eprintln!("pending restore failed: {e}"),
            }

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

            // `toodoo://` deep links: parse each opened URL and forward the action
            // to the webview (open task/project, or prefill quick-add).
            let dl_handle = app.handle().clone();
            app.deep_link().on_open_url(move |event| {
                for url in event.urls() {
                    if let Some(action) = deeplink::parse_deep_link(url.as_str()) {
                        let _ = dl_handle.emit("deep-link", &action);
                    }
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
                // Habit reminders fire at most once per (habit, day, time); dedup
                // is kept in memory (a restart may re-fire a reminder once).
                let mut habit_fired: std::collections::HashSet<String> = std::collections::HashSet::new();
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

                    // Habit reminders (local time). `today` in the key lets a new
                    // day re-arm the same reminder.
                    let tz_off = chrono::Local::now().offset().local_minus_utc() / 60;
                    let today = (chrono::Utc::now() + chrono::Duration::minutes(tz_off as i64))
                        .format("%Y-%m-%d")
                        .to_string();
                    if let Ok(habit_due) =
                        repo::habits::due_habit_reminders(&sched_pool, chrono::Utc::now(), tz_off).await
                    {
                        for h in habit_due {
                            let key = format!("{}|{}|{}", h.habit_id, today, h.time);
                            if !habit_fired.insert(key) {
                                continue;
                            }
                            let _ = sched_handle
                                .notification()
                                .builder()
                                .title("Toodoo habit")
                                .body(&h.name)
                                .show();
                        }
                    }
                }
            });

            // Calendar-subscription refresh: every 5 minutes, refresh any feed
            // whose interval has elapsed (first tick runs immediately on launch).
            let sub_pool = pool.clone();
            let sub_bus = bus.clone();
            tauri::async_runtime::spawn(async move {
                let mut tick = tokio::time::interval(std::time::Duration::from_secs(300));
                loop {
                    tick.tick().await;
                    if let Err(e) = repo::cal_subscriptions::refresh_due(&sub_pool, &sub_bus).await {
                        eprintln!("subscription refresh failed: {e}");
                    }
                }
            });

            // Overdue-penalty pass: hourly, dock points for tasks still open past
            // their due date (capped and day-deduped inside the pass, so running
            // it every hour is idempotent).
            let pen_pool = pool.clone();
            tauri::async_runtime::spawn(async move {
                let mut tick = tokio::time::interval(std::time::Duration::from_secs(3600));
                loop {
                    tick.tick().await;
                    let today = chrono::Local::now().format("%Y-%m-%d").to_string();
                    if let Err(e) = repo::stats::overdue_penalty_pass(&pen_pool, &today).await {
                        eprintln!("overdue penalty pass failed: {e}");
                    }
                }
            });

            // Daily auto-backup: every hour, if enabled and no backup exists for
            // today's local date, snapshot into `backups/` and prune to `keep`.
            let bk_pool = pool.clone();
            let bk_bus = bus.clone();
            let bk_dir = data_dir.join("backups");
            tauri::async_runtime::spawn(async move {
                let mut tick = tokio::time::interval(std::time::Duration::from_secs(3600));
                loop {
                    tick.tick().await;
                    let cfg = match repo::backup::config(&bk_pool).await {
                        Ok(c) => c,
                        Err(e) => {
                            eprintln!("backup config read failed: {e}");
                            continue;
                        }
                    };
                    if !cfg.auto_enabled {
                        continue;
                    }
                    let today = chrono::Local::now().format("%Y-%m-%d").to_string();
                    let done_today = repo::backup::last_backup_day(&bk_pool)
                        .await
                        .ok()
                        .flatten()
                        .is_some_and(|d| d == today);
                    if done_today {
                        continue;
                    }
                    if let Err(e) = repo::backup::backup_now(&bk_pool, &bk_bus, &bk_dir).await {
                        eprintln!("auto-backup failed: {e}");
                    }
                }
            });

            // Local REST API: load (or mint) the bearer token, and start the
            // server now if the user previously enabled it. Binds 127.0.0.1 only.
            let api_token = tauri::async_runtime::block_on(api::get_or_create_token(&pool, &bus))?;
            let api_token = std::sync::Arc::new(std::sync::RwLock::new(api_token));
            let api_server = std::sync::Mutex::new(None);
            if tauri::async_runtime::block_on(api::is_enabled(&pool)).unwrap_or(false) {
                let handle = tauri::async_runtime::block_on(api::serve(api::ApiState::new(
                    pool.clone(),
                    bus.clone(),
                    api_token.clone(),
                )));
                match handle {
                    Ok(h) => *api_server.lock().unwrap() = Some(h),
                    Err(e) => eprintln!("API server failed to start: {e}"),
                }
            }

            app.manage(AppState { pool, bus, data_dir, api_token, api_server });
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
            assign_to_quadrant,
            list_calendar,
            create_event,
            get_event,
            update_event,
            delete_event,
            move_calendar_item,
            resize_calendar_item,
            schedule_task,
            list_subscriptions,
            add_subscription,
            update_subscription,
            delete_subscription,
            refresh_subscription,
            import_ics,
            export_ics,
            start_focus,
            complete_focus,
            set_focus_paused,
            active_focus,
            add_focus_session,
            update_focus_session,
            delete_focus_session,
            list_focus_sessions,
            list_task_focus,
            focus_stats,
            task_focus_actuals,
            achievement_info,
            score_history,
            stats_summary,
            list_habits,
            get_habit,
            create_habit,
            update_habit,
            set_habit_archived,
            delete_habit,
            reorder_habit,
            record_checkin,
            delete_checkin,
            list_checkins,
            habit_stats,
            list_today_habits,
            set_task_kind,
            list_countdowns,
            create_countdown,
            update_countdown,
            set_countdown_pinned,
            delete_countdown,
            list_stickies,
            new_quick_sticky,
            sticky_from_note,
            sticky_from_task,
            update_sticky,
            close_sticky,
            delete_sticky,
            api_config,
            api_set_enabled,
            api_regenerate_token,
            copy_task_link,
            export_json,
            export_csv,
            export_markdown,
            import_csv,
            create_backup,
            list_backups,
            restore_backup,
            delete_backup,
            backup_config,
            set_backup_config
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
