use serde::{Deserialize, Serialize};
use sqlx::{QueryBuilder, Sqlite, SqliteConnection, SqlitePool};
use std::collections::HashMap;

use crate::error::{RepoError, Result};
use crate::events::{DomainEvent, EventBus};

use super::recurrence::{next_occurrence, NextInput, RepeatFrom};
use super::{activity, append_changelog, new_id, now, ChangeOp};

/// Gap between adjacent manual sort positions; renumber when a gap closes.
const SORT_STEP: i64 = 1024;

#[derive(Debug, Clone, Serialize, sqlx::FromRow)]
#[serde(rename_all = "camelCase")]
pub struct Task {
    pub id: String,
    pub project_id: String,
    pub section_id: Option<String>,
    pub parent_id: Option<String>,
    pub title: String,
    pub content_rich: Option<String>,
    pub content_plain: Option<String>,
    pub kind: String,
    pub status: String,
    pub priority: i64,
    pub start_at: Option<String>,
    pub due_at: Option<String>,
    pub is_all_day: bool,
    pub duration_min: Option<i64>,
    pub time_zone: Option<String>,
    pub rrule: Option<String>,
    pub repeat_from: Option<String>,
    pub pinned: bool,
    pub est_pomos: Option<i64>,
    pub est_duration_min: Option<i64>,
    pub sort_order: Option<i64>,
    pub completed_at: Option<String>,
    pub created_at: String,
    pub updated_at: String,
    #[sqlx(skip)]
    pub tag_ids: Vec<String>,
}

const COLUMNS: &str = "id, project_id, section_id, parent_id, title, content_rich, content_plain, \
     kind, status, priority, start_at, due_at, is_all_day, duration_min, time_zone, rrule, \
     repeat_from, pinned, est_pomos, est_duration_min, \
     CAST(json_extract(sort_orders_json, '$.project') AS INTEGER) AS sort_order, \
     completed_at, created_at, updated_at";

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NewTask {
    pub project_id: String,
    #[serde(default)]
    pub parent_id: Option<String>,
    pub title: String,
    #[serde(default)]
    pub priority: Option<i64>,
    #[serde(default)]
    pub start_at: Option<String>,
    #[serde(default)]
    pub due_at: Option<String>,
    #[serde(default)]
    pub is_all_day: Option<bool>,
    #[serde(default)]
    pub duration_min: Option<i64>,
    #[serde(default)]
    pub time_zone: Option<String>,
    #[serde(default)]
    pub rrule: Option<String>,
    #[serde(default)]
    pub repeat_from: Option<String>,
    /// TASK (default), CHECKLIST, or NOTE.
    #[serde(default)]
    pub kind: Option<String>,
}

/// Patch semantics: outer `None` = leave unchanged; `Some(None)` = clear.
#[derive(Debug, Clone, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TaskPatch {
    #[serde(default)]
    pub title: Option<String>,
    #[serde(default)]
    pub content_rich: Option<Option<String>>,
    #[serde(default)]
    pub content_plain: Option<Option<String>>,
    #[serde(default)]
    pub priority: Option<i64>,
    #[serde(default)]
    pub start_at: Option<Option<String>>,
    #[serde(default)]
    pub due_at: Option<Option<String>>,
    #[serde(default)]
    pub is_all_day: Option<bool>,
    #[serde(default)]
    pub section_id: Option<Option<String>>,
    #[serde(default)]
    pub duration_min: Option<Option<i64>>,
    #[serde(default)]
    pub time_zone: Option<Option<String>>,
    #[serde(default)]
    pub rrule: Option<Option<String>>,
    #[serde(default)]
    pub repeat_from: Option<Option<String>>,
    #[serde(default)]
    pub est_pomos: Option<Option<i64>>,
    #[serde(default)]
    pub est_duration_min: Option<Option<i64>>,
}

#[derive(Debug, Clone, Copy, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum SmartView {
    Today,
    Tomorrow,
    Next7Days,
    All,
    Completed,
    Trash,
}

async fn attach_tags(pool: &SqlitePool, tasks: &mut [Task]) -> Result<()> {
    if tasks.is_empty() {
        return Ok(());
    }
    let rows: Vec<(String, String)> = sqlx::query_as(
        "SELECT task_id, tag_id FROM task_tags WHERE deleted_at IS NULL",
    )
    .fetch_all(pool)
    .await?;
    let mut by_task: HashMap<String, Vec<String>> = HashMap::new();
    for (task_id, tag_id) in rows {
        by_task.entry(task_id).or_default().push(tag_id);
    }
    for task in tasks.iter_mut() {
        if let Some(tags) = by_task.remove(&task.id) {
            task.tag_ids = tags;
        }
    }
    Ok(())
}

pub async fn get_task(pool: &SqlitePool, id: &str) -> Result<Task> {
    let mut task: Task = sqlx::query_as(&format!(
        "SELECT {COLUMNS} FROM tasks WHERE id = ? AND deleted_at IS NULL"
    ))
    .bind(id)
    .fetch_optional(pool)
    .await?
    .ok_or_else(|| RepoError::NotFound(format!("task {id}")))?;
    attach_tags(pool, std::slice::from_mut(&mut task)).await?;
    Ok(task)
}

pub async fn create_task(pool: &SqlitePool, bus: &EventBus, input: NewTask) -> Result<Task> {
    if let Some(parent_id) = &input.parent_id {
        let depth = subtree_depth_to_root(pool, parent_id).await?;
        if depth >= 4 {
            return Err(RepoError::Invalid("subtasks are limited to 4 levels".into()));
        }
    }
    let id = new_id();
    let ts = now();

    let mut tx = pool.begin().await?;
    let next_order: i64 = sqlx::query_scalar(
        "SELECT COALESCE(MAX(CAST(json_extract(sort_orders_json, '$.project') AS INTEGER)), 0) + ?
         FROM tasks WHERE project_id = ? AND deleted_at IS NULL",
    )
    .bind(SORT_STEP)
    .bind(&input.project_id)
    .fetch_one(&mut *tx)
    .await?;

    let kind = match input.kind.as_deref() {
        Some("NOTE") => "NOTE",
        Some("CHECKLIST") => "CHECKLIST",
        _ => "TASK",
    };
    sqlx::query(
        "INSERT INTO tasks (id, project_id, parent_id, title, kind, status, priority,
                            start_at, due_at, is_all_day, duration_min, time_zone, rrule,
                            repeat_from, pinned, sort_orders_json, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, 'ACTIVE', ?, ?, ?, ?, ?, ?, ?, ?, 0,
                 json_object('project', ?), ?, ?)",
    )
    .bind(&id)
    .bind(&input.project_id)
    .bind(&input.parent_id)
    .bind(&input.title)
    .bind(kind)
    .bind(input.priority.unwrap_or(0))
    .bind(&input.start_at)
    .bind(&input.due_at)
    .bind(input.is_all_day.unwrap_or(true))
    .bind(input.duration_min)
    .bind(&input.time_zone)
    .bind(&input.rrule)
    .bind(&input.repeat_from)
    .bind(next_order)
    .bind(&ts)
    .bind(&ts)
    .execute(&mut *tx)
    .await?;

    let payload = serde_json::json!({ "title": input.title, "projectId": input.project_id });
    append_changelog(&mut tx, "task", &id, ChangeOp::Insert, &payload).await?;
    activity::log(&mut tx, "task", &id, "created", &serde_json::json!({ "title": input.title }))
        .await?;
    tx.commit().await?;

    bus.emit(DomainEvent::TaskCreated { id: id.clone() });
    get_task(pool, &id).await
}

