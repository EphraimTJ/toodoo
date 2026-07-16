//! Reminders: absolute and relative triggers per task, with snooze. The
//! scheduler polls `due_reminders` to decide what to fire; the fire-time math
//! lives here (pure, given the row data) so it is unit-testable.

use chrono::{DateTime, Duration, NaiveTime, TimeZone, Utc};
use serde::Serialize;
use sqlx::SqlitePool;

use crate::error::{RepoError, Result};
use crate::events::{DomainEvent, EventBus};

use super::{append_changelog, new_id, now, ChangeOp};

/// Default wall-clock time an all-day task's relative reminder anchors on
/// (docs/decisions.md). 09:00 local.
pub const ALL_DAY_REMINDER_TIME: NaiveTime = match NaiveTime::from_hms_opt(9, 0, 0) {
    Some(t) => t,
    None => unreachable!(),
};

#[derive(Debug, Clone, Serialize, sqlx::FromRow)]
#[serde(rename_all = "camelCase")]
pub struct Reminder {
    pub id: String,
    pub task_id: String,
    pub trigger_kind: String,
    pub at: Option<String>,
    pub offset_min: Option<i64>,
    pub snoozed_until: Option<String>,
    pub last_fired_at: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DueReminder {
    pub reminder_id: String,
    pub task_id: String,
    pub task_title: String,
    pub fire_at: String,
}

// Row shape for the scheduler scan: reminder joined to its task.
#[derive(sqlx::FromRow)]
struct ScanRow {
    reminder_id: String,
    task_id: String,
    trigger_kind: String,
    at: Option<String>,
    offset_min: Option<i64>,
    snoozed_until: Option<String>,
    last_fired_at: Option<String>,
    task_title: String,
    start_at: Option<String>,
    due_at: Option<String>,
    is_all_day: bool,
    time_zone: Option<String>,
}

fn parse_utc(s: &str) -> Option<DateTime<Utc>> {
    DateTime::parse_from_rfc3339(s).ok().map(|d| d.with_timezone(&Utc))
}

fn resolve_tz(name: Option<&str>) -> chrono_tz::Tz {
    name.and_then(|n| n.parse().ok()).unwrap_or(chrono_tz::UTC)
}

/// When this reminder should fire, or `None` if it has no computable anchor.
fn fire_at(row: &ScanRow) -> Option<DateTime<Utc>> {
    if let Some(snooze) = &row.snoozed_until {
        return parse_utc(snooze);
    }
    match row.trigger_kind.as_str() {
        "ABS" => row.at.as_deref().and_then(parse_utc),
        "REL" => {
            let anchor_str = row.due_at.as_deref().or(row.start_at.as_deref())?;
            let anchor = if row.is_all_day {
                let date = parse_utc(anchor_str)?.date_naive();
                let tz = resolve_tz(row.time_zone.as_deref());
                tz.from_local_datetime(&date.and_time(ALL_DAY_REMINDER_TIME))
                    .single()?
                    .with_timezone(&Utc)
            } else {
                parse_utc(anchor_str)?
            };
            Some(anchor - Duration::minutes(row.offset_min.unwrap_or(0)))
        }
        _ => None,
    }
}

/// Reminders whose fire time has arrived (`<= now`) and that have not already
/// fired at that time. Only ACTIVE, non-deleted tasks are considered — a
/// completed or trashed task never nags. Drives both the periodic tick and the
/// "missed while closed" startup catch-up.
pub async fn due_reminders(pool: &SqlitePool, now_instant: DateTime<Utc>) -> Result<Vec<DueReminder>> {
    let rows: Vec<ScanRow> = sqlx::query_as(
        "SELECT r.id AS reminder_id, r.task_id AS task_id, r.trigger_kind, r.at,
                r.offset_min, r.snoozed_until, r.last_fired_at,
                t.title AS task_title, t.start_at, t.due_at, t.is_all_day, t.time_zone
         FROM reminders r JOIN tasks t ON t.id = r.task_id
         WHERE r.deleted_at IS NULL AND t.deleted_at IS NULL AND t.status = 'ACTIVE'",
    )
    .fetch_all(pool)
    .await?;

    let mut due = Vec::new();
    for row in &rows {
        let Some(fire) = fire_at(row) else { continue };
        if fire > now_instant {
            continue;
        }
        // Already fired at (or after) this fire time? Skip.
        if let Some(last) = row.last_fired_at.as_deref().and_then(parse_utc) {
            if last >= fire {
                continue;
            }
        }
        due.push(DueReminder {
            reminder_id: row.reminder_id.clone(),
            task_id: row.task_id.clone(),
            task_title: row.task_title.clone(),
            fire_at: fire.to_rfc3339_opts(chrono::SecondsFormat::Millis, true),
        });
    }
    Ok(due)
}

pub async fn mark_fired(pool: &SqlitePool, reminder_id: &str, at: &str) -> Result<()> {
    sqlx::query("UPDATE reminders SET last_fired_at = ?, updated_at = ? WHERE id = ?")
        .bind(at)
        .bind(now())
        .bind(reminder_id)
        .execute(pool)
        .await?;
    Ok(())
}

pub async fn list_reminders(pool: &SqlitePool, task_id: &str) -> Result<Vec<Reminder>> {
    Ok(sqlx::query_as(
        "SELECT id, task_id, trigger_kind, at, offset_min, snoozed_until, last_fired_at
         FROM reminders WHERE task_id = ? AND deleted_at IS NULL ORDER BY created_at",
    )
    .bind(task_id)
    .fetch_all(pool)
    .await?)
}

pub async fn add_reminder(
    pool: &SqlitePool,
    bus: &EventBus,
    task_id: &str,
    trigger_kind: &str,
    at: Option<&str>,
    offset_min: Option<i64>,
) -> Result<Reminder> {
    if trigger_kind != "ABS" && trigger_kind != "REL" {
        return Err(RepoError::Invalid(format!("bad trigger_kind {trigger_kind:?}")));
    }
    let id = new_id();
    let ts = now();
    let mut tx = pool.begin().await?;
    sqlx::query(
        "INSERT INTO reminders (id, task_id, trigger_kind, at, offset_min, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)",
    )
    .bind(&id)
    .bind(task_id)
    .bind(trigger_kind)
    .bind(at)
    .bind(offset_min)
    .bind(&ts)
    .bind(&ts)
    .execute(&mut *tx)
    .await?;
    append_changelog(&mut tx, "reminder", &id, ChangeOp::Insert, &serde_json::json!({ "taskId": task_id }))
        .await?;
    tx.commit().await?;
    bus.emit(DomainEvent::ReminderChanged { task_id: task_id.to_string() });
    Ok(Reminder {
        id,
        task_id: task_id.to_string(),
        trigger_kind: trigger_kind.to_string(),
        at: at.map(String::from),
        offset_min,
        snoozed_until: None,
        last_fired_at: None,
    })
}

async fn task_of(pool: &SqlitePool, reminder_id: &str) -> Result<String> {
    sqlx::query_scalar("SELECT task_id FROM reminders WHERE id = ? AND deleted_at IS NULL")
        .bind(reminder_id)
        .fetch_optional(pool)
        .await?
        .ok_or_else(|| RepoError::NotFound(format!("reminder {reminder_id}")))
}

pub async fn snooze(pool: &SqlitePool, bus: &EventBus, reminder_id: &str, until: &str) -> Result<()> {
    let task_id = task_of(pool, reminder_id).await?;
    let ts = now();
    let mut tx = pool.begin().await?;
    sqlx::query("UPDATE reminders SET snoozed_until = ?, updated_at = ? WHERE id = ?")
        .bind(until)
        .bind(&ts)
        .bind(reminder_id)
        .execute(&mut *tx)
        .await?;
    append_changelog(&mut tx, "reminder", reminder_id, ChangeOp::Update, &serde_json::json!({ "snoozedUntil": until }))
        .await?;
    tx.commit().await?;
    bus.emit(DomainEvent::ReminderChanged { task_id });
    Ok(())
}

pub async fn delete_reminder(pool: &SqlitePool, bus: &EventBus, reminder_id: &str) -> Result<()> {
    let task_id = task_of(pool, reminder_id).await?;
    let ts = now();
    let mut tx = pool.begin().await?;
    sqlx::query("UPDATE reminders SET deleted_at = ?, updated_at = ? WHERE id = ?")
        .bind(&ts)
        .bind(&ts)
        .bind(reminder_id)
        .execute(&mut *tx)
        .await?;
    append_changelog(&mut tx, "reminder", reminder_id, ChangeOp::Delete, &serde_json::json!({})).await?;
    tx.commit().await?;
    bus.emit(DomainEvent::ReminderChanged { task_id });
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::repo::db::connect_in_memory;
    use crate::repo::tasks::tests::{quick, setup};
    use crate::repo::tasks::{complete_task, create_task, trash_task, NewTask};

    fn t(s: &str) -> DateTime<Utc> {
        DateTime::parse_from_rfc3339(s).unwrap().with_timezone(&Utc)
    }

    async fn timed_task(pool: &SqlitePool, bus: &EventBus, due: &str) -> String {
        create_task(
            pool,
            bus,
            NewTask {
                due_at: Some(due.into()),
                is_all_day: Some(false),
                ..quick("inbox", "meeting")
            },
        )
        .await
        .unwrap()
        .id
    }

    #[tokio::test]
    async fn relative_reminder_fires_offset_before_due() {
        let (pool, bus) = setup().await;
        let task = timed_task(&pool, &bus, "2026-03-10T17:00:00.000Z").await;
        add_reminder(&pool, &bus, &task, "REL", None, Some(30)).await.unwrap();

        // 30 min before 17:00 = 16:30.
        assert!(due_reminders(&pool, t("2026-03-10T16:29:00Z")).await.unwrap().is_empty());
        let due = due_reminders(&pool, t("2026-03-10T16:30:00Z")).await.unwrap();
        assert_eq!(due.len(), 1);
        assert_eq!(due[0].fire_at, "2026-03-10T16:30:00.000Z");
    }

    #[tokio::test]
    async fn all_day_relative_reminder_anchors_at_nine_local() {
        let (pool, bus) = setup().await;
        // All-day task due 2026-03-10 (stored midnight-Z), no offset.
        let task = create_task(
            &pool,
            &bus,
            NewTask { due_at: Some("2026-03-10T00:00:00.000Z".into()), ..quick("inbox", "chore") },
        )
        .await
        .unwrap()
        .id;
        add_reminder(&pool, &bus, &task, "REL", None, Some(0)).await.unwrap();

        // No tz -> 09:00 UTC.
        assert!(due_reminders(&pool, t("2026-03-10T08:59:00Z")).await.unwrap().is_empty());
        assert_eq!(due_reminders(&pool, t("2026-03-10T09:00:00Z")).await.unwrap().len(), 1);
    }

    #[tokio::test]
    async fn absolute_reminder_and_last_fired_dedupe() {
        let (pool, bus) = setup().await;
        let task = timed_task(&pool, &bus, "2026-03-10T17:00:00.000Z").await;
        let r = add_reminder(&pool, &bus, &task, "ABS", Some("2026-03-10T08:00:00.000Z"), None)
            .await
            .unwrap();

        let due = due_reminders(&pool, t("2026-03-10T08:00:00Z")).await.unwrap();
        assert_eq!(due.len(), 1);
        mark_fired(&pool, &r.id, &due[0].fire_at).await.unwrap();
        // Same fire time already recorded -> no refire.
        assert!(due_reminders(&pool, t("2026-03-10T09:00:00Z")).await.unwrap().is_empty());
    }

    #[tokio::test]
    async fn snooze_moves_the_fire_time_and_allows_refire() {
        let (pool, bus) = setup().await;
        let task = timed_task(&pool, &bus, "2026-03-10T17:00:00.000Z").await;
        let r = add_reminder(&pool, &bus, &task, "ABS", Some("2026-03-10T08:00:00.000Z"), None)
            .await
            .unwrap();
        let due = due_reminders(&pool, t("2026-03-10T08:00:00Z")).await.unwrap();
        mark_fired(&pool, &r.id, &due[0].fire_at).await.unwrap();

        snooze(&pool, &bus, &r.id, "2026-03-10T08:10:00.000Z").await.unwrap();
        assert!(due_reminders(&pool, t("2026-03-10T08:05:00Z")).await.unwrap().is_empty());
        assert_eq!(due_reminders(&pool, t("2026-03-10T08:10:00Z")).await.unwrap().len(), 1);
    }

    #[tokio::test]
    async fn completed_or_trashed_tasks_do_not_nag() {
        let (pool, bus) = setup().await;
        let task = timed_task(&pool, &bus, "2026-03-10T17:00:00.000Z").await;
        add_reminder(&pool, &bus, &task, "ABS", Some("2026-03-10T08:00:00.000Z"), None).await.unwrap();

        complete_task(&pool, &bus, &task, 0).await.unwrap();
        assert!(due_reminders(&pool, t("2026-03-10T08:00:00Z")).await.unwrap().is_empty());

        // A separate trashed task with a reminder is also silent.
        let task2 = timed_task(&pool, &bus, "2026-03-10T17:00:00.000Z").await;
        add_reminder(&pool, &bus, &task2, "ABS", Some("2026-03-10T08:00:00.000Z"), None).await.unwrap();
        trash_task(&pool, &bus, &task2).await.unwrap();
        assert!(due_reminders(&pool, t("2026-03-10T08:00:00Z")).await.unwrap().is_empty());
    }

    #[tokio::test]
    async fn catch_up_returns_past_due_unfired() {
        let (pool, bus) = setup().await;
        let task = timed_task(&pool, &bus, "2026-03-10T17:00:00.000Z").await;
        add_reminder(&pool, &bus, &task, "REL", None, Some(30)).await.unwrap();
        // "App reopened" long after the fire time.
        assert_eq!(due_reminders(&pool, t("2026-03-11T00:00:00Z")).await.unwrap().len(), 1);
    }

    #[tokio::test]
    async fn delete_reminder_removes_it() {
        let pool = connect_in_memory().await.unwrap();
        let bus = EventBus::new();
        let task = timed_task(&pool, &bus, "2026-03-10T17:00:00.000Z").await;
        let r = add_reminder(&pool, &bus, &task, "REL", None, Some(10)).await.unwrap();
        delete_reminder(&pool, &bus, &r.id).await.unwrap();
        assert!(list_reminders(&pool, &task).await.unwrap().is_empty());
    }
}
