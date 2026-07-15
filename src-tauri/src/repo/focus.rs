//! Focus sessions (Pomodoro + stopwatch). The timer runs in the frontend; this
//! layer persists sessions, exposes an editable focus-record history, and
//! aggregates focus statistics. A session's effective focus time is
//! `ended - started - pause_ms`; a "pomo" is one DONE `POMO` session.

use std::collections::BTreeMap;

use chrono::{DateTime, Duration, Utc};
use serde::Serialize;
use sqlx::SqlitePool;

use crate::error::{RepoError, Result};
use crate::events::{DomainEvent, EventBus};

use super::{append_changelog, new_id, now, ChangeOp};

const COLUMNS: &str =
    "id, task_id, habit_id, kind, started_at, ended_at, pause_ms, note, status, planned_min";

#[derive(Debug, Clone, Serialize, sqlx::FromRow)]
#[serde(rename_all = "camelCase")]
pub struct FocusSession {
    pub id: String,
    pub task_id: Option<String>,
    pub habit_id: Option<String>,
    pub kind: String,
    pub started_at: String,
    pub ended_at: Option<String>,
    pub pause_ms: i64,
    pub note: Option<String>,
    pub status: String,
    pub planned_min: Option<i64>,
}

/// Effective focus milliseconds of a completed session (never negative).
pub fn effective_ms(started_at: &str, ended_at: &str, pause_ms: i64) -> i64 {
    match (
        DateTime::parse_from_rfc3339(started_at),
        DateTime::parse_from_rfc3339(ended_at),
    ) {
        (Ok(s), Ok(e)) => ((e - s).num_milliseconds() - pause_ms).max(0),
        _ => 0,
    }
}

fn check_kind(kind: &str) -> Result<()> {
    match kind {
        "POMO" | "STOPWATCH" => Ok(()),
        _ => Err(RepoError::Invalid(format!("bad focus kind {kind:?}"))),
    }
}

pub async fn get_session(pool: &SqlitePool, id: &str) -> Result<FocusSession> {
    sqlx::query_as(&format!(
        "SELECT {COLUMNS} FROM focus_sessions WHERE id = ? AND deleted_at IS NULL"
    ))
    .bind(id)
    .fetch_optional(pool)
    .await?
    .ok_or_else(|| RepoError::NotFound(format!("focus session {id}")))
}

/// Begin a session (written immediately so it survives an app restart).
pub async fn start_session(
    pool: &SqlitePool,
    bus: &EventBus,
    task_id: Option<&str>,
    kind: &str,
    planned_min: Option<i64>,
) -> Result<FocusSession> {
    check_kind(kind)?;
    let id = new_id();
    let ts = now();
    let mut tx = pool.begin().await?;
    sqlx::query(
        "INSERT INTO focus_sessions (id, task_id, kind, started_at, pause_ms, status, planned_min,
                                     created_at, updated_at)
         VALUES (?, ?, ?, ?, 0, 'RUNNING', ?, ?, ?)",
    )
    .bind(&id)
    .bind(task_id)
    .bind(kind)
    .bind(&ts)
    .bind(planned_min)
    .bind(&ts)
    .bind(&ts)
    .execute(&mut *tx)
    .await?;
    append_changelog(&mut tx, "focus", &id, ChangeOp::Insert, &serde_json::json!({ "kind": kind }))
        .await?;
    tx.commit().await?;
    bus.emit(DomainEvent::FocusChanged);
    get_session(pool, &id).await
}