async fn subtree_depth_to_root(pool: &SqlitePool, id: &str) -> Result<i64> {
    let depth: i64 = sqlx::query_scalar(
        "WITH RECURSIVE up(id, parent_id, depth) AS (
             SELECT id, parent_id, 1 FROM tasks WHERE id = ? AND deleted_at IS NULL
             UNION ALL
             SELECT t.id, t.parent_id, up.depth + 1
             FROM tasks t JOIN up ON t.id = up.parent_id
             WHERE t.deleted_at IS NULL
         )
         SELECT COALESCE(MAX(depth), 0) FROM up",
    )
    .bind(id)
    .fetch_one(pool)
    .await?;
    Ok(depth)
}

pub async fn update_task(pool: &SqlitePool, bus: &EventBus, id: &str, patch: TaskPatch) -> Result<Task> {
    let ts = now();
    let mut qb: QueryBuilder<Sqlite> = QueryBuilder::new("UPDATE tasks SET updated_at = ");
    qb.push_bind(&ts);
    if let Some(title) = &patch.title {
        qb.push(", title = ").push_bind(title);
    }
    if let Some(v) = &patch.content_rich {
        qb.push(", content_rich = ").push_bind(v.clone());
    }
    if let Some(v) = &patch.content_plain {
        qb.push(", content_plain = ").push_bind(v.clone());
    }
    if let Some(priority) = patch.priority {
        if ![0, 1, 3, 5].contains(&priority) {
            return Err(RepoError::Invalid(format!("invalid priority {priority}")));
        }
        qb.push(", priority = ").push_bind(priority);
    }
    if let Some(v) = &patch.start_at {
        qb.push(", start_at = ").push_bind(v.clone());
    }
    if let Some(v) = &patch.due_at {
        qb.push(", due_at = ").push_bind(v.clone());
    }
    if let Some(all_day) = patch.is_all_day {
        qb.push(", is_all_day = ").push_bind(all_day);
    }
    if let Some(v) = &patch.section_id {
        qb.push(", section_id = ").push_bind(v.clone());
    }
    if let Some(v) = &patch.duration_min {
        qb.push(", duration_min = ").push_bind(*v);
    }
    if let Some(v) = &patch.time_zone {
        qb.push(", time_zone = ").push_bind(v.clone());
    }
    if let Some(v) = &patch.rrule {
        qb.push(", rrule = ").push_bind(v.clone());
    }
    if let Some(v) = &patch.repeat_from {
        qb.push(", repeat_from = ").push_bind(v.clone());
    }
    if let Some(v) = &patch.est_pomos {
        qb.push(", est_pomos = ").push_bind(*v);
    }
    if let Some(v) = &patch.est_duration_min {
        qb.push(", est_duration_min = ").push_bind(*v);
    }
    qb.push(" WHERE id = ").push_bind(id);
    qb.push(" AND deleted_at IS NULL");

    let mut tx = pool.begin().await?;
    let res = qb.build().execute(&mut *tx).await?;
    if res.rows_affected() == 0 {
        return Err(RepoError::NotFound(format!("task {id}")));
    }
    let payload = serde_json::json!({ "patch": "update" });
    append_changelog(&mut tx, "task", id, ChangeOp::Update, &payload).await?;
    activity::log(&mut tx, "task", id, "edited", &serde_json::json!({})).await?;
    tx.commit().await?;

    bus.emit(DomainEvent::TaskUpdated { id: id.to_string() });
    get_task(pool, id).await
}

/// Collect `id` plus every live descendant of `id`, deepest last.
async fn subtree_ids(pool: &SqlitePool, id: &str) -> Result<Vec<String>> {
    Ok(sqlx::query_scalar(
        "WITH RECURSIVE sub(id) AS (
             SELECT id FROM tasks WHERE id = ? AND deleted_at IS NULL
             UNION ALL
             SELECT t.id FROM tasks t JOIN sub s ON t.parent_id = s.id
             WHERE t.deleted_at IS NULL
         )
         SELECT id FROM sub",
    )
    .bind(id)
    .fetch_all(pool)
    .await?)
}

/// Record one closed occurrence in `task_completions` — the durable per-instance
/// history that recurrence end-counting (`COUNT=`) and the Phase 9 stats engine
/// read. Written inside the caller's transaction.
async fn record_completion(
    conn: &mut SqliteConnection,
    task_id: &str,
    occurrence_at: Option<&str>,
    completed_at: &str,
    status: &str,
) -> Result<()> {
    sqlx::query(
        "INSERT INTO task_completions
             (id, task_id, occurrence_at, completed_at, status, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)",
    )
    .bind(new_id())
    .bind(task_id)
    .bind(occurrence_at)
    .bind(completed_at)
    .bind(status)
    .bind(completed_at)
    .bind(completed_at)
    .execute(conn)
    .await?;
    Ok(())
}

/// Completing a parent completes all open descendants (docs/decisions.md).
/// Reopening a parent does NOT reopen children.
///
/// A recurring task (one with an `rrule` and a start/due anchor) instead
/// *advances in place*: completing the current occurrence records it in
/// `task_completions`, rolls the task's dates to the next occurrence, and leaves
/// it ACTIVE — until an end condition (`COUNT=`/`UNTIL=`) is reached, at which
/// point it completes for real. Recurrence acts on the task itself, not its
/// subtree (docs/decisions.md).
pub async fn complete_task(pool: &SqlitePool, bus: &EventBus, id: &str) -> Result<Vec<String>> {
    let top = get_task(pool, id).await?;
    let is_recurring = top.rrule.as_deref().is_some_and(|r| !r.trim().is_empty())
        && (top.due_at.is_some() || top.start_at.is_some())
        && top.status == "ACTIVE";
    if is_recurring {
        return advance_recurrence(pool, bus, &top).await;
    }

    let ids = subtree_ids(pool, id).await?;
    if ids.is_empty() {
        return Err(RepoError::NotFound(format!("task {id}")));
    }
    let ts = now();
    let mut tx = pool.begin().await?;
    let mut completed = Vec::new();
    for task_id in &ids {
        let res = sqlx::query(
            "UPDATE tasks SET status = 'COMPLETED', completed_at = ?, updated_at = ?
             WHERE id = ? AND status = 'ACTIVE' AND deleted_at IS NULL",
        )
        .bind(&ts)
        .bind(&ts)
        .bind(task_id)
        .execute(&mut *tx)
        .await?;
        if res.rows_affected() > 0 {
            append_changelog(
                &mut tx,
                "task",
                task_id,
                ChangeOp::Update,
                &serde_json::json!({ "status": "COMPLETED" }),
            )
            .await?;
            activity::log(&mut tx, "task", task_id, "completed", &serde_json::json!({})).await?;
            completed.push(task_id.clone());
        }
    }
    tx.commit().await?;

    if !completed.is_empty() {
        bus.emit(DomainEvent::TaskCompleted { ids: completed.clone() });
    }
    Ok(completed)
}

