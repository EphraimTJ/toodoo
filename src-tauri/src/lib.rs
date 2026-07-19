mod api;
mod deeplink;
mod desktop;
mod error;
mod events;
pub mod repo;
mod toast_actions;

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
    /// Mirror of `tray.closeToTray` so the sync CloseRequested handler never
    /// blocks on the DB (kept in step by `set_close_to_tray`).
    close_to_tray: std::sync::atomic::AtomicBool,
    /// The "still running in the tray" notice is done for this run: either
    /// permanently dismissed (persisted) or already shown once this run.
    tray_notice_done: std::sync::atomic::AtomicBool,
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
async fn complete_task(
    state: State<'_, AppState>,
    id: String,
    tz_offset_min: i32,
    expected_occurrence: Option<String>,
) -> CmdResult<Vec<String>> {
    repo::tasks::complete_task_with(
        &state.pool,
        &state.bus,
        &id,
        tz_offset_min,
        expected_occurrence.as_deref(),
    )
    .await
    .map_err(err)
}

#[tauri::command]
async fn reopen_task(state: State<'_, AppState>, id: String) -> CmdResult<()> {
    repo::tasks::reopen_task(&state.pool, &state.bus, &id).await.map_err(err)
}

#[tauri::command]
async fn set_wont_do(state: State<'_, AppState>, id: String, tz_offset_min: i32) -> CmdResult<Vec<String>> {
    repo::tasks::set_wont_do(&state.pool, &state.bus, &id, tz_offset_min).await.map_err(err)
}

#[tauri::command]
async fn duplicate_task(state: State<'_, AppState>, id: String) -> CmdResult<Task> {
    repo::tasks::duplicate_task(&state.pool, &state.bus, &id).await.map_err(err)
}

#[tauri::command]
async fn check_item_to_subtask(state: State<'_, AppState>, item_id: String) -> CmdResult<Task> {
    repo::tasks::check_item_to_subtask(&state.pool, &state.bus, &item_id).await.map_err(err)
}

#[tauri::command]
async fn subtask_to_check_item(state: State<'_, AppState>, task_id: String) -> CmdResult<CheckItem> {
    repo::tasks::subtask_to_check_item(&state.pool, &state.bus, &task_id).await.map_err(err)
}

#[tauri::command]
async fn save_task_as_template(
    state: State<'_, AppState>,
    task_id: String,
    name: String,
) -> CmdResult<TaskTemplate> {
    repo::templates::save_task_as_template(&state.pool, &state.bus, &task_id, &name).await.map_err(err)
}

// ---- comments ------------------------------------------------------------------

#[tauri::command]
async fn list_comments(state: State<'_, AppState>, task_id: String) -> CmdResult<Vec<repo::comments::Comment>> {
    repo::comments::list_comments(&state.pool, &task_id).await.map_err(err)
}

#[tauri::command]
async fn add_comment(state: State<'_, AppState>, task_id: String, body: String) -> CmdResult<repo::comments::Comment> {
    repo::comments::add_comment(&state.pool, &state.bus, &task_id, &body).await.map_err(err)
}

