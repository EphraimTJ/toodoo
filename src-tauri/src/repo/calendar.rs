//! The calendar overlays two sources on one grid: tasks (placed by their
//! due/start date) and calendar events (local, plus read-only external ICS
//! subscription events). `list_calendar` returns a unified `CalItem` list for a
//! visible window, expanding recurring events into occurrences. Local-event CRUD
//! and the drag/resize/schedule mutations live here too.

use chrono::{DateTime, Duration, SecondsFormat, Utc};
use serde::{Deserialize, Serialize};
use sqlx::SqlitePool;

use crate::error::{RepoError, Result};
use crate::events::{DomainEvent, EventBus};

use super::recurrence::occurrences_between;
use super::tasks::{get_task, list_for_filter, update_task, Task, TaskPatch};
use super::{append_changelog, new_id, now, ChangeOp};

/// Default block length (minutes) for a timed item with no explicit duration.
const DEFAULT_DURATION_MIN: i64 = 60;

#[derive(Debug, Clone, Serialize, sqlx::FromRow)]
#[serde(rename_all = "camelCase")]
pub struct CalEvent {
    pub id: String,
    pub subscription_id: Option<String>,
    pub title: String,
    pub start_at: String,
    pub end_at: Option<String>,
    pub all_day: bool,
    pub location: Option<String>,
    pub notes: Option<String>,
    pub color: Option<String>,
    pub rrule: Option<String>,
}