/// Finish a session: DONE (counts toward stats) or ABANDONED (does not).
pub async fn complete_session(
    pool: &SqlitePool,
    bus: &EventBus,
    id: &str,
    pause_ms: i64,
    note: Option<&str>,
    status: &str,
) -> Result<FocusSession> {
    if status != "DONE" && status != "ABANDONED" {
        return Err(RepoError::Invalid(format!("bad completion status {status:?}")));
    }
    let ts = now();
    let mut tx = pool.begin().await?;
    let res = sqlx::query(
        "UPDATE focus_sessions SET ended_at = ?, pause_ms = ?, note = COALESCE(?, note),
                                   status = ?, updated_at = ?
         WHERE id = ? AND deleted_at IS NULL",
    )
    .bind(&ts)
    .bind(pause_ms.max(0))
    .bind(note)
    .bind(status)
    .bind(&ts)
    .bind(id)
    .execute(&mut *tx)
    .await?;
    if res.rows_affected() == 0 {
        return Err(RepoError::NotFound(format!("focus session {id}")));
    }
    append_changelog(&mut tx, "focus", id, ChangeOp::Update, &serde_json::json!({ "status": status }))
        .await?;
    tx.commit().await?;
    bus.emit(DomainEvent::FocusChanged);
    get_session(pool, id).await
}

/// Persist pause/resume so a restored session shows the right state.
pub async fn set_paused(pool: &SqlitePool, bus: &EventBus, id: &str, paused: bool) -> Result<()> {
    let status = if paused { "PAUSED" } else { "RUNNING" };
    let res = sqlx::query(
        "UPDATE focus_sessions SET status = ?, updated_at = ?
         WHERE id = ? AND status IN ('RUNNING', 'PAUSED') AND deleted_at IS NULL",
    )
    .bind(status)
    .bind(now())
    .bind(id)
    .execute(pool)
    .await?;
    if res.rows_affected() == 0 {
        return Err(RepoError::NotFound(format!("active focus session {id}")));
    }
    bus.emit(DomainEvent::FocusChanged);
    Ok(())
}

/// The session in progress (to restore the timer after a reload), if any.
pub async fn active_session(pool: &SqlitePool) -> Result<Option<FocusSession>> {
    Ok(sqlx::query_as(&format!(
        "SELECT {COLUMNS} FROM focus_sessions
         WHERE status IN ('RUNNING', 'PAUSED') AND deleted_at IS NULL
         ORDER BY started_at DESC LIMIT 1"
    ))
    .fetch_optional(pool)
    .await?)
}

/// Add a completed session by hand (the editable focus-record timeline).
pub async fn add_manual_session(
    pool: &SqlitePool,
    bus: &EventBus,
    task_id: Option<&str>,
    kind: &str,
    started_at: &str,
    ended_at: &str,
    note: Option<&str>,
) -> Result<FocusSession> {
    check_kind(kind)?;
    let id = new_id();
    let ts = now();
    let mut tx = pool.begin().await?;
    sqlx::query(
        "INSERT INTO focus_sessions (id, task_id, kind, started_at, ended_at, pause_ms, note,
                                     status, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, 0, ?, 'DONE', ?, ?)",
    )
    .bind(&id)
    .bind(task_id)
    .bind(kind)
    .bind(started_at)
    .bind(ended_at)
    .bind(note)
    .bind(&ts)
    .bind(&ts)
    .execute(&mut *tx)
    .await?;
    append_changelog(&mut tx, "focus", &id, ChangeOp::Insert, &serde_json::json!({ "manual": true }))
        .await?;
    tx.commit().await?;
    bus.emit(DomainEvent::FocusChanged);
    get_session(pool, &id).await
}

pub async fn update_session(
    pool: &SqlitePool,
    bus: &EventBus,
    id: &str,
    started_at: Option<&str>,
    ended_at: Option<&str>,
    note: Option<&str>,
) -> Result<FocusSession> {
    let ts = now();
    let res = sqlx::query(
        "UPDATE focus_sessions SET started_at = COALESCE(?, started_at),
                                   ended_at = COALESCE(?, ended_at), note = COALESCE(?, note),
                                   updated_at = ?
         WHERE id = ? AND deleted_at IS NULL",
    )
    .bind(started_at)
    .bind(ended_at)
    .bind(note)
    .bind(&ts)
    .bind(id)
    .execute(pool)
    .await?;
    if res.rows_affected() == 0 {
        return Err(RepoError::NotFound(format!("focus session {id}")));
    }
    bus.emit(DomainEvent::FocusChanged);
    get_session(pool, id).await
}

