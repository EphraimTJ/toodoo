//! Habits: check-in tracking, streaks, and stats. The streak/scheduling math is
//! pure (no DB) so it is exhaustively unit-testable; the repo layer stores
//! habits + check-ins and calls into it. A Skip is neutral (preserves a streak
//! without extending it); daily/weekday habits streak on consecutive scheduled
//! days done, while "X per week/month" habits streak on consecutive periods that
//! met their target (docs/decisions.md).

use std::collections::HashMap;

use chrono::{DateTime, Datelike, Duration, NaiveDate, Utc};
use serde::{Deserialize, Serialize};
use sqlx::SqlitePool;

use crate::error::{RepoError, Result};
use crate::events::{DomainEvent, EventBus};

use super::{append_changelog, new_id, now, ChangeOp};

// ---- frequency + pure logic ------------------------------------------------

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum Freq {
    Daily,
    Weekdays { days: Vec<u32> }, // ISO 1=Mon..7=Sun
    Weekly { times: u32 },
    Monthly { times: u32 },
}

pub fn parse_freq(json: &str) -> Result<Freq> {
    serde_json::from_str(json).map_err(|e| RepoError::Invalid(format!("bad habit freq: {e}")))
}

fn date_str(d: NaiveDate) -> String {
    d.format("%Y-%m-%d").to_string()
}

fn parse_date(s: &str) -> Option<NaiveDate> {
    NaiveDate::parse_from_str(s, "%Y-%m-%d").ok()
}