/// One thing to draw on the grid. `sourceId` is the underlying task/event id;
/// `id` is unique per occurrence (recurring items append `::<startIso>`).
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CalItem {
    pub id: String,
    pub kind: String, // "TASK" | "EVENT"
    pub source_id: String,
    pub title: String,
    pub start_at: String,
    pub end_at: Option<String>,
    pub all_day: bool,
    pub color: Option<String>,
    pub editable: bool,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NewEvent {
    pub title: String,
    pub start_at: String,
    #[serde(default)]
    pub end_at: Option<String>,
    #[serde(default)]
    pub all_day: bool,
    #[serde(default)]
    pub location: Option<String>,
    #[serde(default)]
    pub notes: Option<String>,
    #[serde(default)]
    pub color: Option<String>,
    #[serde(default)]
    pub rrule: Option<String>,
}

fn parse(s: &str) -> Result<DateTime<Utc>> {
    DateTime::parse_from_rfc3339(s)
        .map(|d| d.with_timezone(&Utc))
        .map_err(|e| RepoError::Invalid(format!("bad datetime {s:?}: {e}")))
}

fn fmt(dt: DateTime<Utc>) -> String {
    dt.to_rfc3339_opts(SecondsFormat::Millis, true)
}

fn add_minutes(s: &str, minutes: i64) -> Result<String> {
    Ok(fmt(parse(s)? + Duration::minutes(minutes)))
}

/// Does `[start, end]` intersect the window `[from, to]`? (RFC3339 UTC strings
/// compare lexicographically.)
fn intersects(start: &str, end: Option<&str>, from: &str, to: &str) -> bool {
    let e = end.unwrap_or(start);
    start <= to && e >= from
}

// ---- local event CRUD ------------------------------------------------------

pub async fn create_event(pool: &SqlitePool, bus: &EventBus, input: NewEvent) -> Result<CalEvent> {
    let id = new_id();
    let ts = now();
    let mut tx = pool.begin().await?;
    sqlx::query(
        "INSERT INTO cal_events
            (id, subscription_id, title, start_at, end_at, all_day, location, notes, color, rrule,
             created_at, updated_at)
         VALUES (?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    )
    .bind(&id)
    .bind(&input.title)
    .bind(&input.start_at)
    .bind(&input.end_at)
    .bind(input.all_day)
    .bind(&input.location)
    .bind(&input.notes)
    .bind(&input.color)
    .bind(&input.rrule)
    .bind(&ts)
    .bind(&ts)
    .execute(&mut *tx)
    .await?;
    append_changelog(&mut tx, "cal_event", &id, ChangeOp::Insert, &serde_json::json!({ "title": input.title }))
        .await?;
    tx.commit().await?;
    bus.emit(DomainEvent::CalendarChanged);
    get_event(pool, &id).await
}

pub async fn get_event(pool: &SqlitePool, id: &str) -> Result<CalEvent> {
    sqlx::query_as(
        "SELECT id, subscription_id, title, start_at, end_at, all_day, location, notes, color, rrule
         FROM cal_events WHERE id = ? AND deleted_at IS NULL",
    )
    .bind(id)
    .fetch_optional(pool)
    .await?
    .ok_or_else(|| RepoError::NotFound(format!("event {id}")))
}

/// Update a LOCAL event's fields (COALESCE = leave unspecified fields as-is).
/// Subscription events are read-only and are rejected.
#[allow(clippy::too_many_arguments)]
pub async fn update_event(
    pool: &SqlitePool,
    bus: &EventBus,
    id: &str,
    title: Option<&str>,
    start_at: Option<&str>,
    end_at: Option<&str>,
    all_day: Option<bool>,
    location: Option<&str>,
    notes: Option<&str>,
    color: Option<&str>,
) -> Result<CalEvent> {
    let event = get_event(pool, id).await?;
    if event.subscription_id.is_some() {
        return Err(RepoError::Invalid("subscription events are read-only".into()));
    }
    let ts = now();
    let mut tx = pool.begin().await?;
    sqlx::query(
        "UPDATE cal_events SET
            title = COALESCE(?, title), start_at = COALESCE(?, start_at),
            end_at = COALESCE(?, end_at), all_day = COALESCE(?, all_day),
            location = COALESCE(?, location), notes = COALESCE(?, notes),
            color = COALESCE(?, color), updated_at = ?
         WHERE id = ?",
    )
    .bind(title)
    .bind(start_at)
    .bind(end_at)
    .bind(all_day)
    .bind(location)
    .bind(notes)
    .bind(color)
    .bind(&ts)
    .bind(id)
    .execute(&mut *tx)
    .await?;
    append_changelog(&mut tx, "cal_event", id, ChangeOp::Update, &serde_json::json!({})).await?;
    tx.commit().await?;
    bus.emit(DomainEvent::CalendarChanged);
    get_event(pool, id).await
}

pub async fn delete_event(pool: &SqlitePool, bus: &EventBus, id: &str) -> Result<()> {
    let ts = now();
    let mut tx = pool.begin().await?;
    let res = sqlx::query("UPDATE cal_events SET deleted_at = ?, updated_at = ? WHERE id = ? AND deleted_at IS NULL")
        .bind(&ts)
        .bind(&ts)
        .bind(id)
        .execute(&mut *tx)
        .await?;
    if res.rows_affected() == 0 {
        return Err(RepoError::NotFound(format!("event {id}")));
    }
    append_changelog(&mut tx, "cal_event", id, ChangeOp::Delete, &serde_json::json!({})).await?;
    tx.commit().await?;
    bus.emit(DomainEvent::CalendarChanged);
    Ok(())
}

// ---- unified range query ---------------------------------------------------

// Row shape for the event fetch: event joined to its subscription (if any).
#[derive(sqlx::FromRow)]
struct EventRow {
    id: String,
    subscription_id: Option<String>,
    title: String,
    start_at: String,
    end_at: Option<String>,
    all_day: bool,
    color: Option<String>,
    rrule: Option<String>,
    exdates_json: Option<String>,
    sub_color: Option<String>,
}

/// Compute a task's calendar placement: (start, end, all_day) or None if undated.
fn task_span(task: &Task) -> Option<(String, Option<String>, bool)> {
    match (&task.start_at, &task.due_at) {
        (Some(s), Some(d)) => Some((s.clone(), Some(d.clone()), task.is_all_day)),
        _ => {
            let point = task.due_at.as_ref().or(task.start_at.as_ref())?.clone();
            if task.is_all_day {
                Some((point, None, true))
            } else {
                let end = add_minutes(&point, task.duration_min.unwrap_or(DEFAULT_DURATION_MIN)).ok();
                Some((point, end, false))
            }
        }
    }
}

pub async fn list_calendar(
    pool: &SqlitePool,
    from: &str,
    to: &str,
    include_completed: bool,
) -> Result<Vec<CalItem>> {
    let mut items = Vec::new();

    // Tasks placed by their date.
    let statuses: &[&str] = if include_completed { &["ACTIVE", "COMPLETED"] } else { &["ACTIVE"] };
    for task in list_for_filter(pool, statuses).await? {
        let Some((start, end, all_day)) = task_span(&task) else { continue };
        if !intersects(&start, end.as_deref(), from, to) {
            continue;
        }
        items.push(CalItem {
            id: task.id.clone(),
            kind: "TASK".into(),
            source_id: task.id.clone(),
            title: task.title,
            start_at: start,
            end_at: end,
            all_day,
            color: None,
            // A recurring task advances on completion, so it is not draggable here.
            editable: task.rrule.is_none(),
        });
    }

    // Events (local + visible subscriptions), recurring ones expanded.
    let rows: Vec<EventRow> = sqlx::query_as(
        "SELECT e.id, e.subscription_id, e.title, e.start_at, e.end_at, e.all_day, e.color,
                e.rrule, e.exdates_json, s.color AS sub_color
         FROM cal_events e
         LEFT JOIN cal_subscriptions s ON s.id = e.subscription_id
         WHERE e.deleted_at IS NULL
           AND (e.subscription_id IS NULL OR (s.visible = 1 AND s.deleted_at IS NULL))",
    )
    .fetch_all(pool)
    .await?;

    for row in rows {
        let color = row.color.clone().or(row.sub_color.clone());
        let local = row.subscription_id.is_none();
        let duration = match (&row.end_at, row.all_day) {
            (Some(end), false) => (parse(end)? - parse(&row.start_at)?).num_minutes(),
            _ => 0,
        };

        if let Some(rrule) = &row.rrule {
            let exdates: Vec<String> = row
                .exdates_json
                .as_deref()
                .and_then(|j| serde_json::from_str(j).ok())
                .unwrap_or_default();
            for occ in occurrences_between(rrule, &row.start_at, from, to, None, &exdates)? {
                let end = if duration > 0 { Some(add_minutes(&occ, duration)?) } else { None };
                items.push(CalItem {
                    id: format!("{}::{}", row.id, occ),
                    kind: "EVENT".into(),
                    source_id: row.id.clone(),
                    title: row.title.clone(),
                    start_at: occ,
                    end_at: end,
                    all_day: row.all_day,
                    color: color.clone(),
                    editable: false, // recurring occurrences aren't individually editable
                });
            }
        } else if intersects(&row.start_at, row.end_at.as_deref(), from, to) {
            items.push(CalItem {
                id: row.id.clone(),
                kind: "EVENT".into(),
                source_id: row.id.clone(),
                title: row.title.clone(),
                start_at: row.start_at.clone(),
                end_at: row.end_at.clone(),
                all_day: row.all_day,
                color,
                editable: local,
            });
        }
    }

    Ok(items)
}

// ---- drag / resize / schedule ----------------------------------------------

/// Drop: move an item to a new start, shifting both task endpoints (or the
/// event's start+end) by the same delta so spans keep their length.
pub async fn move_item(
    pool: &SqlitePool,
    bus: &EventBus,
    kind: &str,
    id: &str,
    new_start: &str,
    all_day: bool,
) -> Result<()> {
    match kind {
        "TASK" => {
            let task = get_task(pool, id).await?;
            let old = task.due_at.as_deref().or(task.start_at.as_deref());
            let delta = parse(new_start)? - old.map(parse).transpose()?.unwrap_or(parse(new_start)?);
            let shift = |v: &Option<String>| -> Result<Option<Option<String>>> {
                Ok(match v {
                    Some(s) => Some(Some(fmt(parse(s)? + delta))),
                    None => None,
                })
            };
            update_task(
                pool,
                bus,
                id,
                TaskPatch {
                    start_at: shift(&task.start_at)?,
                    due_at: shift(&task.due_at)?,
                    is_all_day: Some(all_day),
                    ..Default::default()
                },
            )
            .await?;
            Ok(())
        }
        "EVENT" => {
            let event = get_event(pool, id).await?;
            let delta = parse(new_start)? - parse(&event.start_at)?;
            let new_end = match &event.end_at {
                Some(e) => Some(fmt(parse(e)? + delta)),
                None => None,
            };
            update_event(pool, bus, id, None, Some(new_start), new_end.as_deref(), Some(all_day), None, None, None)
                .await?;
            Ok(())
        }
        other => Err(RepoError::Invalid(format!("unknown calendar item kind {other:?}"))),
    }
}

/// Resize: change the item's end. For a task this sets its duration; for an
/// event it sets `end_at`.
pub async fn resize_item(
    pool: &SqlitePool,
    bus: &EventBus,
    kind: &str,
    id: &str,
    new_end: &str,
) -> Result<()> {
    match kind {
        "TASK" => {
            let task = get_task(pool, id).await?;
            let start = task.start_at.as_deref().or(task.due_at.as_deref());
            let minutes = match start {
                Some(s) => (parse(new_end)? - parse(s)?).num_minutes().max(0),
                None => DEFAULT_DURATION_MIN,
            };
            update_task(pool, bus, id, TaskPatch { duration_min: Some(Some(minutes)), ..Default::default() })
                .await?;
            Ok(())
        }
        "EVENT" => {
            update_event(pool, bus, id, None, None, Some(new_end), None, None, None, None).await?;
            Ok(())
        }
        other => Err(RepoError::Invalid(format!("unknown calendar item kind {other:?}"))),
    }
}

/// Schedule an unscheduled task dropped onto the grid from the arrange panel.
pub async fn schedule_task(
    pool: &SqlitePool,
    bus: &EventBus,
    task_id: &str,
    start_at: &str,
    all_day: bool,
    duration_min: Option<i64>,
) -> Result<()> {
    update_task(
        pool,
        bus,
        task_id,
        TaskPatch {
            due_at: Some(Some(start_at.to_string())),
            is_all_day: Some(all_day),
            duration_min: Some(duration_min),
            ..Default::default()
        },
    )
    .await?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::repo::db::connect_in_memory;
    use crate::repo::tasks::tests::quick;
    use crate::repo::tasks::{create_task, NewTask};

    async fn setup() -> (SqlitePool, EventBus) {
        (connect_in_memory().await.unwrap(), EventBus::new())
    }

    const FROM: &str = "2026-03-01T00:00:00.000Z";
    const TO: &str = "2026-03-31T23:59:59.000Z";

    fn ev(title: &str, start: &str) -> NewEvent {
        NewEvent {
            title: title.into(),
            start_at: start.into(),
            end_at: None,
            all_day: true,
            location: None,
            notes: None,
            color: None,
            rrule: None,
        }
    }

    #[tokio::test]
    async fn local_event_and_dated_task_appear_in_range() {
        let (pool, bus) = setup().await;
        create_event(&pool, &bus, ev("Sprint demo", "2026-03-10T00:00:00.000Z")).await.unwrap();
        create_task(
            &pool,
            &bus,
            NewTask { due_at: Some("2026-03-12T00:00:00.000Z".into()), ..quick("inbox", "ship it") },
        )
        .await
        .unwrap();
        // A task well outside the window is excluded.
        create_task(
            &pool,
            &bus,
            NewTask { due_at: Some("2026-06-01T00:00:00.000Z".into()), ..quick("inbox", "later") },
        )
        .await
        .unwrap();

        let items = list_calendar(&pool, FROM, TO, false).await.unwrap();
        let titles: Vec<&str> = items.iter().map(|i| i.title.as_str()).collect();
        assert!(titles.contains(&"Sprint demo"));
        assert!(titles.contains(&"ship it"));
        assert!(!titles.contains(&"later"));
    }

    #[tokio::test]
    async fn recurring_event_expands_to_occurrences() {
        let (pool, bus) = setup().await;
        let mut weekly = ev("Standup", "2026-03-02T09:00:00.000Z");
        weekly.all_day = false;
        weekly.end_at = Some("2026-03-02T09:15:00.000Z".into());
        weekly.rrule = Some("FREQ=WEEKLY;BYDAY=MO".into());
        create_event(&pool, &bus, weekly).await.unwrap();

        let standups: Vec<_> = list_calendar(&pool, FROM, TO, false)
            .await
            .unwrap()
            .into_iter()
            .filter(|i| i.title == "Standup")
            .collect();
        assert_eq!(standups.len(), 5); // 5 Mondays in March 2026
        assert!(standups.iter().all(|i| !i.editable)); // occurrences read-only
        assert!(standups[0].id.contains("::"));
    }

    #[tokio::test]
    async fn move_item_shifts_a_task_date() {
        let (pool, bus) = setup().await;
        let task = create_task(
            &pool,
            &bus,
            NewTask { due_at: Some("2026-03-10T00:00:00.000Z".into()), ..quick("inbox", "movable") },
        )
        .await
        .unwrap();

        move_item(&pool, &bus, "TASK", &task.id, "2026-03-15T00:00:00.000Z", true).await.unwrap();
        assert_eq!(
            get_task(&pool, &task.id).await.unwrap().due_at.as_deref(),
            Some("2026-03-15T00:00:00.000Z")
        );
    }

    #[tokio::test]
    async fn schedule_task_sets_due_date() {
        let (pool, bus) = setup().await;
        let task = create_task(&pool, &bus, quick("inbox", "unscheduled")).await.unwrap();
        schedule_task(&pool, &bus, &task.id, "2026-03-20T14:00:00.000Z", false, Some(30)).await.unwrap();

        let t = get_task(&pool, &task.id).await.unwrap();
        assert_eq!(t.due_at.as_deref(), Some("2026-03-20T14:00:00.000Z"));
        assert!(!t.is_all_day);
        assert_eq!(t.duration_min, Some(30));
    }

    #[tokio::test]
    async fn subscription_events_are_read_only() {
        let (pool, bus) = setup().await;
        let event = create_event(&pool, &bus, ev("local", "2026-03-05T00:00:00.000Z")).await.unwrap();
        // Pretend it belongs to a subscription (insert one to satisfy the FK).
        let ts = now();
        sqlx::query(
            "INSERT INTO cal_subscriptions (id, url, name, created_at, updated_at)
             VALUES ('sub-1', 'https://example.com/f.ics', 'Feed', ?, ?)",
        )
        .bind(&ts)
        .bind(&ts)
        .execute(&pool)
        .await
        .unwrap();
        sqlx::query("UPDATE cal_events SET subscription_id = 'sub-1' WHERE id = ?")
            .bind(&event.id)
            .execute(&pool)
            .await
            .unwrap();
        assert!(matches!(
            update_event(&pool, &bus, &event.id, Some("hacked"), None, None, None, None, None, None).await,
            Err(RepoError::Invalid(_))
        ));
    }
}