/// Close the current occurrence of a recurring task and roll it forward. Returns
/// the ids that ended up COMPLETED — empty while the series continues, `[id]`
/// once it ends.
async fn advance_recurrence(pool: &SqlitePool, bus: &EventBus, top: &Task) -> Result<Vec<String>> {
    let ts = now();
    let occurrence = top.due_at.as_deref().or(top.start_at.as_deref());
    let mut tx = pool.begin().await?;

    record_completion(&mut tx, &top.id, occurrence, &ts, "COMPLETED").await?;

    // Occurrences closed so far (including the one just recorded) bound `COUNT=`.
    let completed_so_far: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM task_completions
         WHERE task_id = ? AND status = 'COMPLETED' AND deleted_at IS NULL",
    )
    .bind(&top.id)
    .fetch_one(&mut *tx)
    .await?;

    let next = next_occurrence(NextInput {
        rrule: top.rrule.as_deref().unwrap_or_default(),
        start_at: top.start_at.as_deref(),
        due_at: top.due_at.as_deref(),
        is_all_day: top.is_all_day,
        repeat_from: RepeatFrom::parse(top.repeat_from.as_deref()),
        completed_at: &ts,
        tz_name: top.time_zone.as_deref(),
        completed_so_far: completed_so_far.max(0) as u32,
    })?;

    let ended = match &next {
        Some(occ) => {
            sqlx::query(
                "UPDATE tasks SET start_at = ?, due_at = ?, completed_at = NULL, updated_at = ?
                 WHERE id = ?",
            )
            .bind(&occ.start_at)
            .bind(&occ.due_at)
            .bind(&ts)
            .bind(&top.id)
            .execute(&mut *tx)
            .await?;
            append_changelog(
                &mut tx,
                "task",
                &top.id,
                ChangeOp::Update,
                &serde_json::json!({ "recurrence": "advanced", "dueAt": occ.due_at }),
            )
            .await?;
            activity::log(
                &mut tx,
                "task",
                &top.id,
                "recurrence_advanced",
                &serde_json::json!({ "dueAt": occ.due_at, "startAt": occ.start_at }),
            )
            .await?;
            false
        }
        None => {
            sqlx::query(
                "UPDATE tasks SET status = 'COMPLETED', completed_at = ?, updated_at = ?
                 WHERE id = ?",
            )
            .bind(&ts)
            .bind(&ts)
            .bind(&top.id)
            .execute(&mut *tx)
            .await?;
            append_changelog(
                &mut tx,
                "task",
                &top.id,
                ChangeOp::Update,
                &serde_json::json!({ "status": "COMPLETED", "recurrence": "ended" }),
            )
            .await?;
            activity::log(
                &mut tx,
                "task",
                &top.id,
                "completed",
                &serde_json::json!({ "recurrence": "ended" }),
            )
            .await?;
            true
        }
    };
    tx.commit().await?;

    if ended {
        bus.emit(DomainEvent::TaskCompleted { ids: vec![top.id.clone()] });
        Ok(vec![top.id.clone()])
    } else {
        bus.emit(DomainEvent::TaskUpdated { id: top.id.clone() });
        Ok(Vec::new())
    }
}

pub async fn reopen_task(pool: &SqlitePool, bus: &EventBus, id: &str) -> Result<()> {
    set_single_status(pool, bus, id, "ACTIVE", &["COMPLETED", "WONT_DO"], true).await
}

/// Convert a task between TASK, CHECKLIST, and NOTE kinds (note↔task).
pub async fn set_task_kind(pool: &SqlitePool, bus: &EventBus, id: &str, kind: &str) -> Result<()> {
    if !["TASK", "CHECKLIST", "NOTE"].contains(&kind) {
        return Err(RepoError::Invalid(format!("bad task kind {kind:?}")));
    }
    let ts = now();
    let mut tx = pool.begin().await?;
    let res = sqlx::query("UPDATE tasks SET kind = ?, updated_at = ? WHERE id = ? AND deleted_at IS NULL")
        .bind(kind)
        .bind(&ts)
        .bind(id)
        .execute(&mut *tx)
        .await?;
    if res.rows_affected() == 0 {
        return Err(RepoError::NotFound(format!("task {id}")));
    }
    append_changelog(&mut tx, "task", id, ChangeOp::Update, &serde_json::json!({ "kind": kind })).await?;
    tx.commit().await?;
    bus.emit(DomainEvent::TaskUpdated { id: id.to_string() });
    Ok(())
}

/// Pin / unpin a task. Pinned tasks float to the top of their views.
pub async fn set_pinned(pool: &SqlitePool, bus: &EventBus, id: &str, pinned: bool) -> Result<()> {
    let ts = now();
    let mut tx = pool.begin().await?;
    let res = sqlx::query(
        "UPDATE tasks SET pinned = ?, updated_at = ? WHERE id = ? AND deleted_at IS NULL",
    )
    .bind(pinned)
    .bind(&ts)
    .bind(id)
    .execute(&mut *tx)
    .await?;
    if res.rows_affected() == 0 {
        return Err(RepoError::NotFound(format!("task {id}")));
    }
    append_changelog(&mut tx, "task", id, ChangeOp::Update, &serde_json::json!({ "pinned": pinned }))
        .await?;
    tx.commit().await?;
    bus.emit(DomainEvent::TaskPinned { id: id.to_string() });
    Ok(())
}

pub async fn trash_task(pool: &SqlitePool, bus: &EventBus, id: &str) -> Result<Vec<String>> {
    let ids = subtree_ids(pool, id).await?;
    if ids.is_empty() {
        return Err(RepoError::NotFound(format!("task {id}")));
    }
    let ts = now();
    let mut tx = pool.begin().await?;
    let mut trashed = Vec::new();
    for task_id in &ids {
        let res = sqlx::query(
            "UPDATE tasks SET status = 'TRASHED', updated_at = ?
             WHERE id = ? AND status <> 'TRASHED' AND deleted_at IS NULL",
        )
        .bind(&ts)
        .bind(task_id)
        .execute(&mut *tx)
        .await?;
        if res.rows_affected() > 0 {
            append_changelog(
                &mut tx,
                "task",
                task_id,
                ChangeOp::Update,
                &serde_json::json!({ "status": "TRASHED" }),
            )
            .await?;
            trashed.push(task_id.clone());
        }
    }
    tx.commit().await?;

    if !trashed.is_empty() {
        bus.emit(DomainEvent::TaskTrashed { ids: trashed.clone() });
    }
    Ok(trashed)
}

