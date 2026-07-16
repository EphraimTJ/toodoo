//! Statistics & gamification. An event-sourced achievement score (the
//! `achievements` ledger) plus weekly/monthly summaries derived from the
//! `task_completions` ledger and `focus_sessions`. Points are awarded inline
//! from `tasks::complete_task`; overdue penalties come from a daily scheduler
//! pass (docs/decisions.md). The scoring is pure and unit-tested.

use chrono::{DateTime, Datelike, Duration, Timelike, Utc};
use serde::Serialize;
use sqlx::{SqliteConnection, SqlitePool};

use crate::error::Result;

use super::{new_id, now};

/// (min score, title) tiers, ascending.
const TIERS: [(i64, &str); 5] =
    [(0, "Novice"), (100, "Rising"), (500, "Focused"), (2000, "Pro"), (10000, "Master")];

const OVERDUE_DAILY_CAP: i64 = 3;

// ---- pure scoring ----------------------------------------------------------

/// Points for completing a task: no due date → 1; done on or before the due day
/// → 2; late → 1. Day-granular so an all-day task finished on its due day counts
/// as on-time.
pub fn completion_points(due_at: Option<&str>, completed_at: &str) -> i64 {
    match due_at {
        None => 1,
        Some(due) => {
            let done = completed_at.get(0..10);
            let due = due.get(0..10);
            match (done, due) {
                (Some(d), Some(u)) if d <= u => 2,
                _ => 1,
            }
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Level {
    pub level: i64,
    pub title: String,
    pub base: i64,
    pub next: Option<i64>,
}

/// The tier a cumulative score falls in.
pub fn level_for(score: i64) -> Level {
    let mut idx = 0;
    for (i, (threshold, _)) in TIERS.iter().enumerate() {
        if score >= *threshold {
            idx = i;
        }
    }
    let (base, title) = TIERS[idx];
    Level { level: idx as i64 + 1, title: title.into(), base, next: TIERS.get(idx + 1).map(|(t, _)| *t) }
}

// ---- achievements ledger ---------------------------------------------------

async fn insert_achievement(conn: &mut SqliteConnection, date: &str, delta: i64, reason: &str) -> Result<()> {
    let ts = now();
    sqlx::query(
        "INSERT INTO achievements (id, date, score_delta, reason, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)",
    )
    .bind(new_id())
    .bind(date)
    .bind(delta)
    .bind(reason)
    .bind(&ts)
    .bind(&ts)
    .execute(conn)
    .await?;
    Ok(())
}

/// Award points for a completion (called inside `complete_task`'s transaction).
/// The ledger row is dated in the user's local time (`tz_off_min`), so it lines
/// up with the local date ranges the stats views query by.
pub async fn award_completion(
    conn: &mut SqliteConnection,
    due_at: Option<&str>,
    completed_at: &str,
    tz_off_min: i32,
) -> Result<()> {
    let date = local(completed_at, tz_off_min)
        .map(|d| d.format("%Y-%m-%d").to_string())
        .unwrap_or_else(|| completed_at.get(0..10).unwrap_or_default().to_string());
    insert_achievement(conn, &date, completion_points(due_at, completed_at), "completed").await
}

/// Deduct for tasks overdue as of `today`, once per task per day, capped at the
/// daily limit. Idempotent (a task already penalized today is skipped).
pub async fn overdue_penalty_pass(pool: &SqlitePool, today: &str) -> Result<()> {
    let already: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM achievements WHERE date = ? AND reason LIKE 'overdue:%'",
    )
    .bind(today)
    .fetch_one(pool)
    .await?;
    let mut budget = OVERDUE_DAILY_CAP - already;
    if budget <= 0 {
        return Ok(());
    }

    let overdue: Vec<String> = sqlx::query_scalar(
        "SELECT id FROM tasks
         WHERE status = 'ACTIVE' AND kind <> 'NOTE' AND deleted_at IS NULL
           AND due_at IS NOT NULL AND substr(due_at, 1, 10) < ?
         ORDER BY due_at",
    )
    .bind(today)
    .fetch_all(pool)
    .await?;

    let mut conn = pool.acquire().await?;
    for id in overdue {
        if budget <= 0 {
            break;
        }
        let reason = format!("overdue:{id}");
        let exists: bool = sqlx::query_scalar(
            "SELECT EXISTS(SELECT 1 FROM achievements WHERE date = ? AND reason = ?)",
        )
        .bind(today)
        .bind(&reason)
        .fetch_one(&mut *conn)
        .await?;
        if exists {
            continue;
        }
        insert_achievement(&mut conn, today, -1, &reason).await?;
        budget -= 1;
    }
    Ok(())
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AchievementInfo {
    pub score: i64,
    pub level: i64,
    pub title: String,
    pub base: i64,
    pub next: Option<i64>,
}

pub async fn achievement_info(pool: &SqlitePool) -> Result<AchievementInfo> {
    let score: i64 =
        sqlx::query_scalar("SELECT COALESCE(SUM(score_delta), 0) FROM achievements WHERE deleted_at IS NULL")
            .fetch_one(pool)
            .await?;
    let lv = level_for(score);
    Ok(AchievementInfo { score, level: lv.level, title: lv.title, base: lv.base, next: lv.next })
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ScorePoint {
    pub date: String,
    pub delta: i64,
    pub cumulative: i64,
}

pub async fn score_history(pool: &SqlitePool, from: &str, to: &str) -> Result<Vec<ScorePoint>> {
    let before: i64 = sqlx::query_scalar(
        "SELECT COALESCE(SUM(score_delta), 0) FROM achievements WHERE date < ? AND deleted_at IS NULL",
    )
    .bind(from)
    .fetch_one(pool)
    .await?;
    let rows: Vec<(String, i64)> = sqlx::query_as(
        "SELECT date, SUM(score_delta) FROM achievements
         WHERE date >= ? AND date <= ? AND deleted_at IS NULL GROUP BY date ORDER BY date",
    )
    .bind(from)
    .bind(to)
    .fetch_all(pool)
    .await?;
    let mut cum = before;
    Ok(rows
        .into_iter()
        .map(|(date, delta)| {
            cum += delta;
            ScorePoint { date, delta, cumulative: cum }
        })
        .collect())
}

// ---- summary ---------------------------------------------------------------

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DayCount {
    pub date: String,
    pub count: i64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Summary {
    pub completed_count: i64,
    pub completion_rate: f64,
    pub focus_ms: i64,
    pub per_day: Vec<DayCount>,
    pub weekday: Vec<i64>, // 0=Mon .. 6=Sun
    pub hour: Vec<i64>,    // 0..23
    pub late_count: i64,
    pub overdue_count: i64,
}

fn local(iso: &str, tz_off_min: i32) -> Option<DateTime<Utc>> {
    DateTime::parse_from_rfc3339(iso)
        .ok()
        .map(|d| d.with_timezone(&Utc) + Duration::minutes(tz_off_min as i64))
}

#[derive(sqlx::FromRow)]
struct CompletionRow {
    occurrence_at: Option<String>,
    completed_at: String,
}

/// Weekly/monthly summary over the local date range `[from, to]` (YYYY-MM-DD).
pub async fn summary(pool: &SqlitePool, from: &str, to: &str, tz_off_min: i32) -> Result<Summary> {
    // Fetch a UTC window one day wider on each side, then bucket by *local* date
    // so a completion is attributed to the local day the user experienced (the
    // range and heatmaps are all local; `from`/`to` are local YYYY-MM-DD).
    let rows: Vec<CompletionRow> = sqlx::query_as(
        "SELECT occurrence_at, completed_at FROM task_completions
         WHERE status = 'COMPLETED' AND deleted_at IS NULL
           AND date(substr(completed_at, 1, 10)) >= date(?, '-1 day')
           AND date(substr(completed_at, 1, 10)) <= date(?, '+1 day')",
    )
    .bind(from)
    .bind(to)
    .fetch_all(pool)
    .await?;

    let mut completed_count = 0;
    let mut per_day: std::collections::BTreeMap<String, i64> = std::collections::BTreeMap::new();
    let mut weekday = vec![0i64; 7];
    let mut hour = vec![0i64; 24];
    let mut late_count = 0;
    for r in &rows {
        let Some(dt) = local(&r.completed_at, tz_off_min) else { continue };
        let local_day = dt.format("%Y-%m-%d").to_string();
        if local_day.as_str() < from || local_day.as_str() > to {
            continue;
        }
        completed_count += 1;
        *per_day.entry(local_day).or_default() += 1;
        weekday[dt.weekday().num_days_from_monday() as usize] += 1;
        hour[dt.hour() as usize] += 1;
        if let Some(occ) = &r.occurrence_at {
            if r.completed_at.get(0..10) > occ.get(0..10) {
                late_count += 1;
            }
        }
    }

    // Completion rate: completed ÷ tasks whose due date is in the period.
    let due_in_period: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM tasks WHERE kind <> 'NOTE' AND deleted_at IS NULL
           AND due_at IS NOT NULL AND substr(due_at, 1, 10) >= ? AND substr(due_at, 1, 10) <= ?",
    )
    .bind(from)
    .bind(to)
    .fetch_one(pool)
    .await?;
    let completed_due: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM tasks WHERE kind <> 'NOTE' AND deleted_at IS NULL AND status = 'COMPLETED'
           AND due_at IS NOT NULL AND substr(due_at, 1, 10) >= ? AND substr(due_at, 1, 10) <= ?",
    )
    .bind(from)
    .bind(to)
    .fetch_one(pool)
    .await?;
    let completion_rate = if due_in_period > 0 { completed_due as f64 / due_in_period as f64 } else { 0.0 };

    let overdue_count: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM tasks WHERE status = 'ACTIVE' AND kind <> 'NOTE' AND deleted_at IS NULL
           AND due_at IS NOT NULL AND substr(due_at, 1, 10) < ?",
    )
    .bind(to)
    .fetch_one(pool)
    .await?;

    let focus_ms = super::focus::focus_stats(
        pool,
        &format!("{from}T00:00:00.000Z"),
        &format!("{to}T23:59:59.999Z"),
        tz_off_min,
    )
    .await?
    .total_ms;

    Ok(Summary {
        completed_count,
        completion_rate,
        focus_ms,
        per_day: per_day.into_iter().map(|(date, count)| DayCount { date, count }).collect(),
        weekday,
        hour,
        late_count,
        overdue_count,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::repo::db::connect_in_memory;

    #[test]
    fn completion_points_on_time_late_and_no_due() {
        assert_eq!(completion_points(None, "2026-03-10T12:00:00.000Z"), 1);
        assert_eq!(completion_points(Some("2026-03-10T00:00:00.000Z"), "2026-03-10T20:00:00.000Z"), 2);
        assert_eq!(completion_points(Some("2026-03-10T00:00:00.000Z"), "2026-03-11T09:00:00.000Z"), 1);
    }

    #[test]
    fn level_tiers() {
        assert_eq!(level_for(0).title, "Novice");
        assert_eq!(level_for(0).next, Some(100));
        assert_eq!(level_for(250).title, "Rising");
        assert_eq!(level_for(250).base, 100);
        assert_eq!(level_for(2000).title, "Pro");
        assert_eq!(level_for(10_000).next, None);
    }

    async fn award(pool: &SqlitePool, due: Option<&str>, completed: &str) {
        let mut conn = pool.acquire().await.unwrap();
        award_completion(&mut conn, due, completed, 0).await.unwrap();
    }

    #[tokio::test]
    async fn awarding_bumps_the_score() {
        let pool = connect_in_memory().await.unwrap();
        award(&pool, Some("2026-03-10T00:00:00.000Z"), "2026-03-10T09:00:00.000Z").await; // +2
        award(&pool, None, "2026-03-11T09:00:00.000Z").await; // +1
        let info = achievement_info(&pool).await.unwrap();
        assert_eq!(info.score, 3);
        assert_eq!(info.title, "Novice");
    }

    #[tokio::test]
    async fn overdue_pass_caps_and_is_idempotent() {
        let pool = connect_in_memory().await.unwrap();
        let bus = crate::events::EventBus::new();
        // 5 overdue tasks; the cap is 3/day.
        for i in 0..5 {
            crate::repo::tasks::create_task(
                &pool,
                &bus,
                crate::repo::tasks::NewTask {
                    due_at: Some("2026-03-01T00:00:00.000Z".into()),
                    ..crate::repo::tasks::tests::quick("inbox", &format!("late {i}"))
                },
            )
            .await
            .unwrap();
        }
        overdue_penalty_pass(&pool, "2026-03-10").await.unwrap();
        assert_eq!(achievement_info(&pool).await.unwrap().score, -3);
        // Running again the same day adds nothing.
        overdue_penalty_pass(&pool, "2026-03-10").await.unwrap();
        assert_eq!(achievement_info(&pool).await.unwrap().score, -3);
    }

    #[tokio::test]
    async fn summary_counts_completions_rate_and_heatmaps() {
        let pool = connect_in_memory().await.unwrap();
        let bus = crate::events::EventBus::new();
        let task = crate::repo::tasks::create_task(&pool, &bus, crate::repo::tasks::tests::quick("inbox", "t"))
            .await
            .unwrap();
        let ts = now();
        // Two completions on 2026-03-02 (a Monday), one late.
        for (occ, done) in [
            ("2026-03-02T00:00:00.000Z", "2026-03-02T10:00:00.000Z"),
            ("2026-03-01T00:00:00.000Z", "2026-03-02T14:00:00.000Z"), // late (occ before done)
        ] {
            sqlx::query(
                "INSERT INTO task_completions (id, task_id, occurrence_at, completed_at, status, created_at, updated_at)
                 VALUES (?, ?, ?, ?, 'COMPLETED', ?, ?)",
            )
            .bind(new_id())
            .bind(&task.id)
            .bind(occ)
            .bind(done)
            .bind(&ts)
            .bind(&ts)
            .execute(&pool)
            .await
            .unwrap();
        }
        let s = summary(&pool, "2026-03-01", "2026-03-07", 0).await.unwrap();
        assert_eq!(s.completed_count, 2);
        assert_eq!(s.late_count, 1);
        assert_eq!(s.weekday[0], 2); // both on Monday
        assert_eq!(s.hour[10], 1);
        assert_eq!(s.hour[14], 1);
        assert_eq!(s.per_day.len(), 1);
    }
}
