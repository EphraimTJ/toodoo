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
    /// Delivery attempts already made for this fire time (0 = never tried).
    pub fire_attempts: i64,
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
    fire_attempts: i64,
    fire_claimed_at: Option<String>,
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

/// Seconds that must elapse after the `attempts`-th failed/interrupted attempt
/// before the next one (bounded backoff, tick-granular; the scheduler polls
/// every 30 s). Also serves as the stale-claim recovery window: a claim whose
/// holder crashed becomes reclaimable after this delay.
fn backoff_secs(attempts: i64) -> i64 {
    match attempts {
        i64::MIN..=1 => 30,
        2 => 60,
        3 => 120,
        _ => 300,
    }
}

/// Total delivery attempts before a reminder is acknowledged anyway (with a
/// logged warning) so a permanently-broken native path can't nag forever —
/// the in-app toast already fired on the first attempt.
pub const MAX_FIRE_ATTEMPTS: i64 = 5;

/// Reminders whose fire time has arrived (`<= now`), that have not already
/// fired at that time, and that are not inside a claim/backoff window. Only
/// ACTIVE, non-deleted tasks are considered — a completed or trashed task
/// never nags. Drives both the periodic tick and the "missed while closed"
/// startup catch-up.
pub async fn due_reminders(pool: &SqlitePool, now_instant: DateTime<Utc>) -> Result<Vec<DueReminder>> {
    let rows: Vec<ScanRow> = sqlx::query_as(
        "SELECT r.id AS reminder_id, r.task_id AS task_id, r.trigger_kind, r.at,
                r.offset_min, r.snoozed_until, r.last_fired_at,
                r.fire_attempts, r.fire_claimed_at,
                t.title AS task_title, t.start_at, t.due_at, t.is_all_day, t.time_zone
         FROM reminders r JOIN tasks t ON t.id = r.task_id
         WHERE r.deleted_at IS NULL AND t.deleted_at IS NULL AND t.status = 'ACTIVE'",
    )
    .fetch_all(pool)
    .await?;

    let mut due = Vec::new();
    for row in &rows {
        let Some(fire) = fire_at(row) else {
            // Diagnosis aid: this reminder exists but can never fire (e.g. a
            // REL trigger on a task with no due/start anchor).
            log::warn!(
                "[reminders] skip: reminder {} (task {:?}) has no computable fire time",
                row.reminder_id, row.task_title
            );
            continue;
        };
        if fire > now_instant {
            continue;
        }
        // Already fired at (or after) this fire time? Skip.
        if let Some(last) = row.last_fired_at.as_deref().and_then(parse_utc) {
            if last >= fire {
                continue;
            }
        }
        // Inside an active claim or its backoff window? Not yet retryable.
        if let Some(claimed) = row.fire_claimed_at.as_deref().and_then(parse_utc) {
            if now_instant < claimed + Duration::seconds(backoff_secs(row.fire_attempts)) {
                continue;
            }
        }
        due.push(DueReminder {
            reminder_id: row.reminder_id.clone(),
            task_id: row.task_id.clone(),
            task_title: row.task_title.clone(),
            fire_at: fire.to_rfc3339_opts(chrono::SecondsFormat::Millis, true),
            fire_attempts: row.fire_attempts,
        });
    }
    Ok(due)
}

/// Ack: record the successful (or given-up) delivery and clear the claim state
/// so the next fire time starts with a fresh attempt budget.
pub async fn mark_fired(pool: &SqlitePool, reminder_id: &str, at: &str) -> Result<()> {
    sqlx::query(
        "UPDATE reminders
         SET last_fired_at = ?, fire_claimed_at = NULL, fire_attempts = 0, updated_at = ?
         WHERE id = ?",
    )
    .bind(at)
    .bind(now())
    .bind(reminder_id)
    .execute(pool)
    .await?;
    Ok(())
}

/// Persist a dispatch claim before attempting delivery: stamps
/// `fire_claimed_at` and increments `fire_attempts`, but only if no other
/// claim is inside its backoff window (lexicographic compare is sound — all
/// timestamps are RFC3339-millis UTC). Returns the attempt number (1-based),
/// or `None` if the claim was lost.
async fn claim(
    pool: &SqlitePool,
    reminder_id: &str,
    now_instant: DateTime<Utc>,
    prior_attempts: i64,
) -> Result<Option<i64>> {
    let now_s = now_instant.to_rfc3339_opts(chrono::SecondsFormat::Millis, true);
    let cutoff = (now_instant - Duration::seconds(backoff_secs(prior_attempts)))
        .to_rfc3339_opts(chrono::SecondsFormat::Millis, true);
    let res = sqlx::query(
        "UPDATE reminders
         SET fire_claimed_at = ?, fire_attempts = fire_attempts + 1, updated_at = ?
         WHERE id = ? AND (fire_claimed_at IS NULL OR fire_claimed_at <= ?)",
    )
    .bind(&now_s)
    .bind(&now_s)
    .bind(reminder_id)
    .bind(&cutoff)
    .execute(pool)
    .await?;
    if res.rows_affected() == 0 {
        return Ok(None);
    }
    let attempts: i64 = sqlx::query_scalar("SELECT fire_attempts FROM reminders WHERE id = ?")
        .bind(reminder_id)
        .fetch_one(pool)
        .await?;
    Ok(Some(attempts))
}