/// Restore from Trash. If the task's project has been deleted, the task is
/// re-homed to the Inbox (docs/decisions.md). Restored tasks become ACTIVE
/// and detach from a trashed parent.
pub async fn restore_task(pool: &SqlitePool, bus: &EventBus, id: &str) -> Result<Task> {
    let ts = now();
    let mut tx = pool.begin().await?;
    let project_id: Option<String> = sqlx::query_scalar(
        "SELECT project_id FROM tasks WHERE id = ? AND status = 'TRASHED' AND deleted_at IS NULL",
    )
    .bind(id)
    .fetch_optional(&mut *tx)
    .await?;
    let Some(project_id) = project_id else {
        return Err(RepoError::NotFound(format!("trashed task {id}")));
    };
    let project_live: bool = sqlx::query_scalar(
        "SELECT EXISTS(SELECT 1 FROM projects WHERE id = ? AND deleted_at IS NULL)",
    )
    .bind(&project_id)
    .fetch_one(&mut *tx)
    .await?;
    let target_project = if project_live { project_id } else { "inbox".to_string() };

    sqlx::query(
        "UPDATE tasks SET status = 'ACTIVE', project_id = ?, completed_at = NULL,
                          parent_id = CASE WHEN parent_id IN
                              (SELECT id FROM tasks WHERE status = 'TRASHED')
                              THEN NULL ELSE parent_id END,
                          updated_at = ?
         WHERE id = ?",
    )
    .bind(&target_project)
    .bind(&ts)
    .bind(id)
    .execute(&mut *tx)
    .await?;
    append_changelog(
        &mut tx,
        "task",
        id,
        ChangeOp::Update,
        &serde_json::json!({ "status": "ACTIVE", "projectId": target_project }),
    )
    .await?;
    tx.commit().await?;

    bus.emit(DomainEvent::TaskRestored { id: id.to_string() });
    get_task(pool, id).await
}

/// Permanently delete a trashed task (soft-delete the row; subtree included).
pub async fn delete_task_forever(pool: &SqlitePool, bus: &EventBus, id: &str) -> Result<()> {
    let ids = subtree_ids(pool, id).await?;
    if ids.is_empty() {
        return Err(RepoError::NotFound(format!("task {id}")));
    }
    let ts = now();
    let mut tx = pool.begin().await?;
    for task_id in &ids {
        sqlx::query("UPDATE tasks SET deleted_at = ?, updated_at = ? WHERE id = ?")
            .bind(&ts)
            .bind(&ts)
            .bind(task_id)
            .execute(&mut *tx)
            .await?;
        append_changelog(&mut tx, "task", task_id, ChangeOp::Delete, &serde_json::json!({}))
            .await?;
    }
    tx.commit().await?;
    bus.emit(DomainEvent::TaskDeleted { id: id.to_string() });
    Ok(())
}

async fn set_single_status(
    pool: &SqlitePool,
    bus: &EventBus,
    id: &str,
    to: &str,
    from: &[&str],
    clear_completed_at: bool,
) -> Result<()> {
    let ts = now();
    let from_list = from.iter().map(|s| format!("'{s}'")).collect::<Vec<_>>().join(", ");
    let completed_clause = if clear_completed_at { ", completed_at = NULL" } else { "" };
    let mut tx = pool.begin().await?;
    let res = sqlx::query(&format!(
        "UPDATE tasks SET status = ?, updated_at = ?{completed_clause}
         WHERE id = ? AND status IN ({from_list}) AND deleted_at IS NULL"
    ))
    .bind(to)
    .bind(&ts)
    .bind(id)
    .execute(&mut *tx)
    .await?;
    if res.rows_affected() == 0 {
        return Err(RepoError::NotFound(format!("task {id}")));
    }
    append_changelog(&mut tx, "task", id, ChangeOp::Update, &serde_json::json!({ "status": to }))
        .await?;
    tx.commit().await?;
    bus.emit(DomainEvent::TaskUpdated { id: id.to_string() });
    Ok(())
}

pub async fn move_task(pool: &SqlitePool, bus: &EventBus, id: &str, project_id: &str) -> Result<()> {
    let ids = subtree_ids(pool, id).await?;
    if ids.is_empty() {
        return Err(RepoError::NotFound(format!("task {id}")));
    }
    let ts = now();
    let mut tx = pool.begin().await?;
    for task_id in &ids {
        sqlx::query(
            "UPDATE tasks SET project_id = ?, section_id = NULL, updated_at = ? WHERE id = ?",
        )
        .bind(project_id)
        .bind(&ts)
        .bind(task_id)
        .execute(&mut *tx)
        .await?;
        append_changelog(
            &mut tx,
            "task",
            task_id,
            ChangeOp::Update,
            &serde_json::json!({ "projectId": project_id }),
        )
        .await?;
    }
    // Detach from a parent left behind in another project.
    sqlx::query(
        "UPDATE tasks SET parent_id = NULL, updated_at = ? WHERE id = ? AND parent_id IS NOT NULL
         AND parent_id NOT IN (SELECT id FROM tasks WHERE project_id = ?)",
    )
    .bind(&ts)
    .bind(id)
    .bind(project_id)
    .execute(&mut *tx)
    .await?;
    tx.commit().await?;
    bus.emit(DomainEvent::TaskMoved { id: id.to_string() });
    Ok(())
}

/// Manual drag reorder within a project. `after_id = None` moves to the top.
/// Gap-based ordering: place at the midpoint of the neighbors; renumber the
/// whole project when the gap is exhausted.
pub async fn reorder_task(
    pool: &SqlitePool,
    bus: &EventBus,
    id: &str,
    after_id: Option<&str>,
) -> Result<()> {
    let task = get_task(pool, id).await?;
    let orders: Vec<(String, i64)> = sqlx::query_as(
        "SELECT id, CAST(COALESCE(json_extract(sort_orders_json, '$.project'), 0) AS INTEGER)
         FROM tasks
         WHERE project_id = ? AND deleted_at IS NULL AND status <> 'TRASHED' AND id <> ?
         ORDER BY 2, created_at",
    )
    .bind(&task.project_id)
    .bind(id)
    .fetch_all(pool)
    .await?;

    let insert_index = match after_id {
        None => 0,
        Some(after) => {
            let idx = orders
                .iter()
                .position(|(other, _)| other == after)
                .ok_or_else(|| RepoError::NotFound(format!("task {after}")))?;
            idx + 1
        }
    };
    let prev = insert_index.checked_sub(1).and_then(|i| orders.get(i)).map(|(_, o)| *o);
    let next = orders.get(insert_index).map(|(_, o)| *o);

    let new_order = match (prev, next) {
        (None, None) => SORT_STEP,
        (None, Some(next)) => next - SORT_STEP,
        (Some(prev), None) => prev + SORT_STEP,
        (Some(prev), Some(next)) if next - prev > 1 => prev + (next - prev) / 2,
        _ => {
            renumber_project(pool, &task.project_id, id, insert_index, &orders).await?;
            bus.emit(DomainEvent::TaskMoved { id: id.to_string() });
            return Ok(());
        }
    };

    let ts = now();
    let mut tx = pool.begin().await?;
    sqlx::query(
        "UPDATE tasks SET sort_orders_json = json_set(COALESCE(sort_orders_json, '{}'),
                                                      '$.project', ?),
                          updated_at = ?
         WHERE id = ?",
    )
    .bind(new_order)
    .bind(&ts)
    .bind(id)
    .execute(&mut *tx)
    .await?;
    append_changelog(
        &mut tx,
        "task",
        id,
        ChangeOp::Update,
        &serde_json::json!({ "sortOrder": new_order }),
    )
    .await?;
    tx.commit().await?;
    bus.emit(DomainEvent::TaskMoved { id: id.to_string() });
    Ok(())
}

