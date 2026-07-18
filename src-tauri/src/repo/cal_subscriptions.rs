//! External ICS calendar subscriptions (read-only overlay) plus `.ics`
//! import/export. Subscriptions are fetched over the network and cached as
//! `cal_events` rows tagged with their `subscription_id`. The parse-and-store
//! step is split from the network fetch so it is unit-testable with fixture ICS.

use chrono::{DateTime, Duration, Utc};
use serde::Serialize;
use sqlx::{SqliteConnection, SqlitePool};

use crate::error::{RepoError, Result};
use crate::events::{DomainEvent, EventBus};

use super::ics::{self, IcsEvent};
use super::tasks::list_for_filter;
use super::{append_changelog, new_id, now, ChangeOp};

#[derive(Debug, Clone, Serialize, sqlx::FromRow)]
#[serde(rename_all = "camelCase")]
pub struct Subscription {
    pub id: String,
    pub url: String,
    pub name: String,
    pub color: Option<String>,
    pub visible: bool,
    pub refresh_min: i64,
    pub last_fetch: Option<String>,
}

pub async fn list_subscriptions(pool: &SqlitePool) -> Result<Vec<Subscription>> {
    Ok(sqlx::query_as(
        "SELECT id, url, name, color, visible, refresh_min, last_fetch FROM cal_subscriptions
         WHERE deleted_at IS NULL ORDER BY created_at",
    )
    .fetch_all(pool)
    .await?)
}

pub async fn add_subscription(
    pool: &SqlitePool,
    bus: &EventBus,
    url: &str,
    name: &str,
    color: Option<&str>,
    refresh_min: Option<i64>,
) -> Result<Subscription> {
    let id = new_id();
    let ts = now();
    let refresh = refresh_min.unwrap_or(60);
    let mut tx = pool.begin().await?;
    sqlx::query(
        "INSERT INTO cal_subscriptions (id, url, name, color, visible, refresh_min, created_at, updated_at)
         VALUES (?, ?, ?, ?, 1, ?, ?, ?)",
    )
    .bind(&id)
    .bind(url)
    .bind(name)
    .bind(color)
    .bind(refresh)
    .bind(&ts)
    .bind(&ts)
    .execute(&mut *tx)
    .await?;
    append_changelog(&mut tx, "subscription", &id, ChangeOp::Insert, &serde_json::json!({ "url": url }))
        .await?;
    tx.commit().await?;
    bus.emit(DomainEvent::SubscriptionChanged);
    Ok(Subscription {
        id,
        url: url.to_string(),
        name: name.to_string(),
        color: color.map(String::from),
        visible: true,
        refresh_min: refresh,
        last_fetch: None,
    })
}

pub async fn update_subscription(
    pool: &SqlitePool,
    bus: &EventBus,
    id: &str,
    name: Option<&str>,
    color: Option<&str>,
    visible: Option<bool>,
    refresh_min: Option<i64>,
) -> Result<()> {
    let ts = now();
    let mut tx = pool.begin().await?;
    let res = sqlx::query(
        "UPDATE cal_subscriptions SET name = COALESCE(?, name), color = COALESCE(?, color),
            visible = COALESCE(?, visible), refresh_min = COALESCE(?, refresh_min), updated_at = ?
         WHERE id = ? AND deleted_at IS NULL",
    )
    .bind(name)
    .bind(color)
    .bind(visible)
    .bind(refresh_min)
    .bind(&ts)
    .bind(id)
    .execute(&mut *tx)
    .await?;
    if res.rows_affected() == 0 {
        return Err(RepoError::NotFound(format!("subscription {id}")));
    }
    append_changelog(&mut tx, "subscription", id, ChangeOp::Update, &serde_json::json!({})).await?;
    tx.commit().await?;
    bus.emit(DomainEvent::SubscriptionChanged);
    Ok(())
}

pub async fn delete_subscription(pool: &SqlitePool, bus: &EventBus, id: &str) -> Result<()> {
    let ts = now();
    let mut tx = pool.begin().await?;
    // Its cached events go too (they are derived from the feed).
    sqlx::query("DELETE FROM cal_events WHERE subscription_id = ?").bind(id).execute(&mut *tx).await?;
    let res = sqlx::query("UPDATE cal_subscriptions SET deleted_at = ?, updated_at = ? WHERE id = ? AND deleted_at IS NULL")
        .bind(&ts)
        .bind(&ts)
        .bind(id)
        .execute(&mut *tx)
        .await?;
    if res.rows_affected() == 0 {
        return Err(RepoError::NotFound(format!("subscription {id}")));
    }
    append_changelog(&mut tx, "subscription", id, ChangeOp::Delete, &serde_json::json!({})).await?;
    tx.commit().await?;
    bus.emit(DomainEvent::SubscriptionChanged);
    Ok(())
}