pub async fn delete_session(pool: &SqlitePool, bus: &EventBus, id: &str) -> Result<()> {
    let ts = now();
    let res = sqlx::query("UPDATE focus_sessions SET deleted_at = ?, updated_at = ? WHERE id = ? AND deleted_at IS NULL")
        .bind(&ts)
        .bind(&ts)
        .bind(id)
        .execute(pool)
        .await?;
    if res.rows_affected() == 0 {
        return Err(RepoError::NotFound(format!("focus session {id}")));
    }
    bus.emit(DomainEvent::FocusChanged);
    Ok(())
}

/// Completed sessions started within `[from, to]`, newest first.
pub async fn list_sessions(pool: &SqlitePool, from: &str, to: &str) -> Result<Vec<FocusSession>> {
    Ok(sqlx::query_as(&format!(
        "SELECT {COLUMNS} FROM focus_sessions
         WHERE status = 'DONE' AND deleted_at IS NULL AND started_at >= ? AND started_at <= ?
         ORDER BY started_at DESC"
    ))
    .bind(from)
    .bind(to)
    .fetch_all(pool)
    .await?)
}

pub async fn list_task_sessions(pool: &SqlitePool, task_id: &str) -> Result<Vec<FocusSession>> {
    Ok(sqlx::query_as(&format!(
        "SELECT {COLUMNS} FROM focus_sessions
         WHERE status = 'DONE' AND deleted_at IS NULL AND task_id = ?
         ORDER BY started_at DESC"
    ))
    .bind(task_id)
    .fetch_all(pool)
    .await?)
}