async fn renumber_project(
    pool: &SqlitePool,
    project_id: &str,
    moved_id: &str,
    insert_index: usize,
    others: &[(String, i64)],
) -> Result<()> {
    let ts = now();
    let mut sequence: Vec<&str> = others.iter().map(|(other, _)| other.as_str()).collect();
    sequence.insert(insert_index.min(sequence.len()), moved_id);

    let mut tx = pool.begin().await?;
    for (position, task_id) in sequence.iter().enumerate() {
        sqlx::query(
            "UPDATE tasks SET sort_orders_json = json_set(COALESCE(sort_orders_json, '{}'),
                                                          '$.project', ?),
                              updated_at = ?
             WHERE id = ?",
        )
        .bind(((position as i64) + 1) * SORT_STEP)
        .bind(&ts)
        .bind(task_id)
        .execute(&mut *tx)
        .await?;
    }
    append_changelog(
        &mut tx,
        "project",
        project_id,
        ChangeOp::Update,
        &serde_json::json!({ "renumbered": true }),
    )
    .await?;
    tx.commit().await?;
    Ok(())
}

pub async fn list_project_tasks(pool: &SqlitePool, project_id: &str) -> Result<Vec<Task>> {
    let mut tasks: Vec<Task> = sqlx::query_as(&format!(
        "SELECT {COLUMNS} FROM tasks
         WHERE project_id = ? AND deleted_at IS NULL AND status <> 'TRASHED'
         ORDER BY CAST(COALESCE(json_extract(sort_orders_json, '$.project'), 0) AS INTEGER),
                  created_at"
    ))
    .bind(project_id)
    .fetch_all(pool)
    .await?;
    attach_tags(pool, &mut tasks).await?;
    Ok(tasks)
}

/// Smart-list queries. `today` is the caller's local date (YYYY-MM-DD) and
/// `tz_offset_min` the caller's UTC offset, so the windowing is deterministic
/// in tests and correct for the user's timezone. The "effective date" of a
/// task is its due date if set, else its start date; all-day tasks compare by
/// stored calendar date, timed tasks by local date. Today and Next 7 Days
/// include overdue tasks (docs/decisions.md).
pub async fn list_smart(
    pool: &SqlitePool,
    view: SmartView,
    today: &str,
    tz_offset_min: i32,
) -> Result<Vec<Task>> {
    let modifier = format!("{tz_offset_min} minutes");
    let eff = "CASE WHEN COALESCE(due_at, start_at) IS NULL THEN NULL
                    WHEN is_all_day = 1 THEN date(COALESCE(due_at, start_at))
                    ELSE date(datetime(COALESCE(due_at, start_at), ?1)) END";

    let (where_clause, order) = match view {
        SmartView::Today => (
            format!("status = 'ACTIVE' AND {eff} <= ?2"),
            "ORDER BY COALESCE(due_at, start_at), priority DESC",
        ),
        SmartView::Tomorrow => (
            format!("status = 'ACTIVE' AND {eff} = date(?2, '+1 day')"),
            "ORDER BY COALESCE(due_at, start_at), priority DESC",
        ),
        SmartView::Next7Days => (
            format!("status = 'ACTIVE' AND {eff} <= date(?2, '+6 day')"),
            "ORDER BY COALESCE(due_at, start_at), priority DESC",
        ),
        SmartView::All => (
            "status = 'ACTIVE'".to_string(),
            "ORDER BY created_at DESC",
        ),
        SmartView::Completed => (
            "status = 'COMPLETED'".to_string(),
            "ORDER BY completed_at DESC",
        ),
        SmartView::Trash => (
            "status = 'TRASHED'".to_string(),
            "ORDER BY updated_at DESC",
        ),
    };

    let sql = format!(
        "SELECT {COLUMNS} FROM tasks WHERE deleted_at IS NULL AND kind <> 'NOTE' AND {where_clause} {order}"
    );
    let mut tasks: Vec<Task> = sqlx::query_as(&sql)
        .bind(&modifier)
        .bind(today)
        .fetch_all(pool)
        .await?;
    attach_tags(pool, &mut tasks).await?;
    Ok(tasks)
}

/// Candidate tasks for custom-filter / matrix evaluation: rows whose status is
/// in `statuses` (TRASHED and soft-deleted are always excluded), tags attached.
pub async fn list_for_filter(pool: &SqlitePool, statuses: &[&str]) -> Result<Vec<Task>> {
    let placeholders = statuses.iter().map(|_| "?").collect::<Vec<_>>().join(", ");
    let sql = format!(
        "SELECT {COLUMNS} FROM tasks
         WHERE deleted_at IS NULL AND status IN ({placeholders})
         ORDER BY CAST(COALESCE(json_extract(sort_orders_json, '$.project'), 0) AS INTEGER),
                  created_at"
    );
    let mut q = sqlx::query_as::<_, Task>(&sql);
    for status in statuses {
        q = q.bind(*status);
    }
    let mut tasks = q.fetch_all(pool).await?;
    attach_tags(pool, &mut tasks).await?;
    Ok(tasks)
}