/// Native delivery hook, injectable so the claim/ack state machine is
/// unit-testable without the OS notification API.
pub trait NotificationBackend: Send + Sync {
    fn show(&self, title: &str, body: &str) -> std::result::Result<(), String>;
}

/// One reminder's dispatch result for this tick — the caller (the Tauri
/// scheduler) emits the in-app toast/bus events from it.
pub struct DispatchOutcome {
    pub reminder: DueReminder,
    /// First delivery attempt for this fire time — emit the in-app toast
    /// exactly once, on this attempt (it does not depend on native success).
    pub first_attempt: bool,
    pub delivered: bool,
    pub gave_up: bool,
}

/// Claim-before-attempt / ack-only-on-success dispatch pass
/// (docs/decisions.md): for each due reminder, persist a claim, attempt native
/// delivery, and ack (`mark_fired`) only when `show()` succeeded — a transient
/// failure keeps the reminder retryable with bounded backoff, and after
/// `MAX_FIRE_ATTEMPTS` it is acked anyway so it can't nag forever. A crash
/// between claim and ack recovers via the stale-claim window (one possible
/// duplicate, never a loss).
pub async fn dispatch_due(
    pool: &SqlitePool,
    backend: &dyn NotificationBackend,
    now_instant: DateTime<Utc>,
) -> Result<Vec<DispatchOutcome>> {
    let due = due_reminders(pool, now_instant).await?;
    log::info!("[reminders] poll @ {}: {} due", now_instant.to_rfc3339(), due.len());
    let mut outcomes = Vec::new();
    for r in due {
        let Some(attempts) = claim(pool, &r.reminder_id, now_instant, r.fire_attempts).await? else {
            continue;
        };
        log::info!(
            "[reminders] dispatch notification (attempt {attempts}): reminder={} task={} title={:?}",
            r.reminder_id, r.task_id, r.task_title
        );
        let (delivered, gave_up) = match backend.show("Toodoo", &r.task_title) {
            Ok(()) => {
                log::info!("[reminders] notification.show() ok");
                mark_fired(pool, &r.reminder_id, &r.fire_at).await?;
                (true, false)
            }
            Err(e) if attempts >= MAX_FIRE_ATTEMPTS => {
                log::error!(
                    "[reminders] notification.show() FAILED: {e} — giving up after {attempts} attempts (acking; the in-app toast already fired)"
                );
                mark_fired(pool, &r.reminder_id, &r.fire_at).await?;
                (false, true)
            }
            Err(e) => {
                log::warn!(
                    "[reminders] notification.show() FAILED: {e} — will retry in {}s",
                    backoff_secs(attempts)
                );
                // Claim + attempt count stay: the reminder re-enters the due
                // set once the backoff window elapses.
                (false, false)
            }
        };
        outcomes.push(DispatchOutcome { first_attempt: attempts == 1, reminder: r, delivered, gave_up });
    }
    Ok(outcomes)
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
    // A snooze moves the fire time, so the new time gets a fresh attempt budget.
    sqlx::query(
        "UPDATE reminders
         SET snoozed_until = ?, fire_claimed_at = NULL, fire_attempts = 0, updated_at = ?
         WHERE id = ?",
    )
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

    // ---- Claim/ack dispatch state machine ----------------------------------

    /// Scripted backend: pops one result per show() call; empty = always Ok.
    struct Script(std::sync::Mutex<Vec<std::result::Result<(), String>>>);
    impl Script {
        fn failing_times(n: usize) -> Self {
            Script(std::sync::Mutex::new(vec![Err("boom".to_string()); n]))
        }
        fn always_ok() -> Self {
            Script(std::sync::Mutex::new(Vec::new()))
        }
    }
    impl NotificationBackend for Script {
        fn show(&self, _title: &str, _body: &str) -> std::result::Result<(), String> {
            let mut queue = self.0.lock().unwrap();
            if queue.is_empty() { Ok(()) } else { queue.remove(0) }
        }
    }

    #[tokio::test]
    async fn dispatch_success_acks_once_and_never_refires() {
        let (pool, bus) = setup().await;
        let task = timed_task(&pool, &bus, "2026-03-10T17:00:00.000Z").await;
        add_reminder(&pool, &bus, &task, "ABS", Some("2026-03-10T08:00:00.000Z"), None).await.unwrap();

        let ok = Script::always_ok();
        let outcomes = dispatch_due(&pool, &ok, t("2026-03-10T08:00:00Z")).await.unwrap();
        assert_eq!(outcomes.len(), 1);
        assert!(outcomes[0].delivered && outcomes[0].first_attempt && !outcomes[0].gave_up);

        // Acked: later ticks see nothing due, and the attempt budget is reset.
        assert!(dispatch_due(&pool, &ok, t("2026-03-10T08:00:30Z")).await.unwrap().is_empty());
        let (attempts, claimed): (i64, Option<String>) =
            sqlx::query_as("SELECT fire_attempts, fire_claimed_at FROM reminders")
                .fetch_one(&pool)
                .await
                .unwrap();
        assert_eq!((attempts, claimed), (0, None));
    }

    #[tokio::test]
    async fn dispatch_failure_retries_after_backoff_then_acks() {
        let (pool, bus) = setup().await;
        let task = timed_task(&pool, &bus, "2026-03-10T17:00:00.000Z").await;
        add_reminder(&pool, &bus, &task, "ABS", Some("2026-03-10T08:00:00.000Z"), None).await.unwrap();

        let backend = Script::failing_times(1);
        let first = dispatch_due(&pool, &backend, t("2026-03-10T08:00:00Z")).await.unwrap();
        assert_eq!(first.len(), 1);
        assert!(first[0].first_attempt && !first[0].delivered && !first[0].gave_up);

        // Inside the 30s backoff window: nothing is attempted.
        assert!(dispatch_due(&pool, &backend, t("2026-03-10T08:00:10Z")).await.unwrap().is_empty());

        // After the window: retried (not a first attempt — no second in-app
        // toast) and delivered, which acks it.
        let retry = dispatch_due(&pool, &backend, t("2026-03-10T08:00:31Z")).await.unwrap();
        assert_eq!(retry.len(), 1);
        assert!(!retry[0].first_attempt && retry[0].delivered);
        assert!(dispatch_due(&pool, &backend, t("2026-03-10T08:01:31Z")).await.unwrap().is_empty());
    }

    #[tokio::test]
    async fn dispatch_gives_up_after_bounded_attempts() {
        let (pool, bus) = setup().await;
        let task = timed_task(&pool, &bus, "2026-03-10T17:00:00.000Z").await;
        add_reminder(&pool, &bus, &task, "ABS", Some("2026-03-10T08:00:00.000Z"), None).await.unwrap();

        let backend = Script::failing_times(100); // never succeeds
        // Walk the backoff schedule: 30s, 60s, 120s, 300s between attempts.
        let ticks =
            ["08:00:00Z", "08:00:31Z", "08:01:32Z", "08:03:33Z", "08:08:34Z"].map(|s| t(&format!("2026-03-10T{s}")));
        let mut last = Vec::new();
        for now_i in ticks {
            last = dispatch_due(&pool, &backend, now_i).await.unwrap();
            assert_eq!(last.len(), 1, "attempt expected at {now_i}");
        }
        // The 5th failure gives up: acked with a warning, no further attempts.
        assert!(last[0].gave_up && !last[0].delivered);
        assert!(dispatch_due(&pool, &backend, t("2026-03-10T09:00:00Z")).await.unwrap().is_empty());
    }

    #[tokio::test]
    async fn stale_claim_from_a_crash_recovers() {
        let (pool, bus) = setup().await;
        let task = timed_task(&pool, &bus, "2026-03-10T17:00:00.000Z").await;
        let r = add_reminder(&pool, &bus, &task, "ABS", Some("2026-03-10T08:00:00.000Z"), None)
            .await
            .unwrap();
        // Simulate a crash between claim and ack: claim stamped, never acked.
        sqlx::query("UPDATE reminders SET fire_claimed_at = '2026-03-10T08:00:00.000Z', fire_attempts = 1 WHERE id = ?")
            .bind(&r.id)
            .execute(&pool)
            .await
            .unwrap();

        let ok = Script::always_ok();
        // Within the claim window: held.
        assert!(dispatch_due(&pool, &ok, t("2026-03-10T08:00:15Z")).await.unwrap().is_empty());
        // After it: reclaimed and delivered (a duplicate at worst, never lost).
        let out = dispatch_due(&pool, &ok, t("2026-03-10T08:00:31Z")).await.unwrap();
        assert_eq!(out.len(), 1);
        assert!(out[0].delivered && !out[0].first_attempt);
    }

    #[tokio::test]
    async fn snooze_resets_the_attempt_budget() {
        let (pool, bus) = setup().await;
        let task = timed_task(&pool, &bus, "2026-03-10T17:00:00.000Z").await;
        let r = add_reminder(&pool, &bus, &task, "ABS", Some("2026-03-10T08:00:00.000Z"), None)
            .await
            .unwrap();
        let failing = Script::failing_times(10);
        dispatch_due(&pool, &failing, t("2026-03-10T08:00:00Z")).await.unwrap();

        snooze(&pool, &bus, &r.id, "2026-03-10T08:10:00.000Z").await.unwrap();
        let (attempts, claimed): (i64, Option<String>) =
            sqlx::query_as("SELECT fire_attempts, fire_claimed_at FROM reminders WHERE id = ?")
                .bind(&r.id)
                .fetch_one(&pool)
                .await
                .unwrap();
        assert_eq!((attempts, claimed), (0, None));
        // The snoozed time fires as a fresh first attempt.
        let out = dispatch_due(&pool, &Script::always_ok(), t("2026-03-10T08:10:00Z")).await.unwrap();
        assert_eq!(out.len(), 1);
        assert!(out[0].first_attempt && out[0].delivered);
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