// ---- statistics ------------------------------------------------------------

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DayStat {
    pub date: String,
    pub ms: i64,
    pub pomos: i64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TaskStat {
    pub task_id: Option<String>,
    pub title: String,
    pub ms: i64,
    pub pomos: i64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TagStat {
    pub tag_id: String,
    pub name: String,
    pub ms: i64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FocusStats {
    pub total_ms: i64,
    pub pomo_count: i64,
    pub per_day: Vec<DayStat>,
    pub per_task: Vec<TaskStat>,
    pub per_tag: Vec<TagStat>,
}

#[derive(sqlx::FromRow)]
struct StatRow {
    task_id: Option<String>,
    kind: String,
    started_at: String,
    ended_at: Option<String>,
    pause_ms: i64,
}

fn local_date(iso: &str, tz_off_min: i32) -> String {
    match DateTime::parse_from_rfc3339(iso) {
        Ok(dt) => (dt.with_timezone(&Utc) + Duration::minutes(tz_off_min as i64))
            .format("%Y-%m-%d")
            .to_string(),
        Err(_) => iso.chars().take(10).collect(),
    }
}

/// Aggregate DONE sessions in `[from, to]` into per-day / per-task / per-tag
/// totals plus overall focus time and pomo count.
pub async fn focus_stats(
    pool: &SqlitePool,
    from: &str,
    to: &str,
    tz_off_min: i32,
) -> Result<FocusStats> {
    let rows: Vec<StatRow> = sqlx::query_as(
        "SELECT task_id, kind, started_at, ended_at, pause_ms FROM focus_sessions
         WHERE status = 'DONE' AND deleted_at IS NULL AND started_at >= ? AND started_at <= ?",
    )
    .bind(from)
    .bind(to)
    .fetch_all(pool)
    .await?;

    let mut total_ms = 0i64;
    let mut pomo_count = 0i64;
    let mut per_day: BTreeMap<String, DayStat> = BTreeMap::new();
    let mut per_task: BTreeMap<Option<String>, TaskStat> = BTreeMap::new();

    for row in &rows {
        let Some(ended) = row.ended_at.as_deref() else { continue };
        let ms = effective_ms(&row.started_at, ended, row.pause_ms);
        let is_pomo = row.kind == "POMO";
        total_ms += ms;
        if is_pomo {
            pomo_count += 1;
        }

        let day = per_day.entry(local_date(&row.started_at, tz_off_min)).or_insert_with(|| DayStat {
            date: local_date(&row.started_at, tz_off_min),
            ms: 0,
            pomos: 0,
        });
        day.ms += ms;
        day.pomos += is_pomo as i64;

        let task = per_task.entry(row.task_id.clone()).or_insert_with(|| TaskStat {
            task_id: row.task_id.clone(),
            title: String::new(),
            ms: 0,
            pomos: 0,
        });
        task.ms += ms;
        task.pomos += is_pomo as i64;
    }

    // Resolve task titles and tag totals for the tasks that appeared.
    let task_ids: Vec<String> = per_task.keys().flatten().cloned().collect();
    let mut per_tag: BTreeMap<String, TagStat> = BTreeMap::new();
    for stat in per_task.values_mut() {
        match &stat.task_id {
            None => stat.title = "No task".into(),
            Some(id) => {
                let title: Option<String> =
                    sqlx::query_scalar("SELECT title FROM tasks WHERE id = ?")
                        .bind(id)
                        .fetch_optional(pool)
                        .await?;
                stat.title = title.unwrap_or_else(|| "(deleted task)".into());

                let tags: Vec<(String, String)> = sqlx::query_as(
                    "SELECT t.id, t.name FROM tags t
                     JOIN task_tags tt ON tt.tag_id = t.id
                     WHERE tt.task_id = ? AND tt.deleted_at IS NULL AND t.deleted_at IS NULL",
                )
                .bind(id)
                .fetch_all(pool)
                .await?;
                for (tag_id, name) in tags {
                    let entry = per_tag.entry(tag_id.clone()).or_insert(TagStat { tag_id, name, ms: 0 });
                    entry.ms += stat.ms;
                }
            }
        }
    }
    let _ = task_ids;

    let mut per_day: Vec<DayStat> = per_day.into_values().collect();
    per_day.sort_by(|a, b| a.date.cmp(&b.date));
    let mut per_task: Vec<TaskStat> = per_task.into_values().collect();
    per_task.sort_by_key(|s| std::cmp::Reverse(s.ms));
    let mut per_tag: Vec<TagStat> = per_tag.into_values().collect();
    per_tag.sort_by_key(|s| std::cmp::Reverse(s.ms));

    Ok(FocusStats { total_ms, pomo_count, per_day, per_task, per_tag })
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TaskActuals {
    pub actual_ms: i64,
    pub actual_pomos: i64,
}

/// A task's actual focus time and completed-pomo count (for est-vs-actual).
pub async fn task_actuals(pool: &SqlitePool, task_id: &str) -> Result<TaskActuals> {
    let sessions = list_task_sessions(pool, task_id).await?;
    let mut actual_ms = 0i64;
    let mut actual_pomos = 0i64;
    for s in sessions {
        if let Some(ended) = &s.ended_at {
            actual_ms += effective_ms(&s.started_at, ended, s.pause_ms);
            if s.kind == "POMO" {
                actual_pomos += 1;
            }
        }
    }
    Ok(TaskActuals { actual_ms, actual_pomos })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::repo::db::connect_in_memory;
    use crate::repo::tasks::tests::quick;
    use crate::repo::tasks::create_task;

    async fn setup() -> (SqlitePool, EventBus) {
        (connect_in_memory().await.unwrap(), EventBus::new())
    }

    #[test]
    fn effective_ms_subtracts_pause_and_floors_at_zero() {
        // 25 min minus 5 min pause = 20 min.
        assert_eq!(
            effective_ms("2026-03-01T10:00:00.000Z", "2026-03-01T10:25:00.000Z", 5 * 60_000),
            20 * 60_000
        );
        // Pause larger than the span floors at 0.
        assert_eq!(
            effective_ms("2026-03-01T10:00:00.000Z", "2026-03-01T10:05:00.000Z", 99 * 60_000),
            0
        );
    }

    #[tokio::test]
    async fn start_then_complete_lifecycle() {
        let (pool, bus) = setup().await;
        let task = create_task(&pool, &bus, quick("inbox", "write report")).await.unwrap();

        let session = start_session(&pool, &bus, Some(&task.id), "POMO", Some(25)).await.unwrap();
        assert_eq!(session.status, "RUNNING");
        assert!(active_session(&pool).await.unwrap().is_some());

        complete_session(&pool, &bus, &session.id, 0, Some("done"), "DONE").await.unwrap();
        assert!(active_session(&pool).await.unwrap().is_none());
        assert_eq!(list_task_sessions(&pool, &task.id).await.unwrap().len(), 1);
    }

    #[tokio::test]
    async fn manual_add_update_delete() {
        let (pool, bus) = setup().await;
        let s = add_manual_session(
            &pool,
            &bus,
            None,
            "STOPWATCH",
            "2026-03-01T09:00:00.000Z",
            "2026-03-01T09:30:00.000Z",
            Some("deep work"),
        )
        .await
        .unwrap();
        assert_eq!(s.status, "DONE");

        update_session(&pool, &bus, &s.id, None, Some("2026-03-01T09:45:00.000Z"), None).await.unwrap();
        assert_eq!(get_session(&pool, &s.id).await.unwrap().ended_at.as_deref(), Some("2026-03-01T09:45:00.000Z"));

        delete_session(&pool, &bus, &s.id).await.unwrap();
        assert!(matches!(get_session(&pool, &s.id).await, Err(RepoError::NotFound(_))));
    }

    #[tokio::test]
    async fn stats_aggregate_by_day_task_and_count_pomos() {
        let (pool, bus) = setup().await;
        let a = create_task(&pool, &bus, quick("inbox", "task A")).await.unwrap();

        // Two 25-min pomos on task A (same day) + one 30-min stopwatch, no task.
        add_manual_session(&pool, &bus, Some(&a.id), "POMO", "2026-03-01T10:00:00.000Z", "2026-03-01T10:25:00.000Z", None).await.unwrap();
        add_manual_session(&pool, &bus, Some(&a.id), "POMO", "2026-03-01T11:00:00.000Z", "2026-03-01T11:25:00.000Z", None).await.unwrap();
        add_manual_session(&pool, &bus, None, "STOPWATCH", "2026-03-01T13:00:00.000Z", "2026-03-01T13:30:00.000Z", None).await.unwrap();
        // A session outside the window is ignored.
        add_manual_session(&pool, &bus, Some(&a.id), "POMO", "2026-05-01T10:00:00.000Z", "2026-05-01T10:25:00.000Z", None).await.unwrap();

        let stats = focus_stats(&pool, "2026-03-01T00:00:00.000Z", "2026-03-01T23:59:59.000Z", 0).await.unwrap();
        assert_eq!(stats.pomo_count, 2);
        assert_eq!(stats.total_ms, (25 + 25 + 30) * 60_000);
        assert_eq!(stats.per_day.len(), 1);
        assert_eq!(stats.per_day[0].pomos, 2);
        // Task A is the biggest bucket (50 min) ahead of "No task" (30 min).
        assert_eq!(stats.per_task[0].title, "task A");
        assert_eq!(stats.per_task[0].ms, 50 * 60_000);

        let actuals = task_actuals(&pool, &a.id).await.unwrap();
        assert_eq!(actuals.actual_pomos, 3); // includes the May session
        assert_eq!(actuals.actual_ms, 75 * 60_000);
    }
}