/// Every live (non-trashed) task carrying the tag — the "filter by tag" view.
pub async fn list_tag_tasks(pool: &SqlitePool, tag_id: &str) -> Result<Vec<Task>> {
    let mut tasks: Vec<Task> = sqlx::query_as(&format!(
        "SELECT {COLUMNS} FROM tasks
         WHERE deleted_at IS NULL AND status <> 'TRASHED'
           AND id IN (SELECT task_id FROM task_tags
                      WHERE tag_id = ? AND deleted_at IS NULL)
         ORDER BY status, CAST(COALESCE(json_extract(sort_orders_json, '$.project'), 0) AS INTEGER),
                  created_at"
    ))
    .bind(tag_id)
    .fetch_all(pool)
    .await?;
    attach_tags(pool, &mut tasks).await?;
    Ok(tasks)
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SmartCounts {
    pub today: i64,
    pub tomorrow: i64,
    pub next7: i64,
    pub inbox: i64,
}

pub async fn smart_counts(pool: &SqlitePool, today: &str, tz_offset_min: i32) -> Result<SmartCounts> {
    let today_n = list_smart(pool, SmartView::Today, today, tz_offset_min).await?.len() as i64;
    let tomorrow_n = list_smart(pool, SmartView::Tomorrow, today, tz_offset_min).await?.len() as i64;
    let next7_n = list_smart(pool, SmartView::Next7Days, today, tz_offset_min).await?.len() as i64;
    let inbox_n: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM tasks WHERE project_id = 'inbox' AND status = 'ACTIVE'
         AND kind <> 'NOTE' AND deleted_at IS NULL",
    )
    .fetch_one(pool)
    .await?;
    Ok(SmartCounts { today: today_n, tomorrow: tomorrow_n, next7: next7_n, inbox: inbox_n })
}

#[cfg(test)]
pub(crate) mod tests {
    use super::*;
    use crate::repo::db::connect_in_memory;

    pub(crate) async fn setup() -> (SqlitePool, EventBus) {
        (connect_in_memory().await.unwrap(), EventBus::new())
    }

    pub(crate) fn quick(project: &str, title: &str) -> NewTask {
        NewTask {
            project_id: project.into(),
            parent_id: None,
            title: title.into(),
            priority: None,
            start_at: None,
            due_at: None,
            is_all_day: None,
            duration_min: None,
            time_zone: None,
            rrule: None,
            repeat_from: None,
            kind: None,
        }
    }

    fn dated(project: &str, title: &str, due: &str, all_day: bool) -> NewTask {
        NewTask {
            due_at: Some(due.into()),
            is_all_day: Some(all_day),
            ..quick(project, title)
        }
    }

    async fn child_of(pool: &SqlitePool, bus: &EventBus, parent: &str, title: &str) -> Task {
        create_task(
            pool,
            bus,
            NewTask { parent_id: Some(parent.into()), ..quick("inbox", title) },
        )
        .await
        .unwrap()
    }

    // ---- CRUD basics -------------------------------------------------------

    #[tokio::test]
    async fn create_update_round_trip() {
        let (pool, bus) = setup().await;
        let t = create_task(&pool, &bus, quick("inbox", "Buy milk")).await.unwrap();
        assert_eq!(t.status, "ACTIVE");
        assert_eq!(t.priority, 0);

        let patch = TaskPatch {
            title: Some("Buy oat milk".into()),
            priority: Some(5),
            due_at: Some(Some("2026-07-20T00:00:00.000Z".into())),
            ..Default::default()
        };
        let t = update_task(&pool, &bus, &t.id, patch).await.unwrap();
        assert_eq!(t.title, "Buy oat milk");
        assert_eq!(t.priority, 5);
        assert_eq!(t.due_at.as_deref(), Some("2026-07-20T00:00:00.000Z"));

        // Clearing a date via Some(None).
        let patch = TaskPatch { due_at: Some(None), ..Default::default() };
        let t = update_task(&pool, &bus, &t.id, patch).await.unwrap();
        assert_eq!(t.due_at, None);
    }

    #[tokio::test]
    async fn invalid_priority_rejected() {
        let (pool, bus) = setup().await;
        let t = create_task(&pool, &bus, quick("inbox", "x")).await.unwrap();
        let patch = TaskPatch { priority: Some(2), ..Default::default() };
        assert!(matches!(
            update_task(&pool, &bus, &t.id, patch).await,
            Err(RepoError::Invalid(_))
        ));
    }

    // ---- Completion cascade ------------------------------------------------

    #[tokio::test]
    async fn completing_parent_completes_three_level_subtree() {
        let (pool, bus) = setup().await;
        let root = create_task(&pool, &bus, quick("inbox", "root")).await.unwrap();
        let mid = child_of(&pool, &bus, &root.id, "mid").await;
        let leaf = child_of(&pool, &bus, &mid.id, "leaf").await;

        let completed = complete_task(&pool, &bus, &root.id).await.unwrap();
        assert_eq!(completed.len(), 3);
        for id in [&root.id, &mid.id, &leaf.id] {
            let t = get_task(&pool, id).await.unwrap();
            assert_eq!(t.status, "COMPLETED", "task {id} should be completed");
            assert!(t.completed_at.is_some());
        }

        // One changelog row per mutated task.
        let n: i64 = sqlx::query_scalar(
            "SELECT COUNT(*) FROM changelog WHERE entity_kind = 'task'
             AND json_extract(payload_json, '$.status') = 'COMPLETED'",
        )
        .fetch_one(&pool)
        .await
        .unwrap();
        assert_eq!(n, 3);
    }

    #[tokio::test]
    async fn completing_mid_level_only_cascades_downward() {
        let (pool, bus) = setup().await;
        let root = create_task(&pool, &bus, quick("inbox", "root")).await.unwrap();
        let mid = child_of(&pool, &bus, &root.id, "mid").await;
        let leaf = child_of(&pool, &bus, &mid.id, "leaf").await;

        complete_task(&pool, &bus, &mid.id).await.unwrap();
        assert_eq!(get_task(&pool, &root.id).await.unwrap().status, "ACTIVE");
        assert_eq!(get_task(&pool, &mid.id).await.unwrap().status, "COMPLETED");
        assert_eq!(get_task(&pool, &leaf.id).await.unwrap().status, "COMPLETED");
    }

    #[tokio::test]
    async fn reopening_parent_does_not_reopen_children() {
        let (pool, bus) = setup().await;
        let root = create_task(&pool, &bus, quick("inbox", "root")).await.unwrap();
        let kid = child_of(&pool, &bus, &root.id, "kid").await;
        complete_task(&pool, &bus, &root.id).await.unwrap();

        reopen_task(&pool, &bus, &root.id).await.unwrap();
        let root = get_task(&pool, &root.id).await.unwrap();
        assert_eq!(root.status, "ACTIVE");
        assert_eq!(root.completed_at, None);
        assert_eq!(get_task(&pool, &kid.id).await.unwrap().status, "COMPLETED");
    }

    #[tokio::test]
    async fn already_completed_children_not_double_logged() {
        let (pool, bus) = setup().await;
        let root = create_task(&pool, &bus, quick("inbox", "root")).await.unwrap();
        let kid = child_of(&pool, &bus, &root.id, "kid").await;
        complete_task(&pool, &bus, &kid.id).await.unwrap();

        let completed = complete_task(&pool, &bus, &root.id).await.unwrap();
        assert_eq!(completed, vec![root.id.clone()]);
    }

    // ---- Nesting cap -------------------------------------------------------