/// Is `date` a candidate day for this habit? Weekly/monthly habits are candidates
/// every day (the target is a per-period count); weekday habits only on their
/// listed weekdays.
pub fn is_scheduled(freq: &Freq, date: NaiveDate) -> bool {
    match freq {
        Freq::Daily | Freq::Weekly { .. } | Freq::Monthly { .. } => true,
        Freq::Weekdays { days } => days.contains(&date.weekday().number_from_monday()),
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Streak {
    pub current: u32,
    pub best: u32,
}

/// A period index that increases by 1 each week/month, for grouping.
fn period_index(freq: &Freq, date: NaiveDate) -> i32 {
    match freq {
        Freq::Monthly { .. } => date.year() * 12 + date.month() as i32 - 1,
        // ISO-week: Mondays are 7 days apart, so the Monday's day-number / 7 is a
        // stable, monotonic week index.
        _ => {
            let monday = date - Duration::days((date.weekday().number_from_monday() - 1) as i64);
            monday.num_days_from_ce().div_euclid(7)
        }
    }
}

/// Current and best streak. `today` is the observer's local date.
pub fn streak(freq: &Freq, marks: &[(String, String)], today: NaiveDate) -> Streak {
    let by_date: HashMap<NaiveDate, &str> = marks
        .iter()
        .filter_map(|(d, s)| parse_date(d).map(|d| (d, s.as_str())))
        .collect();
    if by_date.is_empty() {
        return Streak { current: 0, best: 0 };
    }
    let start = *by_date.keys().min().unwrap();

    match freq {
        Freq::Weekly { times } | Freq::Monthly { times } => {
            streak_periodic(freq, &by_date, start, today, *times)
        }
        _ => streak_daily(freq, &by_date, start, today),
    }
}

/// `Some(true)` = counts, `Some(false)` = miss (breaks), `None` = neutral (skip
/// or grace).
fn satisfied(status: Option<&str>) -> Option<bool> {
    match status {
        Some("DONE") => Some(true),
        Some("SKIP") => None,
        _ => Some(false),
    }
}

fn streak_daily(
    freq: &Freq,
    by_date: &HashMap<NaiveDate, &str>,
    start: NaiveDate,
    today: NaiveDate,
) -> Streak {
    // Sequence of satisfied-ness over scheduled days, ascending.
    let mut seq: Vec<(NaiveDate, Option<bool>)> = Vec::new();
    let mut d = start;
    while d <= today {
        if is_scheduled(freq, d) {
            seq.push((d, satisfied(by_date.get(&d).copied())));
        }
        d += Duration::days(1);
    }
    // Grace: a still-missing *today* neither counts nor breaks.
    if let Some(last) = seq.last_mut() {
        if last.0 == today && last.1 == Some(false) {
            last.1 = None;
        }
    }

    let mut best = 0;
    let mut run = 0;
    for (_, sat) in &seq {
        match sat {
            Some(true) => {
                run += 1;
                best = best.max(run);
            }
            None => {}
            Some(false) => run = 0,
        }
    }

    let mut current = 0;
    for (_, sat) in seq.iter().rev() {
        match sat {
            Some(true) => current += 1,
            None => {}
            Some(false) => break,
        }
    }
    Streak { current, best }
}

fn streak_periodic(
    freq: &Freq,
    by_date: &HashMap<NaiveDate, &str>,
    start: NaiveDate,
    today: NaiveDate,
    times: u32,
) -> Streak {
    // DONE count per period.
    let mut done: HashMap<i32, u32> = HashMap::new();
    for (d, s) in by_date {
        if *s == "DONE" {
            *done.entry(period_index(freq, *d)).or_default() += 1;
        }
    }
    let start_idx = period_index(freq, start);
    let cur_idx = period_index(freq, today);
    let met = |idx: i32| done.get(&idx).copied().unwrap_or(0) >= times;

    let mut best = 0;
    let mut run = 0;
    for idx in start_idx..=cur_idx {
        if met(idx) {
            run += 1;
            best = best.max(run);
        } else {
            run = 0;
        }
    }

    let mut current = 0;
    let mut idx = cur_idx;
    // Grace: the in-progress period doesn't break the streak if not yet met.
    if !met(cur_idx) {
        idx -= 1;
    }
    while idx >= start_idx {
        if met(idx) {
            current += 1;
            idx -= 1;
        } else {
            break;
        }
    }
    Streak { current, best }
}

/// Completion rate over `[from, to]` in 0.0..=1.0.
pub fn completion_rate(
    freq: &Freq,
    marks: &[(String, String)],
    from: NaiveDate,
    to: NaiveDate,
) -> f64 {
    let done: std::collections::HashSet<NaiveDate> = marks
        .iter()
        .filter(|(_, s)| s == "DONE")
        .filter_map(|(d, _)| parse_date(d))
        .collect();

    match freq {
        Freq::Weekly { times } | Freq::Monthly { times } => {
            let mut per_period: HashMap<i32, u32> = HashMap::new();
            for d in &done {
                if *d >= from && *d <= to {
                    *per_period.entry(period_index(freq, *d)).or_default() += 1;
                }
            }
            let total = period_index(freq, to) - period_index(freq, from) + 1;
            if total <= 0 {
                return 0.0;
            }
            let met = (period_index(freq, from)..=period_index(freq, to))
                .filter(|idx| per_period.get(idx).copied().unwrap_or(0) >= *times)
                .count();
            met as f64 / total as f64
        }
        _ => {
            let mut scheduled = 0;
            let mut hit = 0;
            let mut d = from;
            while d <= to {
                if is_scheduled(freq, d) {
                    scheduled += 1;
                    if done.contains(&d) {
                        hit += 1;
                    }
                }
                d += Duration::days(1);
            }
            if scheduled == 0 {
                0.0
            } else {
                hit as f64 / scheduled as f64
            }
        }
    }
}

// ---- data model + DB -------------------------------------------------------

#[derive(Debug, Clone, Serialize, sqlx::FromRow)]
#[serde(rename_all = "camelCase")]
pub struct Habit {
    pub id: String,
    pub name: String,
    pub icon: Option<String>,
    pub color: Option<String>,
    pub quote: Option<String>,
    pub goal_kind: String,
    pub goal_amount: Option<f64>,
    pub unit: Option<String>,
    pub freq_json: String,
    pub section: Option<String>,
    pub reminders_json: Option<String>,
    pub start_date: Option<String>,
    /// Target duration in days; NULL/None = run forever.
    pub goal_days: Option<i64>,
    /// Auto-open the check-in log for this habit when it's due.
    pub auto_log_popup: bool,
    pub archived: bool,
    pub sort_order: i64,
}

#[derive(Debug, Clone, Serialize, sqlx::FromRow)]
#[serde(rename_all = "camelCase")]
pub struct HabitCheckin {
    pub id: String,
    pub habit_id: String,
    pub date: String,
    pub value: Option<f64>,
    pub status: String,
    pub note: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HabitInput {
    pub name: String,
    #[serde(default)]
    pub icon: Option<String>,
    #[serde(default)]
    pub color: Option<String>,
    #[serde(default)]
    pub quote: Option<String>,
    pub goal_kind: String, // CHECK | AMOUNT
    #[serde(default)]
    pub goal_amount: Option<f64>,
    #[serde(default)]
    pub unit: Option<String>,
    pub freq: Freq,
    #[serde(default)]
    pub section: Option<String>,
    #[serde(default)]
    pub reminders: Vec<String>, // "HH:MM"
    #[serde(default)]
    pub start_date: Option<String>,
    #[serde(default)]
    pub goal_days: Option<i64>,
    #[serde(default)]
    pub auto_log_popup: bool,
}

const COLUMNS: &str = "id, name, icon, color, quote, goal_kind, goal_amount, unit, freq_json, \
     section, reminders_json, start_date, goal_days, auto_log_popup, archived, sort_order";

fn check_goal_kind(kind: &str) -> Result<()> {
    match kind {
        "CHECK" | "AMOUNT" => Ok(()),
        _ => Err(RepoError::Invalid(format!("bad goal_kind {kind:?}"))),
    }
}

pub async fn list_habits(pool: &SqlitePool, include_archived: bool) -> Result<Vec<Habit>> {
    let sql = format!(
        "SELECT {COLUMNS} FROM habits WHERE deleted_at IS NULL {}
         ORDER BY sort_order, created_at",
        if include_archived { "" } else { "AND archived = 0" }
    );
    Ok(sqlx::query_as(&sql).fetch_all(pool).await?)
}

pub async fn get_habit(pool: &SqlitePool, id: &str) -> Result<Habit> {
    sqlx::query_as(&format!("SELECT {COLUMNS} FROM habits WHERE id = ? AND deleted_at IS NULL"))
        .bind(id)
        .fetch_optional(pool)
        .await?
        .ok_or_else(|| RepoError::NotFound(format!("habit {id}")))
}

pub async fn create_habit(pool: &SqlitePool, bus: &EventBus, input: HabitInput) -> Result<Habit> {
    check_goal_kind(&input.goal_kind)?;
    let id = new_id();
    let ts = now();
    let freq_json = serde_json::to_string(&input.freq).unwrap();
    let reminders_json = serde_json::to_string(&input.reminders).unwrap();
    let next_order: i64 =
        sqlx::query_scalar("SELECT COALESCE(MAX(sort_order), 0) + 1 FROM habits WHERE deleted_at IS NULL")
            .fetch_one(pool)
            .await?;
    let mut tx = pool.begin().await?;
    sqlx::query(
        "INSERT INTO habits (id, name, icon, color, quote, goal_kind, goal_amount, unit, freq_json,
                             section, reminders_json, start_date, goal_days, auto_log_popup, archived, sort_order,
                             created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?)",
    )
    .bind(&id)
    .bind(&input.name)
    .bind(&input.icon)
    .bind(&input.color)
    .bind(&input.quote)
    .bind(&input.goal_kind)
    .bind(input.goal_amount)
    .bind(&input.unit)
    .bind(&freq_json)
    .bind(&input.section)
    .bind(&reminders_json)
    .bind(&input.start_date)
    .bind(input.goal_days)
    .bind(input.auto_log_popup)
    .bind(next_order)
    .bind(&ts)
    .bind(&ts)
    .execute(&mut *tx)
    .await?;
    append_changelog(&mut tx, "habit", &id, ChangeOp::Insert, &serde_json::json!({ "name": input.name }))
        .await?;
    tx.commit().await?;
    bus.emit(DomainEvent::HabitChanged);
    get_habit(pool, &id).await
}

pub async fn update_habit(pool: &SqlitePool, bus: &EventBus, id: &str, input: HabitInput) -> Result<Habit> {
    check_goal_kind(&input.goal_kind)?;
    let ts = now();
    let freq_json = serde_json::to_string(&input.freq).unwrap();
    let reminders_json = serde_json::to_string(&input.reminders).unwrap();
    let mut tx = pool.begin().await?;
    let res = sqlx::query(
        "UPDATE habits SET name = ?, icon = ?, color = ?, quote = ?, goal_kind = ?,
                           goal_amount = ?, unit = ?, freq_json = ?, section = ?,
                           reminders_json = ?, start_date = ?, goal_days = ?,
                           auto_log_popup = ?, updated_at = ?
         WHERE id = ? AND deleted_at IS NULL",
    )
    .bind(&input.name)
    .bind(&input.icon)
    .bind(&input.color)
    .bind(&input.quote)
    .bind(&input.goal_kind)
    .bind(input.goal_amount)
    .bind(&input.unit)
    .bind(&freq_json)
    .bind(&input.section)
    .bind(&reminders_json)
    .bind(&input.start_date)
    .bind(input.goal_days)
    .bind(input.auto_log_popup)
    .bind(&ts)
    .bind(id)
    .execute(&mut *tx)
    .await?;
    if res.rows_affected() == 0 {
        return Err(RepoError::NotFound(format!("habit {id}")));
    }
    append_changelog(&mut tx, "habit", id, ChangeOp::Update, &serde_json::json!({})).await?;
    tx.commit().await?;
    bus.emit(DomainEvent::HabitChanged);
    get_habit(pool, id).await
}

pub async fn set_archived(pool: &SqlitePool, bus: &EventBus, id: &str, archived: bool) -> Result<()> {
    let res = sqlx::query("UPDATE habits SET archived = ?, updated_at = ? WHERE id = ? AND deleted_at IS NULL")
        .bind(archived)
        .bind(now())
        .bind(id)
        .execute(pool)
        .await?;
    if res.rows_affected() == 0 {
        return Err(RepoError::NotFound(format!("habit {id}")));
    }
    bus.emit(DomainEvent::HabitChanged);
    Ok(())
}

pub async fn delete_habit(pool: &SqlitePool, bus: &EventBus, id: &str) -> Result<()> {
    let ts = now();
    let mut tx = pool.begin().await?;
    sqlx::query("UPDATE habits SET deleted_at = ?, updated_at = ? WHERE id = ?")
        .bind(&ts)
        .bind(&ts)
        .bind(id)
        .execute(&mut *tx)
        .await?;
    append_changelog(&mut tx, "habit", id, ChangeOp::Delete, &serde_json::json!({})).await?;
    tx.commit().await?;
    bus.emit(DomainEvent::HabitChanged);
    Ok(())
}

pub async fn reorder_habit(pool: &SqlitePool, bus: &EventBus, id: &str, after_id: Option<&str>) -> Result<()> {
    let mut order: Vec<String> = sqlx::query_scalar(
        "SELECT id FROM habits WHERE deleted_at IS NULL AND id <> ? ORDER BY sort_order, created_at",
    )
    .bind(id)
    .fetch_all(pool)
    .await?;
    let index = match after_id {
        None => 0,
        Some(after) => order.iter().position(|x| x == after).map(|i| i + 1).unwrap_or(order.len()),
    };
    order.insert(index.min(order.len()), id.to_string());
    let ts = now();
    let mut tx = pool.begin().await?;
    for (pos, hid) in order.iter().enumerate() {
        sqlx::query("UPDATE habits SET sort_order = ?, updated_at = ? WHERE id = ?")
            .bind(pos as i64 + 1)
            .bind(&ts)
            .bind(hid)
            .execute(&mut *tx)
            .await?;
    }
    tx.commit().await?;
    bus.emit(DomainEvent::HabitChanged);
    Ok(())
}

// ---- check-ins -------------------------------------------------------------

fn check_status(status: &str) -> Result<()> {
    match status {
        "DONE" | "PARTIAL" | "SKIP" => Ok(()),
        _ => Err(RepoError::Invalid(format!("bad check-in status {status:?}"))),
    }
}

/// Record (or replace) the check-in for a habit on a given day. The (habit,date)
/// unique index means this is an upsert — which also powers retroactive logging.
pub async fn record_checkin(
    pool: &SqlitePool,
    bus: &EventBus,
    habit_id: &str,
    date: &str,
    status: &str,
    value: Option<f64>,
    note: Option<&str>,
) -> Result<HabitCheckin> {
    check_status(status)?;
    let ts = now();
    let mut tx = pool.begin().await?;
    let existing: Option<String> = sqlx::query_scalar(
        "SELECT id FROM habit_checkins WHERE habit_id = ? AND date = ? AND deleted_at IS NULL",
    )
    .bind(habit_id)
    .bind(date)
    .fetch_optional(&mut *tx)
    .await?;
    let id = if let Some(id) = existing {
        sqlx::query("UPDATE habit_checkins SET value = ?, status = ?, note = ?, updated_at = ? WHERE id = ?")
            .bind(value)
            .bind(status)
            .bind(note)
            .bind(&ts)
            .bind(&id)
            .execute(&mut *tx)
            .await?;
        id
    } else {
        let id = new_id();
        sqlx::query(
            "INSERT INTO habit_checkins (id, habit_id, date, value, status, note, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
        )
        .bind(&id)
        .bind(habit_id)
        .bind(date)
        .bind(value)
        .bind(status)
        .bind(note)
        .bind(&ts)
        .bind(&ts)
        .execute(&mut *tx)
        .await?;
        id
    };
    append_changelog(&mut tx, "habit_checkin", &id, ChangeOp::Update, &serde_json::json!({ "habitId": habit_id, "date": date }))
        .await?;
    tx.commit().await?;
    bus.emit(DomainEvent::HabitCheckinChanged { habit_id: habit_id.to_string() });
    sqlx::query_as("SELECT id, habit_id, date, value, status, note FROM habit_checkins WHERE id = ?")
        .bind(&id)
        .fetch_one(pool)
        .await
        .map_err(Into::into)
}

pub async fn delete_checkin(pool: &SqlitePool, bus: &EventBus, habit_id: &str, date: &str) -> Result<()> {
    let ts = now();
    sqlx::query("UPDATE habit_checkins SET deleted_at = ?, updated_at = ? WHERE habit_id = ? AND date = ? AND deleted_at IS NULL")
        .bind(&ts)
        .bind(&ts)
        .bind(habit_id)
        .bind(date)
        .execute(pool)
        .await?;
    bus.emit(DomainEvent::HabitCheckinChanged { habit_id: habit_id.to_string() });
    Ok(())
}

pub async fn list_checkins(pool: &SqlitePool, habit_id: &str, from: &str, to: &str) -> Result<Vec<HabitCheckin>> {
    Ok(sqlx::query_as(
        "SELECT id, habit_id, date, value, status, note FROM habit_checkins
         WHERE habit_id = ? AND deleted_at IS NULL AND date >= ? AND date <= ?
         ORDER BY date DESC",
    )
    .bind(habit_id)
    .bind(from)
    .bind(to)
    .fetch_all(pool)
    .await?)
}

async fn all_marks(pool: &SqlitePool, habit_id: &str) -> Result<Vec<(String, String)>> {
    Ok(sqlx::query_as("SELECT date, status FROM habit_checkins WHERE habit_id = ? AND deleted_at IS NULL")
        .bind(habit_id)
        .fetch_all(pool)
        .await?)
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HabitStats {
    pub current_streak: u32,
    pub best_streak: u32,
    pub total_checkins: i64,
    pub completion_rate: f64,
}

pub async fn habit_stats(pool: &SqlitePool, habit_id: &str, today: &str) -> Result<HabitStats> {
    let habit = get_habit(pool, habit_id).await?;
    let freq = parse_freq(&habit.freq_json)?;
    let marks = all_marks(pool, habit_id).await?;
    let today_date = parse_date(today).ok_or_else(|| RepoError::Invalid(format!("bad date {today:?}")))?;

    let s = streak(&freq, &marks, today_date);
    let total: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM habit_checkins WHERE habit_id = ? AND status = 'DONE' AND deleted_at IS NULL",
    )
    .bind(habit_id)
    .fetch_one(pool)
    .await?;
    let rate = completion_rate(&freq, &marks, today_date - Duration::days(29), today_date);
    Ok(HabitStats { current_streak: s.current, best_streak: s.best, total_checkins: total, completion_rate: rate })
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HabitToday {
    pub habit: Habit,
    pub status: Option<String>,
    pub value: Option<f64>,
    pub streak: u32,
}

/// Active habits scheduled for `today`, with today's check-in state and current
/// streak. Habits with a future start date are excluded.
pub async fn list_today(pool: &SqlitePool, today: &str) -> Result<Vec<HabitToday>> {
    let today_date = parse_date(today).ok_or_else(|| RepoError::Invalid(format!("bad date {today:?}")))?;
    let mut out = Vec::new();
    for habit in list_habits(pool, false).await? {
        let freq = parse_freq(&habit.freq_json)?;
        if !is_scheduled(&freq, today_date) {
            continue;
        }
        if let Some(start) = &habit.start_date {
            if parse_date(start).is_some_and(|s| s > today_date) {
                continue;
            }
        }
        let checkin: Option<(String, Option<f64>)> = sqlx::query_as(
            "SELECT status, value FROM habit_checkins WHERE habit_id = ? AND date = ? AND deleted_at IS NULL",
        )
        .bind(&habit.id)
        .bind(today)
        .fetch_optional(pool)
        .await?;
        let marks = all_marks(pool, &habit.id).await?;
        let s = streak(&freq, &marks, today_date);
        out.push(HabitToday {
            habit,
            status: checkin.as_ref().map(|(st, _)| st.clone()),
            value: checkin.and_then(|(_, v)| v),
            streak: s.current,
        });
    }
    Ok(out)
}

// ---- reminders (scheduler) -------------------------------------------------

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HabitReminderDue {
    pub habit_id: String,
    pub name: String,
    pub time: String,
}

/// Habit reminders whose local time has passed today and that aren't checked in
/// yet. The scheduler dedups (in-memory) before firing.
pub async fn due_habit_reminders(
    pool: &SqlitePool,
    now_instant: DateTime<Utc>,
    tz_off_min: i32,
) -> Result<Vec<HabitReminderDue>> {
    let local = now_instant + Duration::minutes(tz_off_min as i64);
    let today = local.date_naive();
    let today_str = date_str(today);
    let minutes_now = local.time().hour() as i32 * 60 + local.time().minute() as i32;

    let mut due = Vec::new();
    for habit in list_habits(pool, false).await? {
        let Ok(freq) = parse_freq(&habit.freq_json) else { continue };
        if !is_scheduled(&freq, today) {
            continue;
        }
        let times: Vec<String> = habit
            .reminders_json
            .as_deref()
            .and_then(|j| serde_json::from_str(j).ok())
            .unwrap_or_default();
        if times.is_empty() {
            continue;
        }
        let checked: bool = sqlx::query_scalar(
            "SELECT EXISTS(SELECT 1 FROM habit_checkins
             WHERE habit_id = ? AND date = ? AND status = 'DONE' AND deleted_at IS NULL)",
        )
        .bind(&habit.id)
        .bind(&today_str)
        .fetch_one(pool)
        .await?;
        if checked {
            continue;
        }
        for time in times {
            if let Some((h, m)) = time.split_once(':') {
                if let (Ok(h), Ok(m)) = (h.parse::<i32>(), m.parse::<i32>()) {
                    if h * 60 + m <= minutes_now {
                        due.push(HabitReminderDue { habit_id: habit.id.clone(), name: habit.name.clone(), time });
                    }
                }
            }
        }
    }
    Ok(due)
}

use chrono::Timelike;

#[cfg(test)]
mod pure_tests {
    use super::*;

    fn d(s: &str) -> NaiveDate {
        parse_date(s).unwrap()
    }
    fn marks(pairs: &[(&str, &str)]) -> Vec<(String, String)> {
        pairs.iter().map(|(a, b)| (a.to_string(), b.to_string())).collect()
    }

    #[test]
    fn daily_streak_counts_done_and_breaks_on_miss() {
        // Mar 2-5 DONE, Mar 6 missing, today Mar 8. Streak broke at the 6th, so
        // counting back from today: 8 missing (grace), 7 missing → break at 0.
        let m = marks(&[
            ("2026-03-02", "DONE"),
            ("2026-03-03", "DONE"),
            ("2026-03-04", "DONE"),
            ("2026-03-05", "DONE"),
        ]);
        let s = streak(&Freq::Daily, &m, d("2026-03-08"));
        assert_eq!(s.best, 4);
        assert_eq!(s.current, 0); // the gap on the 6th/7th broke it
    }

    #[test]
    fn daily_today_missing_is_grace_not_a_break() {
        // Consecutive through yesterday; today not yet done → current stays 3.
        let m = marks(&[
            ("2026-03-06", "DONE"),
            ("2026-03-07", "DONE"),
            ("2026-03-08", "DONE"),
        ]);
        let s = streak(&Freq::Daily, &m, d("2026-03-09"));
        assert_eq!(s.current, 3);
        assert_eq!(s.best, 3);
    }

    #[test]
    fn skip_is_neutral() {
        // A skip on the 7th keeps the streak spanning the 6th and 8th.
        let m = marks(&[
            ("2026-03-06", "DONE"),
            ("2026-03-07", "SKIP"),
            ("2026-03-08", "DONE"),
        ]);
        let s = streak(&Freq::Daily, &m, d("2026-03-08"));
        assert_eq!(s.current, 2);
        assert_eq!(s.best, 2);
    }

    #[test]
    fn weekday_habit_ignores_off_days() {
        // Weekdays Mon/Wed/Fri. 2026-03-02 is Mon. Done Mon+Wed+Fri, today Sat.
        let freq = Freq::Weekdays { days: vec![1, 3, 5] };
        let m = marks(&[
            ("2026-03-02", "DONE"), // Mon
            ("2026-03-04", "DONE"), // Wed
            ("2026-03-06", "DONE"), // Fri
        ]);
        let s = streak(&freq, &m, d("2026-03-07")); // Sat (not scheduled)
        assert_eq!(s.current, 3);
        assert_eq!(s.best, 3);
    }

    #[test]
    fn weekly_streak_counts_periods_meeting_target() {
        // 3x per week. Week of Mar 2-8: 3 done → met. Week of Mar 9-15: 3 done →
        // met. Today Mar 10 (in-progress week already met).
        let freq = Freq::Weekly { times: 3 };
        let m = marks(&[
            ("2026-03-02", "DONE"),
            ("2026-03-03", "DONE"),
            ("2026-03-05", "DONE"),
            ("2026-03-09", "DONE"),
            ("2026-03-10", "DONE"),
            ("2026-03-11", "DONE"),
        ]);
        let s = streak(&freq, &m, d("2026-03-10"));
        assert_eq!(s.best, 2);
        assert_eq!(s.current, 2);
    }

    #[test]
    fn weekly_in_progress_period_is_grace() {
        // Last week met (3), this week only 1 so far → current still counts last
        // week (grace on the unmet in-progress week).
        let freq = Freq::Weekly { times: 3 };
        let m = marks(&[
            ("2026-03-02", "DONE"),
            ("2026-03-03", "DONE"),
            ("2026-03-04", "DONE"),
            ("2026-03-09", "DONE"),
        ]);
        let s = streak(&freq, &m, d("2026-03-10"));
        assert_eq!(s.current, 1);
    }

    #[test]
    fn completion_rate_daily_and_weekly() {
        let daily = Freq::Daily;
        let m = marks(&[("2026-03-01", "DONE"), ("2026-03-03", "DONE")]);
        // 2 done of 5 scheduled days.
        assert!((completion_rate(&daily, &m, d("2026-03-01"), d("2026-03-05")) - 0.4).abs() < 1e-9);
    }
}

#[cfg(test)]
mod db_tests {
    use super::*;
    use crate::repo::db::connect_in_memory;

    async fn setup() -> (SqlitePool, EventBus) {
        (connect_in_memory().await.unwrap(), EventBus::new())
    }

    fn daily(name: &str) -> HabitInput {
        HabitInput {
            name: name.into(),
            icon: None,
            color: None,
            quote: None,
            goal_kind: "CHECK".into(),
            goal_amount: None,
            unit: None,
            freq: Freq::Daily,
            section: None,
            reminders: vec![],
            start_date: None,
            goal_days: None,
            auto_log_popup: false,
        }
    }

    #[tokio::test]
    async fn create_list_archive() {
        let (pool, bus) = setup().await;
        let h = create_habit(&pool, &bus, daily("Meditate")).await.unwrap();
        assert_eq!(list_habits(&pool, false).await.unwrap().len(), 1);

        set_archived(&pool, &bus, &h.id, true).await.unwrap();
        assert!(list_habits(&pool, false).await.unwrap().is_empty());
        assert_eq!(list_habits(&pool, true).await.unwrap().len(), 1);
    }

    #[tokio::test]
    async fn checkin_upsert_is_unique_per_day() {
        let (pool, bus) = setup().await;
        let h = create_habit(&pool, &bus, daily("Read")).await.unwrap();

        record_checkin(&pool, &bus, &h.id, "2026-03-10", "DONE", None, Some("chapter 1")).await.unwrap();
        // Re-recording the same day replaces, not duplicates.
        record_checkin(&pool, &bus, &h.id, "2026-03-10", "SKIP", None, None).await.unwrap();
        let list = list_checkins(&pool, &h.id, "2026-03-01", "2026-03-31").await.unwrap();
        assert_eq!(list.len(), 1);
        assert_eq!(list[0].status, "SKIP");

        delete_checkin(&pool, &bus, &h.id, "2026-03-10").await.unwrap();
        assert!(list_checkins(&pool, &h.id, "2026-03-01", "2026-03-31").await.unwrap().is_empty());
    }

    #[tokio::test]
    async fn today_list_and_stats() {
        let (pool, bus) = setup().await;
        let h = create_habit(&pool, &bus, daily("Water")).await.unwrap();
        record_checkin(&pool, &bus, &h.id, "2026-03-09", "DONE", None, None).await.unwrap();
        record_checkin(&pool, &bus, &h.id, "2026-03-10", "DONE", None, None).await.unwrap();

        let today = list_today(&pool, "2026-03-10").await.unwrap();
        assert_eq!(today.len(), 1);
        assert_eq!(today[0].status.as_deref(), Some("DONE"));
        assert_eq!(today[0].streak, 2);

        let stats = habit_stats(&pool, &h.id, "2026-03-10").await.unwrap();
        assert_eq!(stats.current_streak, 2);
        assert_eq!(stats.total_checkins, 2);
    }

    #[tokio::test]
    async fn reminders_due_when_past_time_and_unchecked() {
        let (pool, bus) = setup().await;
        let mut input = daily("Stretch");
        input.reminders = vec!["09:00".into()];
        let h = create_habit(&pool, &bus, input).await.unwrap();

        // 2026-03-10 10:00 UTC, tz offset 0 → 09:00 reminder is past, unchecked.
        let now = DateTime::parse_from_rfc3339("2026-03-10T10:00:00Z").unwrap().with_timezone(&Utc);
        assert_eq!(due_habit_reminders(&pool, now, 0).await.unwrap().len(), 1);

        // After checking in, it is no longer due.
        record_checkin(&pool, &bus, &h.id, "2026-03-10", "DONE", None, None).await.unwrap();
        assert!(due_habit_reminders(&pool, now, 0).await.unwrap().is_empty());
    }
}
