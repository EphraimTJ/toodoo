//! Countdowns: a titled target date shown as "in N days" or "N days since".
//! The date math is pure (no DB) so it is unit-testable; annual-repeat countdowns
//! target the next anniversary, and an explicit count-up mode (from style_json)
//! forces the "since" view (docs/decisions.md).

use chrono::{Datelike, NaiveDate};
use serde::Serialize;
use sqlx::SqlitePool;

use crate::error::{RepoError, Result};
use crate::events::{DomainEvent, EventBus};

use super::{append_changelog, new_id, now, ChangeOp};

#[derive(Debug, Clone, Serialize, sqlx::FromRow)]
#[serde(rename_all = "camelCase")]
pub struct Countdown {
    pub id: String,
    pub title: String,
    pub target_date: String,
    pub repeat_annual: bool,
    pub style_json: Option<String>,
    pub pinned: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CountdownView {
    /// "until" (days remaining) or "since" (days elapsed).
    pub kind: String,
    pub days: i64,
    pub ref_date: String,
}

fn parse(s: &str) -> Result<NaiveDate> {
    NaiveDate::parse_from_str(s, "%Y-%m-%d").map_err(|e| RepoError::Invalid(format!("bad date {s:?}: {e}")))
}

/// The date with `target`'s month/day in `year`, clamping Feb 29 to Feb 28 in
/// non-leap years.
fn on_year(target: NaiveDate, year: i32) -> NaiveDate {
    NaiveDate::from_ymd_opt(year, target.month(), target.day())
        .or_else(|| NaiveDate::from_ymd_opt(year, target.month(), 28))
        .unwrap_or(target)
}

/// Compute the countdown view for a target relative to `today`.
pub fn countdown_view(
    target_date: &str,
    repeat_annual: bool,
    count_up: bool,
    today: &str,
) -> Result<CountdownView> {
    let target = parse(target_date)?;
    let today = parse(today)?;

    if repeat_annual {
        let this_year = on_year(target, today.year());
        let next = if this_year >= today { this_year } else { on_year(target, today.year() + 1) };
        return Ok(CountdownView {
            kind: "until".into(),
            days: (next - today).num_days(),
            ref_date: next.format("%Y-%m-%d").to_string(),
        });
    }
    if count_up {
        return Ok(CountdownView {
            kind: "since".into(),
            days: (today - target).num_days(),
            ref_date: target_date.to_string(),
        });
    }
    if target >= today {
        Ok(CountdownView { kind: "until".into(), days: (target - today).num_days(), ref_date: target_date.to_string() })
    } else {
        Ok(CountdownView { kind: "since".into(), days: (today - target).num_days(), ref_date: target_date.to_string() })
    }
}

// ---- CRUD ------------------------------------------------------------------

pub async fn list_countdowns(pool: &SqlitePool) -> Result<Vec<Countdown>> {
    Ok(sqlx::query_as(
        "SELECT id, title, target_date, repeat_annual, style_json, pinned FROM countdowns
         WHERE deleted_at IS NULL ORDER BY pinned DESC, created_at",
    )
    .fetch_all(pool)
    .await?)
}

pub async fn create_countdown(
    pool: &SqlitePool,
    bus: &EventBus,
    title: &str,
    target_date: &str,
    repeat_annual: bool,
    style_json: Option<&str>,
) -> Result<Countdown> {
    let id = new_id();
    let ts = now();
    let mut tx = pool.begin().await?;
    sqlx::query(
        "INSERT INTO countdowns (id, title, target_date, repeat_annual, style_json, pinned,
                                 created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, 0, ?, ?)",
    )
    .bind(&id)
    .bind(title)
    .bind(target_date)
    .bind(repeat_annual)
    .bind(style_json)
    .bind(&ts)
    .bind(&ts)
    .execute(&mut *tx)
    .await?;
    append_changelog(&mut tx, "countdown", &id, ChangeOp::Insert, &serde_json::json!({ "title": title }))
        .await?;
    tx.commit().await?;
    bus.emit(DomainEvent::CountdownChanged);
    get_countdown(pool, &id).await
}

pub async fn get_countdown(pool: &SqlitePool, id: &str) -> Result<Countdown> {
    sqlx::query_as(
        "SELECT id, title, target_date, repeat_annual, style_json, pinned FROM countdowns
         WHERE id = ? AND deleted_at IS NULL",
    )
    .bind(id)
    .fetch_optional(pool)
    .await?
    .ok_or_else(|| RepoError::NotFound(format!("countdown {id}")))
}