    #[tokio::test]
    async fn subtask_nesting_capped_at_four_levels() {
        let (pool, bus) = setup().await;
        let l1 = create_task(&pool, &bus, quick("inbox", "l1")).await.unwrap();
        let l2 = child_of(&pool, &bus, &l1.id, "l2").await;
        let l3 = child_of(&pool, &bus, &l2.id, "l3").await;
        let l4 = child_of(&pool, &bus, &l3.id, "l4").await;

        let too_deep = create_task(
            &pool,
            &bus,
            NewTask { parent_id: Some(l4.id.clone()), ..quick("inbox", "l5") },
        )
        .await;
        assert!(matches!(too_deep, Err(RepoError::Invalid(_))));
    }

    // ---- Smart-list windows -------------------------------------------------

    const TODAY: &str = "2026-07-14";

    #[tokio::test]
    async fn smart_windows_all_day_and_timed() {
        let (pool, bus) = setup().await;
        // All-day on calendar dates.
        create_task(&pool, &bus, dated("inbox", "due today", "2026-07-14T00:00:00.000Z", true))
            .await
            .unwrap();
        create_task(&pool, &bus, dated("inbox", "overdue", "2026-07-10T00:00:00.000Z", true))
            .await
            .unwrap();
        create_task(&pool, &bus, dated("inbox", "tomorrow", "2026-07-15T00:00:00.000Z", true))
            .await
            .unwrap();
        create_task(&pool, &bus, dated("inbox", "day six", "2026-07-20T00:00:00.000Z", true))
            .await
            .unwrap();
        create_task(&pool, &bus, dated("inbox", "day seven", "2026-07-21T00:00:00.000Z", true))
            .await
            .unwrap();
        // Timed: 23:30 UTC on the 14th is 01:30 on the 15th at UTC+2.
        create_task(&pool, &bus, dated("inbox", "late timed", "2026-07-14T23:30:00.000Z", false))
            .await
            .unwrap();
        // No date.
        create_task(&pool, &bus, quick("inbox", "undated")).await.unwrap();

        let titles = |tasks: &[Task]| {
            let mut v: Vec<String> = tasks.iter().map(|t| t.title.clone()).collect();
            v.sort();
            v
        };

        // UTC observer (offset 0): late timed is still the 14th.
        let today = list_smart(&pool, SmartView::Today, TODAY, 0).await.unwrap();
        assert_eq!(titles(&today), ["due today", "late timed", "overdue"]);

        // UTC+2 observer: late timed rolls to the 15th → Tomorrow, not Today.
        let today_p2 = list_smart(&pool, SmartView::Today, TODAY, 120).await.unwrap();
        assert_eq!(titles(&today_p2), ["due today", "overdue"]);
        let tomorrow_p2 = list_smart(&pool, SmartView::Tomorrow, TODAY, 120).await.unwrap();
        assert_eq!(titles(&tomorrow_p2), ["late timed", "tomorrow"]);

        // All-day tasks never shift with the offset (DST-style stability).
        let today_m7 = list_smart(&pool, SmartView::Today, TODAY, -420).await.unwrap();
        assert!(titles(&today_m7).contains(&"due today".to_string()));

        // Next 7 Days: overdue + today..+6 in; day seven out; undated never in.
        let next7 = list_smart(&pool, SmartView::Next7Days, TODAY, 0).await.unwrap();
        let next7_titles = titles(&next7);
        assert!(next7_titles.contains(&"day six".to_string()));
        assert!(next7_titles.contains(&"overdue".to_string()));
        assert!(!next7_titles.contains(&"day seven".to_string()));
        assert!(!next7_titles.contains(&"undated".to_string()));

        // All: every ACTIVE task incl. undated.
        let all = list_smart(&pool, SmartView::All, TODAY, 0).await.unwrap();
        assert_eq!(all.len(), 7);
    }

    #[tokio::test]
    async fn completed_tasks_leave_date_views_and_enter_completed() {
        let (pool, bus) = setup().await;
        let t = create_task(&pool, &bus, dated("inbox", "done soon", "2026-07-14T00:00:00.000Z", true))
            .await
            .unwrap();
        complete_task(&pool, &bus, &t.id).await.unwrap();

        assert!(list_smart(&pool, SmartView::Today, TODAY, 0).await.unwrap().is_empty());
        let completed = list_smart(&pool, SmartView::Completed, TODAY, 0).await.unwrap();
        assert_eq!(completed.len(), 1);
        assert_eq!(completed[0].title, "done soon");
    }

    // ---- Reorder math ------------------------------------------------------

    async fn order_of(pool: &SqlitePool, project: &str) -> Vec<String> {
        list_project_tasks(pool, project)
            .await
            .unwrap()
            .into_iter()
            .map(|t| t.title)
            .collect()
    }

    #[tokio::test]
    async fn reorder_moves_to_top_middle_and_bottom() {
        let (pool, bus) = setup().await;
        let a = create_task(&pool, &bus, quick("inbox", "a")).await.unwrap();
        let b = create_task(&pool, &bus, quick("inbox", "b")).await.unwrap();
        let c = create_task(&pool, &bus, quick("inbox", "c")).await.unwrap();
        assert_eq!(order_of(&pool, "inbox").await, ["a", "b", "c"]);

        // c to top.
        reorder_task(&pool, &bus, &c.id, None).await.unwrap();
        assert_eq!(order_of(&pool, "inbox").await, ["c", "a", "b"]);

        // a after b (bottom).
        reorder_task(&pool, &bus, &a.id, Some(&b.id)).await.unwrap();
        assert_eq!(order_of(&pool, "inbox").await, ["c", "b", "a"]);

        // b after c (middle stays middle).
        reorder_task(&pool, &bus, &b.id, Some(&c.id)).await.unwrap();
        assert_eq!(order_of(&pool, "inbox").await, ["c", "b", "a"]);
    }

    #[tokio::test]
    async fn repeated_top_inserts_survive_gap_exhaustion() {
        let (pool, bus) = setup().await;
        let mut ids = Vec::new();
        for i in 0..8 {
            let t = create_task(&pool, &bus, quick("inbox", &format!("t{i}"))).await.unwrap();
            ids.push(t.id);
        }
        // Repeatedly move the last task to the top; each insert halves the gap
        // below the current top, eventually forcing a renumber.
        for _ in 0..24 {
            let order = list_project_tasks(&pool, "inbox").await.unwrap();
            let last = order.last().unwrap().id.clone();
            reorder_task(&pool, &bus, &last, None).await.unwrap();
            let after = list_project_tasks(&pool, "inbox").await.unwrap();
            assert_eq!(after.first().unwrap().id, last, "moved task must be first");
            assert_eq!(after.len(), 8);
        }
    }

    // ---- Trash flows -------------------------------------------------------