#[tauri::command]
async fn delete_comment(state: State<'_, AppState>, id: String) -> CmdResult<()> {
    repo::comments::delete_comment(&state.pool, &state.bus, &id).await.map_err(err)
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

#[tauri::command]
async fn search_all(
    state: State<'_, AppState>,
    query: String,
    filters: repo::search::SearchFilters,
) -> CmdResult<repo::search::SearchResults> {
    repo::search::search_all(&state.pool, &query, &filters, 50).await.map_err(err)
}

#[tauri::command]
async fn recent_searches(state: State<'_, AppState>) -> CmdResult<Vec<String>> {
    repo::search::recent_searches(&state.pool).await.map_err(err)
}

#[tauri::command]
async fn add_recent_search(state: State<'_, AppState>, query: String) -> CmdResult<Vec<String>> {
    repo::search::add_recent_search(&state.pool, &state.bus, &query).await.map_err(err)
}

#[tauri::command]
async fn list_saved_searches(
    state: State<'_, AppState>,
) -> CmdResult<Vec<repo::saved_searches::SavedSearch>> {
    repo::saved_searches::list_saved_searches(&state.pool).await.map_err(err)
}

#[tauri::command]
async fn create_saved_search(
    state: State<'_, AppState>,
    query: String,
    filters_json: Option<String>,
) -> CmdResult<repo::saved_searches::SavedSearch> {
    repo::saved_searches::create_saved_search(&state.pool, &state.bus, &query, filters_json.as_deref())
        .await
        .map_err(err)
}

#[tauri::command]
async fn delete_saved_search(state: State<'_, AppState>, id: String) -> CmdResult<()> {
    repo::saved_searches::delete_saved_search(&state.pool, &state.bus, &id).await.map_err(err)
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
async fn merge_tags(state: State<'_, AppState>, src: String, dst: String) -> CmdResult<()> {
    repo::tags::merge_tags(&state.pool, &state.bus, &src, &dst).await.map_err(err)
}

#[tauri::command]
async fn set_tag_parent(state: State<'_, AppState>, id: String, parent_id: Option<String>) -> CmdResult<()> {
    repo::tags::set_tag_parent(&state.pool, &state.bus, &id, parent_id.as_deref()).await.map_err(err)
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

/// Load the feature-complete sample workspace (first-run prompt passes
/// `force=false`; the Settings → Advanced action confirms first and passes
/// `force=true`). Available in release builds, unlike the dev-only perf seed.
#[tauri::command]
async fn seed_sample_data(state: State<'_, AppState>, force: bool) -> CmdResult<()> {
    repo::seed::seed_sample_data(&state.pool, &state.bus, force).await.map_err(err)
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
    // Stage the snapshot (validated, fsynced, atomically renamed); it is
    // swapped in on the next launch (before the pool opens).
    let staged = state.data_dir.join(repo::backup::PENDING_RESTORE);
    repo::backup::stage_restore(std::path::Path::new(&path), &staged).await.map_err(err)
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

// ---- desktop (native) ----------------------------------------------------------

#[tauri::command]
async fn desktop_config(state: State<'_, AppState>) -> CmdResult<desktop::DesktopConfig> {
    desktop::config(&state.pool).await.map_err(err)
}

#[tauri::command]
async fn set_quick_add_hotkey(
    app: tauri::AppHandle,
    state: State<'_, AppState>,
    accel: String,
) -> CmdResult<desktop::DesktopConfig> {
    let cfg = desktop::set_hotkey(&state.pool, &state.bus, &accel).await.map_err(err)?;
    // Re-register the global shortcut with the new accelerator.
    use tauri_plugin_global_shortcut::GlobalShortcutExt;
    let gs = app.global_shortcut();
    let _ = gs.unregister_all();
    let _ = gs.register(cfg.quick_add_hotkey.as_str());
    Ok(cfg)
}

#[tauri::command]
async fn set_notif_actions(state: State<'_, AppState>, on: bool) -> CmdResult<desktop::DesktopConfig> {
    desktop::set_notif_actions(&state.pool, &state.bus, on).await.map_err(err)
}

#[tauri::command]
async fn set_notif_snooze_min(
    state: State<'_, AppState>,
    minutes: i64,
) -> CmdResult<desktop::DesktopConfig> {
    desktop::set_notif_snooze_min(&state.pool, &state.bus, minutes).await.map_err(err)
}

#[tauri::command]
async fn set_simple_popouts(state: State<'_, AppState>, on: bool) -> CmdResult<desktop::DesktopConfig> {
    desktop::set_simple_popouts(&state.pool, &state.bus, on).await.map_err(err)
}

#[tauri::command]
async fn set_popout_style(state: State<'_, AppState>, style: String) -> CmdResult<desktop::DesktopConfig> {
    desktop::set_popout_style(&state.pool, &state.bus, &style).await.map_err(err)
}

#[tauri::command]
async fn set_close_to_tray(
    state: State<'_, AppState>,
    on: bool,
) -> CmdResult<desktop::DesktopConfig> {
    let cfg = desktop::set_close_to_tray(&state.pool, &state.bus, on).await.map_err(err)?;
    state.close_to_tray.store(on, std::sync::atomic::Ordering::Relaxed);
    Ok(cfg)
}

#[tauri::command]
async fn set_start_minimized(
    state: State<'_, AppState>,
    on: bool,
) -> CmdResult<desktop::DesktopConfig> {
    desktop::set_start_minimized(&state.pool, &state.bus, on).await.map_err(err)
}

#[tauri::command]
async fn set_autostart(
    app: tauri::AppHandle,
    state: State<'_, AppState>,
    on: bool,
) -> CmdResult<desktop::DesktopConfig> {
    use tauri_plugin_autostart::ManagerExt;
    let mgr = app.autolaunch();
    let _ = if on { mgr.enable() } else { mgr.disable() };
    desktop::set_autostart_flag(&state.pool, &state.bus, on).await.map_err(err)?;
    desktop::config(&state.pool).await.map_err(err)
}

/// Pop-out windows forward their boot beacon and any uncaught webview error
/// here, so a packaged build's white screen becomes a diagnosable log line.
/// The beacon also feeds the watchdog in `desktop::open_or_focus`.
#[tauri::command]
async fn log_window_error(
    app: tauri::AppHandle,
    window: tauri::WebviewWindow,
    state: State<'_, AppState>,
    message: String,
    win: Option<String>,
) -> CmdResult<()> {
    let label = window.label().to_string();
    if message == "booted ok" {
        log::info!("[window] {label} ({}): {message}", win.as_deref().unwrap_or("?"));
        desktop::mark_window_booted(&app, &label);
        // A healthy boot clears the persisted failure streak for this kind.
        let key = format!("popout.failures.{}", desktop::popout_kind(&label));
        let _ = repo::settings::set_setting(&state.pool, &state.bus, &key, serde_json::json!(0)).await;
    } else {
        log::error!("[window] {label} ({}): {message}", win.as_deref().unwrap_or("?"));
    }
    Ok(())
}

/// Fire the full notification path immediately (Settings → Advanced): log the
/// plugin permission state (requesting it if needed), attempt a native
/// `show()`, log the outcome, and emit a synthetic `reminder-fired` so the
/// in-app toast path is exercised too. Diagnosing "reminders never fire" no
/// longer requires waiting for the scheduler.
#[tauri::command]
fn send_test_notification(app: tauri::AppHandle) -> CmdResult<String> {
    let mut report: Vec<String> = Vec::new();
    match app.notification().permission_state() {
        Ok(state) => {
            log::info!("[notify-test] permission_state: {state:?}");
            report.push(format!("permission: {state:?}"));
            if !matches!(state, tauri_plugin_notification::PermissionState::Granted) {
                match app.notification().request_permission() {
                    Ok(new_state) => {
                        log::info!("[notify-test] request_permission -> {new_state:?}");
                        report.push(format!("requested → {new_state:?}"));
                    }
                    Err(e) => {
                        log::error!("[notify-test] request_permission FAILED: {e}");
                        report.push(format!("request FAILED: {e}"));
                    }
                }
            }
        }
        Err(e) => {
            log::error!("[notify-test] permission_state FAILED: {e}");
            report.push(format!("permission check FAILED: {e}"));
        }
    }
    match app
        .notification()
        .builder()
        .title("Toodoo")
        .body("Test notification — if you can read this, native toasts work.")
        .show()
    {
        Ok(()) => {
            log::info!("[notify-test] notification.show() ok");
            report.push("native show(): ok".to_string());
        }
        Err(e) => {
            log::error!("[notify-test] notification.show() FAILED: {e}");
            report.push(format!("native show() FAILED: {e}"));
        }
    }
    // The in-app toast path (reliable across OSes) — same event the scheduler
    // emits; reminderId "test" renders dismiss-only.
    let _ = app.emit(
        "reminder-fired",
        serde_json::json!({
            "taskId": "test",
            "reminderId": "test",
            "title": "Test notification (in-app path)",
        }),
    );
    log::info!("[notify-test] emitted in-app test toast");
    Ok(report.join("; "))
}

/// Reveal the rotating log file's folder (Settings → Advanced), so the user
/// can grab toodoo.log without knowing the path.
#[tauri::command]
fn open_logs_folder(app: tauri::AppHandle) -> CmdResult<()> {
    let dir = app.path().app_log_dir().map_err(|e| e.to_string())?;
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    tauri_plugin_opener::open_path(dir.to_string_lossy().into_owned(), None::<&str>)
        .map_err(|e| e.to_string())
}

/// AUMID for WinRT toasts: the bundle identifier for the installed app (the
/// NSIS shortcut carries it), with the plugin's dev-mode fallback (a bare
/// `target/debug|release` exe has no registered AUMID — borrow PowerShell's so
/// dev toasts still render).
#[cfg(windows)]
fn toast_app_id(app: &tauri::AppHandle) -> String {
    let sep = std::path::MAIN_SEPARATOR;
    let exe_dir = std::env::current_exe()
        .ok()
        .and_then(|p| p.parent().map(|d| d.display().to_string()))
        .unwrap_or_default();
    if exe_dir.ends_with(&format!("{sep}target{sep}debug"))
        || exe_dir.ends_with(&format!("{sep}target{sep}release"))
    {
        tauri_winrt_notification::Toast::POWERSHELL_APP_ID.to_string()
    } else {
        app.config().identifier.clone()
    }
}

/// Reminder toast with Complete / Snooze buttons via WinRT (the notification
/// plugin drops actions on desktop). The activation handler is an in-process
/// delegate: it fires for clicks on the live toast AND from Action Center
/// while the app runs; with the app gone, Windows just dismisses the toast
/// (docs/decisions.md).
#[cfg(windows)]
fn show_windows_action_toast(
    app: &tauri::AppHandle,
    req: &repo::reminders::ToastRequest,
) -> std::result::Result<(), String> {
    use tauri_winrt_notification::Toast;
    let complete_arg = toast_actions::encode(&toast_actions::ToastAction::Complete {
        task_id: req.task_id.clone(),
        expected_occurrence: req.occurrence.clone(),
    });
    let snooze_arg = toast_actions::encode(&toast_actions::ToastAction::Snooze {
        reminder_id: req.reminder_id.clone(),
        minutes: req.snooze_min,
    });
    let handle = app.clone();
    let toast_task = req.task_id.clone();
    Toast::new(&toast_app_id(app))
        .title(&req.title)
        .text1(&req.body)
        .add_button("Complete", &complete_arg)
        .add_button(&format!("Snooze {}m", req.snooze_min), &snooze_arg)
        .on_activated(move |arg| {
            handle_toast_activation(handle.clone(), arg, toast_task.clone());
            Ok(())
        })
        .show()
        .map_err(|e| format!("winrt toast show failed: {e}"))
}

/// Route a toast activation: buttons dispatch through the repo (normal
/// complete/snooze paths, `[notify-action]` audit lines); a body click focuses
/// the app on the toast's task via the existing deep-link event.
#[cfg(windows)]
fn handle_toast_activation(app: tauri::AppHandle, arg: Option<String>, toast_task_id: String) {
    let action = toast_actions::parse(arg.as_deref(), &toast_task_id);
    log::info!("[notify-action] toast activated: arg={arg:?} -> {action:?}");
    match action {
        toast_actions::ToastAction::OpenTask { task_id } => {
            let _ = show_main_window(app.clone());
            if !task_id.is_empty() {
                let _ = app.emit("deep-link", &deeplink::DeepLinkAction::OpenTask { id: task_id });
            }
        }
        other => {
            if matches!(other, toast_actions::ToastAction::AckTrayNotice) {
                // Keep the in-memory flag in step; the repo dispatch persists it.
                app.state::<AppState>()
                    .tray_notice_done
                    .store(true, std::sync::atomic::Ordering::Relaxed);
            }
            let state = app.state::<AppState>();
            let pool = state.pool.clone();
            let bus = state.bus.clone();
            let tz = chrono::Local::now().offset().local_minus_utc() / 60;
            tauri::async_runtime::spawn(async move {
                if let Err(e) =
                    repo::reminders::dispatch_toast_action(&pool, &bus, other, tz, chrono::Utc::now())
                        .await
                {
                    log::error!("[notify-action] dispatch failed: {e}");
                }
            });
        }
    }
}

/// One-time "still running in the tray" notice, shown the first time the close
/// button hides the window (at most once per run; "Don't show again" persists
/// the dismissal via the toast-action path). Falls back to a plain plugin
/// notification when the WinRT toast is unavailable.
fn show_tray_notice(app: &tauri::AppHandle) {
    const BODY: &str =
        "Toodoo is still running in the tray — reminders keep working. Use the tray menu's Quit to exit fully.";
    #[cfg(windows)]
    {
        use tauri_winrt_notification::Toast;
        let handle = app.clone();
        let shown = Toast::new(&toast_app_id(app))
            .title("Toodoo")
            .text1(BODY)
            .add_button(
                "Don't show again",
                &toast_actions::encode(&toast_actions::ToastAction::AckTrayNotice),
            )
            .on_activated(move |arg| {
                handle_toast_activation(handle.clone(), arg, String::new());
                Ok(())
            })
            .show();
        match shown {
            Ok(()) => return,
            Err(e) => log::warn!("[tray] winrt notice failed ({e}); using the plain notification"),
        }
    }
    let _ = app.notification().builder().title("Toodoo").body(BODY).show();
}

// Window-open commands are fire-and-forget: creation runs on the main thread
// (desktop::request_popout) and its outcome is reported by the boot beacon /
// watchdog, never by the IPC reply — an IPC-context build() hang was the
// round-3 white-window failure mode.
/// Show + focus the main window (pill overflow menu → "Open Toodoo").
#[tauri::command]
fn show_main_window(app: tauri::AppHandle) -> CmdResult<()> {
    if let Some(win) = app.get_webview_window("main") {
        let _ = win.unminimize();
        let _ = win.show();
        let _ = win.set_focus();
    }
    Ok(())
}

#[tauri::command]
fn open_quick_add_window(app: tauri::AppHandle) -> CmdResult<()> {
    desktop::request_popout(&app, "quickadd", "win=quickadd", "Quick add", 520.0, 180.0, desktop::PopoutStyle::Decorated);
    Ok(())
}

/// The chrome the user picked for focus/sticky pop-outs (popout.style).
async fn configured_popout_style(app: &tauri::AppHandle) -> desktop::PopoutStyle {
    match app.try_state::<AppState>() {
        Some(state) => desktop::style_from_setting(
            &desktop::config(&state.pool).await.map(|c| c.popout_style).unwrap_or_default(),
        ),
        None => desktop::PopoutStyle::Pill,
    }
}

/// Open the focus pop-out with the configured chrome (usable from any context).
fn open_focus_popout(app: &tauri::AppHandle) {
    let app = app.clone();
    tauri::async_runtime::spawn(async move {
        let style = configured_popout_style(&app).await;
        desktop::request_popout(&app, "focus", "win=focus", "Focus", 210.0, 64.0, style);
    });
}

fn open_sticky_popout(app: &tauri::AppHandle, id: String) {
    let app = app.clone();
    tauri::async_runtime::spawn(async move {
        let style = configured_popout_style(&app).await;
        desktop::request_popout(
            &app,
            &format!("sticky-{id}"),
            &format!("win=sticky&id={id}"),
            "Sticky",
            260.0,
            240.0,
            style,
        );
    });
}

#[tauri::command]
fn open_focus_window(app: tauri::AppHandle) -> CmdResult<()> {
    open_focus_popout(&app);
    Ok(())
}

#[tauri::command]
fn open_sticky_window(app: tauri::AppHandle, id: String) -> CmdResult<()> {
    open_sticky_popout(&app, id);
    Ok(())
}

#[tauri::command]
async fn today_count(state: State<'_, AppState>) -> CmdResult<i64> {
    let tz_off = chrono::Local::now().offset().local_minus_utc() / 60;
    let today = (chrono::Utc::now() + chrono::Duration::minutes(tz_off as i64))
        .format("%Y-%m-%d")
        .to_string();
    let counts = repo::tasks::smart_counts(&state.pool, &today, tz_off).await.map_err(err)?;
    Ok(counts.today)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Panics must reach the log file, not just a vanished console.
    let default_panic = std::panic::take_hook();
    std::panic::set_hook(Box::new(move |info| {
        log::error!("panic: {info}");
        default_panic(info);
    }));

    tauri::Builder::default()
        // Single instance FIRST (its requirement): a second launch focuses the
        // running instance — which may be hidden in the tray — instead of
        // starting another process; deep-link args forward via the feature.
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            log::info!("[tray] second launch detected — focusing the running instance");
            if let Some(w) = app.get_webview_window("main") {
                let _ = w.unminimize();
                let _ = w.show();
                let _ = w.set_focus();
            }
        }))
        // File + stdout logging, always on: rotating toodoo.log under the
        // app-local-data logs dir (surfaced by Settings → Advanced → "Open
        // logs folder"). Every [reminders]/[window]/panic diagnostic lands
        // there, so a packaged-build failure is diagnosable from the file.
        .plugin(
            tauri_plugin_log::Builder::new()
                .targets([
                    tauri_plugin_log::Target::new(tauri_plugin_log::TargetKind::Stdout),
                    tauri_plugin_log::Target::new(tauri_plugin_log::TargetKind::LogDir {
                        file_name: Some("toodoo".into()),
                    }),
                ])
                .level(log::LevelFilter::Info)
                .max_file_size(5_000_000)
                .rotation_strategy(tauri_plugin_log::RotationStrategy::KeepOne)
                .build(),
        )
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_notification::init())
        // Self-update from signed GitHub Releases (see plugins.updater in
        // tauri.conf.json). `process` is needed to relaunch after install.
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_deep_link::init())
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            // Lets launched_hidden() tell a login launch from a double-click
            // (start-minimized-to-tray). Re-toggling launch-at-login refreshes
            // an old registration that predates the flag.
            Some(vec!["--autostart"]),
        ))
        .plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_handler(|app, _shortcut, event| {
                    // We register a single shortcut (quick-add), so any press opens it.
                    if event.state == tauri_plugin_global_shortcut::ShortcutState::Pressed {
                        desktop::request_popout(app, "quickadd", "win=quickadd", "Quick add", 520.0, 180.0, desktop::PopoutStyle::Decorated);
                    }
                })
                .build(),
        )
        .setup(|app| {
            // Boot-beacon bookkeeping for the pop-out window watchdog.
            app.manage(desktop::WindowWatch::default());

            let data_dir = app.path().app_data_dir()?;
            std::fs::create_dir_all(&data_dir)?;
            let db_path = data_dir.join("toodoo.db");

            // Apply a staged restore before opening the pool, so we never swap
            // the database out from under a live connection. The staged file is
            // validated first and the previous db is kept as a rollback until
            // the restored one opens and migrates successfully.
            match tauri::async_runtime::block_on(repo::backup::apply_pending_restore(&data_dir)) {
                Ok(true) => log::info!("restored database from a staged backup"),
                Ok(false) => {}
                Err(e) => log::error!("pending restore failed: {e}"),
            }

            let pool = match tauri::async_runtime::block_on(repo::db::connect(&db_path)) {
                Ok(pool) => pool,
                Err(e) => match repo::backup::undo_failed_restore(&data_dir) {
                    Ok(true) => {
                        log::error!("restored database failed to open ({e}); rolled back to the previous database");
                        tauri::async_runtime::block_on(repo::db::connect(&db_path))?
                    }
                    _ => return Err(e.into()),
                },
            };
            // The db opened and migrated — the pre-restore rollback (if any) is
            // no longer needed.
            repo::backup::finalize_restore(&data_dir);

            // Close-to-tray bootstrap: the main window is configured hidden
            // (tauri.conf.json `visible: false`) so an autostart launch can
            // stay in the tray without a flash; every other launch shows it
            // here, immediately after the DB is up.
            let (boot_close_to_tray, boot_start_minimized, boot_notice_done) =
                tauri::async_runtime::block_on(async {
                    let cfg = desktop::config(&pool).await.ok();
                    let notice = repo::settings::get_setting(&pool, desktop::KEY_TRAY_NOTICE)
                        .await
                        .ok()
                        .flatten()
                        .and_then(|v| v.as_bool())
                        .unwrap_or(false);
                    (
                        cfg.as_ref().map(|c| c.close_to_tray).unwrap_or(true),
                        cfg.as_ref().map(|c| c.start_minimized).unwrap_or(true),
                        notice,
                    )
                });
            let launch_args: Vec<String> = std::env::args().collect();
            if let Some(main) = app.get_webview_window("main") {
                if desktop::launched_hidden(&launch_args, boot_start_minimized) {
                    log::info!("[tray] autostart launch — starting hidden in the tray");
                } else {
                    let _ = main.show();
                }
            }

            // Diagnostic hook: TOODOO_DIAG_WINDOWS=1 auto-opens the pop-out
            // windows shortly after launch, so their load/boot can be observed
            // from stderr (with the WindowRoot boot beacon) without clicking
            // through the UI. Used to verify packaged-build window loading.
            // Webview runtime context in every log file — machine-dependent
            // webview failures need the version on record.
            match tauri::webview_version() {
                Ok(v) => log::info!("[window] WebView2 runtime version: {v}"),
                Err(e) => log::error!("[window] WebView2 version lookup failed: {e}"),
            }

            // Notification identity context in every log file: permission
            // state + the identifier Windows resolves toasts against.
            match app.notification().permission_state() {
                Ok(s) => log::info!(
                    "[notify] startup permission_state: {s:?} (identifier {})",
                    app.config().identifier
                ),
                Err(e) => log::error!("[notify] startup permission_state FAILED: {e}"),
            }
            // TOODOO_DIAG_NOTIFY=1 fires the full test-notification path
            // shortly after launch (headless diagnosis of packaged builds).
            if std::env::var("TOODOO_DIAG_NOTIFY").is_ok() {
                let h = app.handle().clone();
                tauri::async_runtime::spawn(async move {
                    tokio::time::sleep(std::time::Duration::from_secs(4)).await;
                    match send_test_notification(h) {
                        Ok(report) => log::info!("[diag] test notification: {report}"),
                        Err(e) => log::error!("[diag] test notification failed: {e}"),
                    }
                });
            }

            if let Ok(diag) = std::env::var("TOODOO_DIAG_WINDOWS") {
                let h = app.handle().clone();
                tauri::async_runtime::spawn(async move {
                    tokio::time::sleep(std::time::Duration::from_secs(3)).await;
                    if diag == "styles" {
                        // Chrome bisect (round-3b): four windows from safest
                        // to fanciest chrome, same content. The log's
                        // build-returned / booted / watchdog lines per label
                        // name the exact flag that hangs on this machine.
                        log::info!("[diag] style bisect: opening 4 windows (a=decorated, b=frameless, c=+transparent, d=full pill)");
                        use desktop::PopoutStyle as S;
                        for (label, style) in [
                            ("diag-style-a-decorated", S::Decorated),
                            ("diag-style-b-frameless", S::FramelessOpaque),
                            ("diag-style-c-transparent", S::FramelessTransparent),
                            ("diag-style-d-pill", S::Pill),
                        ] {
                            desktop::request_popout(&h, label, "win=quickadd", label, 300.0, 120.0, style);
                        }
                        // Tidy up after the evidence is in the log.
                        tokio::time::sleep(std::time::Duration::from_secs(15)).await;
                        for label in [
                            "diag-style-a-decorated",
                            "diag-style-b-frameless",
                            "diag-style-c-transparent",
                            "diag-style-d-pill",
                        ] {
                            if let Some(win) = h.get_webview_window(label) {
                                let _ = win.destroy();
                            }
                        }
                        log::info!("[diag] style bisect finished");
                        return;
                    }
                    log::info!("[diag] opening focus + sticky windows");
                    desktop::request_popout(&h, "focus", "win=focus", "Focus", 210.0, 64.0, desktop::PopoutStyle::Pill);
                    desktop::request_popout(&h, "sticky-diag", "win=sticky&id=diag", "Sticky", 260.0, 240.0, desktop::PopoutStyle::Pill);
                    if diag == "watchdog" {
                        // A window whose content deliberately never beacons —
                        // the watchdog must destroy it and raise the toast.
                        log::info!("[diag] opening nobeacon window to exercise the watchdog");
                        desktop::request_popout(&h, "diag-nobeacon", "win=nobeacon", "Diag", 260.0, 160.0, desktop::PopoutStyle::Decorated);
                    }
                });
            }
            let bus = EventBus::new();

            // Forward every domain event to the webview so views stay live, and
            // refresh the tray's Today count when a task-affecting event fires
            // (event-driven, not polled).
            let mut rx = bus.subscribe();
            let handle = app.handle().clone();
            let fwd_pool = pool.clone();
            tauri::async_runtime::spawn(async move {
                while let Ok(event) = rx.recv().await {
                    let _ = handle.emit("domain-event", &event);
                    if matches!(
                        event,
                        events::DomainEvent::TaskCreated { .. }
                            | events::DomainEvent::TaskUpdated { .. }
                            | events::DomainEvent::TaskCompleted { .. }
                            | events::DomainEvent::TaskTrashed { .. }
                            | events::DomainEvent::TaskRestored { .. }
                            | events::DomainEvent::TaskDeleted { .. }
                            | events::DomainEvent::TaskMoved { .. }
                            | events::DomainEvent::SeedCompleted
                    ) {
                        desktop::refresh_tray_tooltip(&handle, &fwd_pool).await;
                    }
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

            // Reminder scheduler: every 30s dispatch any reminder whose time
            // has arrived (including ones missed while the app was closed —
            // the first tick runs immediately). Delivery is claim-before-
            // attempt / ack-only-on-success with bounded retry
            // (repo::reminders::dispatch_due, docs/decisions.md): a claim is
            // persisted before show(), `mark_fired` acks only a successful
            // (or given-up) delivery, and a crash between the two recovers
            // via the stale-claim window — at worst one duplicate, never a
            // permanently lost reminder.
            struct TauriNotify(tauri::AppHandle);
            impl repo::reminders::NotificationBackend for TauriNotify {
                fn show(&self, req: &repo::reminders::ToastRequest) -> std::result::Result<(), String> {
                    // Windows + actions enabled: WinRT toast with Complete /
                    // Snooze buttons (the notification plugin drops actions on
                    // desktop — see docs/decisions.md). Everything else keeps
                    // the plugin path.
                    #[cfg(windows)]
                    if req.actions {
                        return show_windows_action_toast(&self.0, req);
                    }
                    self.0
                        .notification()
                        .builder()
                        .title(&req.title)
                        .body(&req.body)
                        .show()
                        .map_err(|e| e.to_string())
                }
            }
            let sched_pool = pool.clone();
            let sched_bus = bus.clone();
            let sched_handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                // Habit reminders fire at most once per (habit, day, time); dedup
                // is kept in memory (a restart may re-fire a reminder once).
                let backend = TauriNotify(sched_handle.clone());
                let mut habit_fired: std::collections::HashSet<String> = std::collections::HashSet::new();
                let mut tick = tokio::time::interval(std::time::Duration::from_secs(30));
                loop {
                    tick.tick().await;
                    let outcomes = match repo::reminders::dispatch_due(
                        &sched_pool,
                        &backend,
                        chrono::Utc::now(),
                    )
                    .await
                    {
                        Ok(outcomes) => outcomes,
                        Err(e) => {
                            log::error!("[reminders] dispatch pass failed: {e}");
                            continue;
                        }
                    };
                    for o in outcomes {
                        // In-app Complete/Snooze popover — the reliable action
                        // path across OSes (native buttons are best-effort).
                        // Emitted once per fire time, on the first attempt,
                        // regardless of native delivery.
                        if !o.first_attempt {
                            continue;
                        }
                        let _ = sched_handle.emit(
                            "reminder-fired",
                            serde_json::json!({
                                "taskId": o.reminder.task_id,
                                "reminderId": o.reminder.reminder_id,
                                "title": o.reminder.task_title,
                                // Occurrence key so the in-app toast's Complete
                                // gets the recurring idempotency guard too.
                                "occurrence": o.reminder.occurrence,
                            }),
                        );
                        sched_bus.emit(events::DomainEvent::ReminderFired {
                            task_id: o.reminder.task_id.clone(),
                            reminder_id: o.reminder.reminder_id.clone(),
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
                        log::error!("subscription refresh failed: {e}");
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
                        log::error!("overdue penalty pass failed: {e}");
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
                            log::error!("backup config read failed: {e}");
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
                        log::error!("auto-backup failed: {e}");
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
                    Err(e) => log::error!("API server failed to start: {e}"),
                }
            }

            // Register the quick-add global shortcut from settings.
            {
                use tauri_plugin_global_shortcut::GlobalShortcutExt;
                let accel = tauri::async_runtime::block_on(desktop::config(&pool))
                    .map(|c| c.quick_add_hotkey)
                    .unwrap_or_else(|_| desktop::DEFAULT_HOTKEY.to_string());
                if let Err(e) = app.global_shortcut().register(accel.as_str()) {
                    log::error!("global shortcut register failed: {e}");
                }
            }

            // System tray: quick actions + a Today-count tooltip.
            {
                use tauri::menu::{Menu, MenuItem};
                use tauri::tray::TrayIconBuilder;
                let quick = MenuItem::with_id(app, "quick_add", "Quick add", true, None::<&str>)?;
                let today = MenuItem::with_id(app, "open_today", "Open Today", true, None::<&str>)?;
                let focus = MenuItem::with_id(app, "start_focus", "Start focus", true, None::<&str>)?;
                let show = MenuItem::with_id(app, "show_hide", "Show / Hide", true, None::<&str>)?;
                let quit = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
                let menu = Menu::with_items(app, &[&quick, &today, &focus, &show, &quit])?;
                TrayIconBuilder::with_id("main")
                    .icon(app.default_window_icon().cloned().unwrap())
                    .tooltip("Toodoo")
                    .menu(&menu)
                    // Left-click restores the (possibly tray-hidden) window;
                    // the menu stays on right-click.
                    .show_menu_on_left_click(false)
                    .on_tray_icon_event(|tray, event| {
                        use tauri::tray::{MouseButton, MouseButtonState, TrayIconEvent};
                        if let TrayIconEvent::Click {
                            button: MouseButton::Left,
                            button_state: MouseButtonState::Up,
                            ..
                        } = event
                        {
                            if let Some(w) = tray.app_handle().get_webview_window("main") {
                                let _ = w.unminimize();
                                let _ = w.show();
                                let _ = w.set_focus();
                            }
                        }
                    })
                    .on_menu_event(|app, event| match event.id.as_ref() {
                        "quick_add" => {
                            desktop::request_popout(app, "quickadd", "win=quickadd", "Quick add", 520.0, 180.0, desktop::PopoutStyle::Decorated);
                        }
                        "start_focus" => {
                            open_focus_popout(app);
                        }
                        "open_today" => {
                            if let Some(w) = app.get_webview_window("main") {
                                let _ = w.show();
                                let _ = w.set_focus();
                                let _ = w.emit("open-view", "today");
                            }
                        }
                        "show_hide" => {
                            if let Some(w) = app.get_webview_window("main") {
                                if w.is_visible().unwrap_or(true) {
                                    let _ = w.hide();
                                } else {
                                    let _ = w.show();
                                    let _ = w.set_focus();
                                }
                            }
                        }
                        "quit" => app.exit(0),
                        _ => {}
                    })
                    .build(app)?;
            }

            // Tray Today count: computed once now, then event-driven (above).
            // A slow fallback catches the date rolling over at midnight without a
            // task mutation — not a tight poll.
            let tray_pool = pool.clone();
            let tray_handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                desktop::refresh_tray_tooltip(&tray_handle, &tray_pool).await;
                let mut tick = tokio::time::interval(std::time::Duration::from_secs(600));
                tick.tick().await; // consume the immediate first tick
                loop {
                    tick.tick().await;
                    desktop::refresh_tray_tooltip(&tray_handle, &tray_pool).await;
                }
            });

            app.manage(AppState {
                pool,
                bus,
                data_dir,
                api_token,
                api_server,
                close_to_tray: std::sync::atomic::AtomicBool::new(boot_close_to_tray),
                tray_notice_done: std::sync::atomic::AtomicBool::new(boot_notice_done),
            });
            Ok(())
        })
        // Close-to-tray: intercept the main window's X. Hidden, the scheduler
        // and reminders keep running; tray Quit (`app.exit`) never routes
        // through CloseRequested, so it always exits fully.
        .on_window_event(|window, event| {
            if window.label() != "main" {
                return;
            }
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                use std::sync::atomic::Ordering;
                let app = window.app_handle();
                let Some(state) = app.try_state::<AppState>() else { return };
                let decision = desktop::close_decision(
                    state.close_to_tray.load(Ordering::Relaxed),
                    !state.tray_notice_done.load(Ordering::Relaxed),
                );
                match decision {
                    desktop::CloseDecision::HideToTray { first_time_notice } => {
                        api.prevent_close();
                        let _ = window.hide();
                        log::info!("[tray] close intercepted — hidden to tray (notice={first_time_notice})");
                        if first_time_notice {
                            state.tray_notice_done.store(true, Ordering::Relaxed);
                            show_tray_notice(&app.clone());
                        }
                    }
                    desktop::CloseDecision::Exit => {
                        // Explicit exit also tears down any pop-out pills.
                        log::info!("[tray] close-to-tray off — exiting");
                        app.exit(0);
                    }
                }
            }
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
            set_wont_do,
            duplicate_task,
            check_item_to_subtask,
            subtask_to_check_item,
            save_task_as_template,
            list_comments,
            add_comment,
            delete_comment,
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
            search_all,
            recent_searches,
            add_recent_search,
            list_saved_searches,
            create_saved_search,
            delete_saved_search,
            list_check_items,
            add_check_item,
            set_check_item,
            delete_check_item,
            list_tags,
            create_tag,
            update_tag,
            delete_tag,
            merge_tags,
            set_tag_parent,
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
            set_backup_config,
            desktop_config,
            set_quick_add_hotkey,
            set_notif_actions,
            set_notif_snooze_min,
            set_simple_popouts,
            set_popout_style,
            set_autostart,
            set_close_to_tray,
            set_start_minimized,
            log_window_error,
            open_logs_folder,
            send_test_notification,
            seed_sample_data,
            show_main_window,
            open_quick_add_window,
            open_focus_window,
            open_sticky_window,
            today_count
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