pub async fn update_countdown(
    pool: &SqlitePool,
    bus: &EventBus,
    id: &str,
    title: Option<&str>,
    target_date: Option<&str>,
    repeat_annual: Option<bool>,
    style_json: Option<&str>,
) -> Result<Countdown> {
    let ts = now();
    let mut tx = pool.begin().await?;
    let res = sqlx::query(
        "UPDATE countdowns SET title = COALESCE(?, title), target_date = COALESCE(?, target_date),
                               repeat_annual = COALESCE(?, repeat_annual),
                               style_json = COALESCE(?, style_json), updated_at = ?
         WHERE id = ? AND deleted_at IS NULL",
    )
    .bind(title)
    .bind(target_date)
    .bind(repeat_annual)
    .bind(style_json)
    .bind(&ts)
    .bind(id)
    .execute(&mut *tx)
    .await?;
    if res.rows_affected() == 0 {
        return Err(RepoError::NotFound(format!("countdown {id}")));
    }
    append_changelog(&mut tx, "countdown", id, ChangeOp::Update, &serde_json::json!({})).await?;
    tx.commit().await?;
    bus.emit(DomainEvent::CountdownChanged);
    get_countdown(pool, id).await
}

pub async fn set_pinned(pool: &SqlitePool, bus: &EventBus, id: &str, pinned: bool) -> Result<()> {
    let res = sqlx::query("UPDATE countdowns SET pinned = ?, updated_at = ? WHERE id = ? AND deleted_at IS NULL")
        .bind(pinned)
        .bind(now())
        .bind(id)
        .execute(pool)
        .await?;
    if res.rows_affected() == 0 {
        return Err(RepoError::NotFound(format!("countdown {id}")));
    }
    bus.emit(DomainEvent::CountdownChanged);
    Ok(())
}

pub async fn delete_countdown(pool: &SqlitePool, bus: &EventBus, id: &str) -> Result<()> {
    let ts = now();
    let mut tx = pool.begin().await?;
    sqlx::query("UPDATE countdowns SET deleted_at = ?, updated_at = ? WHERE id = ?")
        .bind(&ts)
        .bind(&ts)
        .bind(id)
        .execute(&mut *tx)
        .await?;
    append_changelog(&mut tx, "countdown", id, ChangeOp::Delete, &serde_json::json!({})).await?;
    tx.commit().await?;
    bus.emit(DomainEvent::CountdownChanged);
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn future_target_counts_down() {
        let v = countdown_view("2026-06-10", false, false, "2026-06-01").unwrap();
        assert_eq!(v.kind, "until");
        assert_eq!(v.days, 9);
    }

    #[test]
    fn past_target_counts_since() {
        let v = countdown_view("2026-05-01", false, false, "2026-06-01").unwrap();
        assert_eq!(v.kind, "since");
        assert_eq!(v.days, 31);
    }

    #[test]
    fn today_is_zero() {
        let v = countdown_view("2026-06-01", false, false, "2026-06-01").unwrap();
        assert_eq!(v.kind, "until");
        assert_eq!(v.days, 0);
    }

    #[test]
    fn annual_targets_next_anniversary() {
        // Original 2020-12-25. On Jun 1 2026 → next is Dec 25 2026.
        let v = countdown_view("2020-12-25", true, false, "2026-06-01").unwrap();
        assert_eq!(v.kind, "until");
        assert_eq!(v.ref_date, "2026-12-25");

        // On Dec 26 2026 → rolls to Dec 25 2027.
        let v = countdown_view("2020-12-25", true, false, "2026-12-26").unwrap();
        assert_eq!(v.ref_date, "2027-12-25");
    }

    #[test]
    fn count_up_forces_since() {
        let v = countdown_view("2020-01-01", false, true, "2026-01-01").unwrap();
        assert_eq!(v.kind, "since");
        assert_eq!(v.days, (parse("2026-01-01").unwrap() - parse("2020-01-01").unwrap()).num_days());
    }

    #[tokio::test]
    async fn crud_and_pin() {
        let pool = crate::repo::db::connect_in_memory().await.unwrap();
        let bus = EventBus::new();
        let c = create_countdown(&pool, &bus, "Trip", "2026-08-01", false, Some("{\"color\":\"#4772fa\"}"))
            .await
            .unwrap();
        assert_eq!(list_countdowns(&pool).await.unwrap().len(), 1);

        set_pinned(&pool, &bus, &c.id, true).await.unwrap();
        assert!(get_countdown(&pool, &c.id).await.unwrap().pinned);

        update_countdown(&pool, &bus, &c.id, Some("Vacation"), None, None, None).await.unwrap();
        assert_eq!(get_countdown(&pool, &c.id).await.unwrap().title, "Vacation");

        delete_countdown(&pool, &bus, &c.id).await.unwrap();
        assert!(list_countdowns(&pool).await.unwrap().is_empty());
    }
}