    #[tokio::test]
    async fn trash_excludes_from_views_and_restore_returns() {
        let (pool, bus) = setup().await;
        let t = create_task(&pool, &bus, dated("inbox", "doomed", "2026-07-14T00:00:00.000Z", true))
            .await
            .unwrap();
        trash_task(&pool, &bus, &t.id).await.unwrap();

        assert!(list_smart(&pool, SmartView::Today, TODAY, 0).await.unwrap().is_empty());
        assert!(list_smart(&pool, SmartView::All, TODAY, 0).await.unwrap().is_empty());
        assert!(list_project_tasks(&pool, "inbox").await.unwrap().is_empty());
        let trash = list_smart(&pool, SmartView::Trash, TODAY, 0).await.unwrap();
        assert_eq!(trash.len(), 1);

        let restored = restore_task(&pool, &bus, &t.id).await.unwrap();
        assert_eq!(restored.status, "ACTIVE");
        assert_eq!(restored.project_id, "inbox");
        assert_eq!(list_project_tasks(&pool, "inbox").await.unwrap().len(), 1);
    }

    #[tokio::test]
    async fn trashing_parent_trashes_subtree() {
        let (pool, bus) = setup().await;
        let root = create_task(&pool, &bus, quick("inbox", "root")).await.unwrap();
        let kid = child_of(&pool, &bus, &root.id, "kid").await;

        let trashed = trash_task(&pool, &bus, &root.id).await.unwrap();
        assert_eq!(trashed.len(), 2);
        assert_eq!(get_task(&pool, &kid.id).await.unwrap().status, "TRASHED");
    }

    #[tokio::test]
    async fn delete_forever_soft_deletes_row() {
        let (pool, bus) = setup().await;
        let t = create_task(&pool, &bus, quick("inbox", "gone")).await.unwrap();
        trash_task(&pool, &bus, &t.id).await.unwrap();
        delete_task_forever(&pool, &bus, &t.id).await.unwrap();

        assert!(matches!(get_task(&pool, &t.id).await, Err(RepoError::NotFound(_))));
        assert!(list_smart(&pool, SmartView::Trash, TODAY, 0).await.unwrap().is_empty());
        let raw: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM tasks WHERE id = ?")
            .bind(&t.id)
            .fetch_one(&pool)
            .await
            .unwrap();
        assert_eq!(raw, 1);
    }

    // ---- Recurrence advance (engine wired into completion) -----------------

    fn recurring(project: &str, title: &str, rrule: &str, due: &str) -> NewTask {
        NewTask {
            due_at: Some(due.into()),
            is_all_day: Some(true),
            rrule: Some(rrule.into()),
            ..quick(project, title)
        }
    }

    async fn completion_count(pool: &SqlitePool, task_id: &str) -> i64 {
        sqlx::query_scalar("SELECT COUNT(*) FROM task_completions WHERE task_id = ?")
            .bind(task_id)
            .fetch_one(pool)
            .await
            .unwrap()
    }

    #[tokio::test]
    async fn recurring_task_advances_in_place_and_stays_active() {
        let (pool, bus) = setup().await;
        let t = create_task(
            &pool,
            &bus,
            recurring("inbox", "water plants", "FREQ=DAILY", "2026-03-10T00:00:00.000Z"),
        )
        .await
        .unwrap();

        // Completing an occurrence rolls the date forward; nothing is "completed".
        let completed = complete_task(&pool, &bus, &t.id).await.unwrap();
        assert!(completed.is_empty());

        let rolled = get_task(&pool, &t.id).await.unwrap();
        assert_eq!(rolled.status, "ACTIVE");
        assert_eq!(rolled.due_at.as_deref(), Some("2026-03-11T00:00:00.000Z"));
        assert_eq!(completion_count(&pool, &t.id).await, 1);
    }

    #[tokio::test]
    async fn count_end_condition_completes_after_n_occurrences() {
        let (pool, bus) = setup().await;
        let t = create_task(
            &pool,
            &bus,
            recurring("inbox", "standup", "FREQ=DAILY;COUNT=2", "2026-03-10T00:00:00.000Z"),
        )
        .await
        .unwrap();

        // First close advances to occurrence 2 and stays active.
        assert!(complete_task(&pool, &bus, &t.id).await.unwrap().is_empty());
        assert_eq!(get_task(&pool, &t.id).await.unwrap().due_at.as_deref(), Some("2026-03-11T00:00:00.000Z"));

        // Second close hits COUNT=2 → the series ends and the task completes.
        let completed = complete_task(&pool, &bus, &t.id).await.unwrap();
        assert_eq!(completed, vec![t.id.clone()]);
        assert_eq!(get_task(&pool, &t.id).await.unwrap().status, "COMPLETED");
        assert_eq!(completion_count(&pool, &t.id).await, 2);
    }

    #[tokio::test]
    async fn activity_log_records_create_edit_and_complete() {
        let (pool, bus) = setup().await;
        let t = create_task(&pool, &bus, quick("inbox", "log me")).await.unwrap();
        update_task(&pool, &bus, &t.id, TaskPatch { title: Some("logged".into()), ..Default::default() })
            .await
            .unwrap();
        complete_task(&pool, &bus, &t.id).await.unwrap();

        let actions: Vec<String> = crate::repo::activity::list_activity(&pool, "task", &t.id)
            .await
            .unwrap()
            .into_iter()
            .map(|e| e.action)
            .collect();
        assert!(actions.contains(&"created".to_string()));
        assert!(actions.contains(&"edited".to_string()));
        assert!(actions.contains(&"completed".to_string()));
    }

    #[tokio::test]
    async fn note_kind_creates_and_converts_and_hides_from_smart_lists() {
        let (pool, bus) = setup().await;
        // A note-kind item with a due date does not appear in Today or All.
        let note = create_task(
            &pool,
            &bus,
            NewTask {
                kind: Some("NOTE".into()),
                due_at: Some("2026-07-14T00:00:00.000Z".into()),
                ..quick("inbox", "Meeting notes")
            },
        )
        .await
        .unwrap();
        assert_eq!(note.kind, "NOTE");
        assert!(list_smart(&pool, SmartView::Today, "2026-07-14", 0).await.unwrap().is_empty());
        assert!(list_smart(&pool, SmartView::All, "2026-07-14", 0).await.unwrap().is_empty());

        // Converting to a task brings it into the views.
        set_task_kind(&pool, &bus, &note.id, "TASK").await.unwrap();
        assert_eq!(get_task(&pool, &note.id).await.unwrap().kind, "TASK");
        assert_eq!(list_smart(&pool, SmartView::All, "2026-07-14", 0).await.unwrap().len(), 1);
    }

    #[tokio::test]
    async fn set_pinned_toggles_flag() {
        let (pool, bus) = setup().await;
        let t = create_task(&pool, &bus, quick("inbox", "important")).await.unwrap();
        assert!(!t.pinned);

        set_pinned(&pool, &bus, &t.id, true).await.unwrap();
        assert!(get_task(&pool, &t.id).await.unwrap().pinned);
        set_pinned(&pool, &bus, &t.id, false).await.unwrap();
        assert!(!get_task(&pool, &t.id).await.unwrap().pinned);
    }
}