/// Insert one parsed ICS event as a `cal_events` row (subscription or local).
async fn insert_event(
    conn: &mut SqliteConnection,
    subscription_id: Option<&str>,
    ev: &IcsEvent,
    ts: &str,
) -> Result<()> {
    let exdates_json = if ev.exdates.is_empty() {
        None
    } else {
        Some(serde_json::to_string(&ev.exdates).unwrap_or_default())
    };
    sqlx::query(
        "INSERT INTO cal_events
            (id, subscription_id, uid, title, start_at, end_at, all_day, location, notes, rrule,
             exdates_json, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    )
    .bind(new_id())
    .bind(subscription_id)
    .bind(&ev.uid)
    .bind(&ev.summary)
    .bind(&ev.start_at)
    .bind(&ev.end_at)
    .bind(ev.all_day)
    .bind(&ev.location)
    .bind(&ev.description)
    .bind(&ev.rrule)
    .bind(exdates_json)
    .bind(ts)
    .bind(ts)
    .execute(conn)
    .await?;
    Ok(())
}

/// Replace a subscription's cached events with the events parsed from `ics_text`
/// and stamp `last_fetch`. Pure of the network so it can be tested with fixtures.
///
/// A response that is not structurally a VCALENDAR (HTML error page, truncated
/// body) is rejected before anything is deleted — the previous cache and
/// `last_fetch` survive, so a transient feed failure can't erase the user's
/// calendar. A valid calendar with zero events is a legitimate empty feed and
/// still replaces the cache.
pub async fn store_subscription_events(
    pool: &SqlitePool,
    bus: &EventBus,
    subscription_id: &str,
    ics_text: &str,
) -> Result<usize> {
    if !ics::is_calendar(ics_text) {
        return Err(RepoError::Invalid(
            "feed response is not an ICS calendar (kept the previously cached events)".into(),
        ));
    }
    let events = ics::parse(ics_text);
    let ts = now();
    let mut tx = pool.begin().await?;
    sqlx::query("DELETE FROM cal_events WHERE subscription_id = ?")
        .bind(subscription_id)
        .execute(&mut *tx)
        .await?;
    for ev in &events {
        insert_event(&mut tx, Some(subscription_id), ev, &ts).await?;
    }
    sqlx::query("UPDATE cal_subscriptions SET last_fetch = ?, updated_at = ? WHERE id = ?")
        .bind(&ts)
        .bind(&ts)
        .bind(subscription_id)
        .execute(&mut *tx)
        .await?;
    tx.commit().await?;
    bus.emit(DomainEvent::CalendarChanged);
    Ok(events.len())
}

/// Fetch a subscription's URL and store its events.
pub async fn refresh_subscription(pool: &SqlitePool, bus: &EventBus, id: &str) -> Result<usize> {
    let url: String =
        sqlx::query_scalar("SELECT url FROM cal_subscriptions WHERE id = ? AND deleted_at IS NULL")
            .bind(id)
            .fetch_optional(pool)
            .await?
            .ok_or_else(|| RepoError::NotFound(format!("subscription {id}")))?;
    let text = reqwest::get(&url)
        .await
        .map_err(|e| RepoError::Invalid(format!("fetch {url} failed: {e}")))?
        .error_for_status()
        .map_err(|e| RepoError::Invalid(format!("fetch {url} failed: {e}")))?
        .text()
        .await
        .map_err(|e| RepoError::Invalid(format!("read {url} failed: {e}")))?;
    store_subscription_events(pool, bus, id, &text).await
}

/// Refresh every subscription whose interval has elapsed. Individual failures
/// are logged but don't stall the others (called by the scheduler); a failed
/// feed keeps its cache and, with `last_fetch` unstamped, retries next pass.
pub async fn refresh_due(pool: &SqlitePool, bus: &EventBus) -> Result<()> {
    let subs: Vec<(String, Option<String>, i64)> = sqlx::query_as(
        "SELECT id, last_fetch, refresh_min FROM cal_subscriptions
         WHERE deleted_at IS NULL AND visible = 1",
    )
    .fetch_all(pool)
    .await?;
    let now_dt = Utc::now();
    for (id, last_fetch, refresh_min) in subs {
        let due = match last_fetch.as_deref() {
            None => true,
            Some(l) => DateTime::parse_from_rfc3339(l)
                .map(|d| d.with_timezone(&Utc) + Duration::minutes(refresh_min) <= now_dt)
                .unwrap_or(true),
        };
        if due {
            if let Err(e) = refresh_subscription(pool, bus, &id).await {
                log::warn!("[calendar] refresh of subscription {id} failed (cache kept): {e}");
            }
        }
    }
    Ok(())
}

/// Import a `.ics` document's events as LOCAL calendar events.
pub async fn import_ics(pool: &SqlitePool, bus: &EventBus, text: &str) -> Result<usize> {
    let events = ics::parse(text);
    let ts = now();
    let mut tx = pool.begin().await?;
    for ev in &events {
        insert_event(&mut tx, None, ev, &ts).await?;
    }
    tx.commit().await?;
    bus.emit(DomainEvent::CalendarChanged);
    Ok(events.len())
}

/// Export dated tasks (optionally scoped to a project) plus local events as ICS.
pub async fn export_ics(pool: &SqlitePool, project_id: Option<&str>) -> Result<String> {
    let mut out: Vec<IcsEvent> = Vec::new();

    for task in list_for_filter(pool, &["ACTIVE", "COMPLETED"]).await? {
        if project_id.is_some_and(|p| p != task.project_id) {
            continue;
        }
        let Some(start) = task.due_at.clone().or_else(|| task.start_at.clone()) else { continue };
        let end = match (&task.start_at, &task.due_at) {
            (Some(s), Some(d)) if s != d => Some(d.clone()),
            _ => None,
        };
        out.push(IcsEvent {
            uid: Some(format!("toodoo-task-{}", task.id)),
            summary: task.title,
            start_at: start,
            end_at: end,
            all_day: task.is_all_day,
            location: None,
            description: task.content_plain,
            rrule: task.rrule,
            exdates: vec![],
        });
    }

    if project_id.is_none() {
        let events: Vec<super::calendar::CalEvent> = sqlx::query_as(
            "SELECT id, subscription_id, title, start_at, end_at, all_day, location, notes, color, rrule
             FROM cal_events WHERE subscription_id IS NULL AND deleted_at IS NULL",
        )
        .fetch_all(pool)
        .await?;
        for e in events {
            out.push(IcsEvent {
                uid: Some(e.id),
                summary: e.title,
                start_at: e.start_at,
                end_at: e.end_at,
                all_day: e.all_day,
                location: e.location,
                description: e.notes,
                rrule: e.rrule,
                exdates: vec![],
            });
        }
    }

    Ok(ics::generate(&out))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::repo::calendar::list_calendar;
    use crate::repo::db::connect_in_memory;
    use crate::repo::tasks::tests::quick;
    use crate::repo::tasks::{create_task, NewTask};

    const FIXTURE: &str = "BEGIN:VCALENDAR\r\n\
        BEGIN:VEVENT\r\nUID:a\r\nSUMMARY:Team offsite\r\nDTSTART;VALUE=DATE:20260310\r\nEND:VEVENT\r\n\
        BEGIN:VEVENT\r\nUID:b\r\nSUMMARY:1:1\r\nDTSTART:20260311T150000Z\r\nDTEND:20260311T153000Z\r\nEND:VEVENT\r\n\
        END:VCALENDAR\r\n";

    #[tokio::test]
    async fn store_replaces_events_and_stamps_last_fetch() {
        let pool = connect_in_memory().await.unwrap();
        let bus = EventBus::new();
        let sub = add_subscription(&pool, &bus, "https://x/f.ics", "Work", Some("#4772fa"), Some(30))
            .await
            .unwrap();

        let n = store_subscription_events(&pool, &bus, &sub.id, FIXTURE).await.unwrap();
        assert_eq!(n, 2);
        // Re-store must replace, not duplicate.
        store_subscription_events(&pool, &bus, &sub.id, FIXTURE).await.unwrap();
        let count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM cal_events WHERE subscription_id = ?")
            .bind(&sub.id)
            .fetch_one(&pool)
            .await
            .unwrap();
        assert_eq!(count, 2);

        assert!(list_subscriptions(&pool).await.unwrap()[0].last_fetch.is_some());
        // Feed events show up on the calendar (read-only).
        let items = list_calendar(&pool, "2026-03-01T00:00:00.000Z", "2026-03-31T00:00:00.000Z", false)
            .await
            .unwrap();
        let feed: Vec<_> = items.iter().filter(|i| i.kind == "EVENT").collect();
        assert_eq!(feed.len(), 2);
        assert!(feed.iter().all(|i| !i.editable));
    }

    #[tokio::test]
    async fn invalid_feed_response_preserves_cache_and_last_fetch() {
        let pool = connect_in_memory().await.unwrap();
        let bus = EventBus::new();
        let sub = add_subscription(&pool, &bus, "https://x/f.ics", "Work", None, Some(30))
            .await
            .unwrap();
        store_subscription_events(&pool, &bus, &sub.id, FIXTURE).await.unwrap();
        let last_fetch = list_subscriptions(&pool).await.unwrap()[0].last_fetch.clone();
        assert!(last_fetch.is_some());

        let cached = |pool: &SqlitePool| {
            let pool = pool.clone();
            let id = sub.id.clone();
            async move {
                sqlx::query_scalar::<_, i64>(
                    "SELECT COUNT(*) FROM cal_events WHERE subscription_id = ?",
                )
                .bind(&id)
                .fetch_one(&pool)
                .await
                .unwrap()
            }
        };

        // An HTML error page (what a 404/500 body looks like) is rejected …
        let html = "<html><body><h1>503 Service Unavailable</h1></body></html>";
        assert!(store_subscription_events(&pool, &bus, &sub.id, html).await.is_err());
        // … as is a truncated non-calendar fragment …
        assert!(store_subscription_events(&pool, &bus, &sub.id, "BEGIN:VEV").await.is_err());
        // … and neither touched the cache or the last-success stamp.
        assert_eq!(cached(&pool).await, 2);
        assert_eq!(list_subscriptions(&pool).await.unwrap()[0].last_fetch, last_fetch);

        // A structurally valid but EMPTY calendar is a legitimate feed state
        // and does replace the cache.
        let empty = "BEGIN:VCALENDAR\r\nVERSION:2.0\r\nEND:VCALENDAR\r\n";
        assert_eq!(store_subscription_events(&pool, &bus, &sub.id, empty).await.unwrap(), 0);
        assert_eq!(cached(&pool).await, 0);
    }

    #[tokio::test]
    async fn refresh_rejects_http_error_status_and_keeps_cache() {
        // Serve a 500 (with an HTML body) the way a broken feed host would.
        let app = axum::Router::new().route(
            "/feed.ics",
            axum::routing::get(|| async {
                (
                    axum::http::StatusCode::INTERNAL_SERVER_ERROR,
                    "<html><body>boom</body></html>",
                )
            }),
        );
        let listener = tokio::net::TcpListener::bind(("127.0.0.1", 0)).await.unwrap();
        let addr = listener.local_addr().unwrap();
        tokio::spawn(async move { axum::serve(listener, app).await.unwrap() });

        let pool = connect_in_memory().await.unwrap();
        let bus = EventBus::new();
        let sub = add_subscription(&pool, &bus, &format!("http://{addr}/feed.ics"), "Bad", None, None)
            .await
            .unwrap();
        store_subscription_events(&pool, &bus, &sub.id, FIXTURE).await.unwrap();

        let err = refresh_subscription(&pool, &bus, &sub.id).await;
        assert!(err.is_err(), "HTTP 500 must be a refresh error, got {err:?}");
        let count: i64 =
            sqlx::query_scalar("SELECT COUNT(*) FROM cal_events WHERE subscription_id = ?")
                .bind(&sub.id)
                .fetch_one(&pool)
                .await
                .unwrap();
        assert_eq!(count, 2, "cache must survive a failed refresh");
    }

    #[tokio::test]
    async fn import_creates_local_editable_events() {
        let pool = connect_in_memory().await.unwrap();
        let bus = EventBus::new();
        let n = import_ics(&pool, &bus, FIXTURE).await.unwrap();
        assert_eq!(n, 2);
        let items = list_calendar(&pool, "2026-03-01T00:00:00.000Z", "2026-03-31T00:00:00.000Z", false)
            .await
            .unwrap();
        let events: Vec<_> = items.iter().filter(|i| i.kind == "EVENT").collect();
        assert_eq!(events.len(), 2);
        assert!(events.iter().any(|i| i.editable)); // local events are editable
    }

    #[tokio::test]
    async fn export_round_trips_a_dated_task() {
        let pool = connect_in_memory().await.unwrap();
        let bus = EventBus::new();
        create_task(
            &pool,
            &bus,
            NewTask { due_at: Some("2026-04-01T00:00:00.000Z".into()), ..quick("inbox", "Pay rent") },
        )
        .await
        .unwrap();

        let ics = export_ics(&pool, None).await.unwrap();
        let parsed = ics::parse(&ics);
        assert!(parsed.iter().any(|e| e.summary == "Pay rent"));
    }
}
