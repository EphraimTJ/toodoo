//! Sticky notes: a colored, positioned card backed by a note/task. A standalone
//! quick sticky creates a NOTE-kind task (its text) in the Inbox — hidden from
//! task views by the NOTE-exclusion rule — plus a `sticky_notes` row. The
//! always-on-top pop-out window is deferred to Phase 12 (docs/decisions.md); this
//! phase renders stickies on an in-app board.

use serde::Serialize;
use sqlx::SqlitePool;

use crate::error::{RepoError, Result};
use crate::events::{DomainEvent, EventBus};

use super::tasks::{create_task, NewTask};
use super::{append_changelog, new_id, now, ChangeOp};

const DEFAULT_COLOR: &str = "#ffd97d";

#[derive(Debug, Clone, Serialize, sqlx::FromRow)]
#[serde(rename_all = "camelCase")]
pub struct StickyView {
    pub id: String,
    pub note_id: String,
    pub title: String,
    pub content_plain: Option<String>,
    pub x: i64,
    pub y: i64,
    pub w: i64,
    pub h: i64,
    pub color: Option<String>,
}

async fn insert_sticky(
    pool: &SqlitePool,
    bus: &EventBus,
    note_id: Option<&str>,
    task_id: Option<&str>,
    color: Option<&str>,
) -> Result<String> {
    let id = new_id();
    let ts = now();
    let mut tx = pool.begin().await?;
    sqlx::query(
        "INSERT INTO sticky_notes (id, task_id, note_id, x, y, w, h, color, open, created_at, updated_at)
         VALUES (?, ?, ?, 40, 40, 240, 220, ?, 1, ?, ?)",
    )
    .bind(&id)
    .bind(task_id)
    .bind(note_id)
    .bind(color.unwrap_or(DEFAULT_COLOR))
    .bind(&ts)
    .bind(&ts)
    .execute(&mut *tx)
    .await?;
    append_changelog(&mut tx, "sticky", &id, ChangeOp::Insert, &serde_json::json!({})).await?;
    tx.commit().await?;
    bus.emit(DomainEvent::StickyChanged);
    Ok(id)
}

/// Create a standalone sticky (its own NOTE task) with the given text.
pub async fn new_quick(pool: &SqlitePool, bus: &EventBus, text: &str, color: Option<&str>) -> Result<String> {
    let note = create_task(
        pool,
        bus,
        NewTask {
            project_id: "inbox".into(),
            parent_id: None,
            title: text.to_string(),
            priority: None,
            start_at: None,
            due_at: None,
            is_all_day: None,
            duration_min: None,
            time_zone: None,
            rrule: None,
            repeat_from: None,
            kind: Some("NOTE".into()),
        },
    )
    .await?;
    insert_sticky(pool, bus, Some(&note.id), None, color).await
}

/// Pop an existing note out as a sticky.
pub async fn sticky_from_note(pool: &SqlitePool, bus: &EventBus, note_id: &str, color: Option<&str>) -> Result<String> {
    insert_sticky(pool, bus, Some(note_id), None, color).await
}

/// Pop an existing task out as a sticky.
pub async fn sticky_from_task(pool: &SqlitePool, bus: &EventBus, task_id: &str, color: Option<&str>) -> Result<String> {
    insert_sticky(pool, bus, None, Some(task_id), color).await
}

#[allow(clippy::too_many_arguments)]
pub async fn update_sticky(
    pool: &SqlitePool,
    bus: &EventBus,
    id: &str,
    x: Option<i64>,
    y: Option<i64>,
    w: Option<i64>,
    h: Option<i64>,
    color: Option<&str>,
) -> Result<()> {
    let res = sqlx::query(
        "UPDATE sticky_notes SET x = COALESCE(?, x), y = COALESCE(?, y), w = COALESCE(?, w),
                                 h = COALESCE(?, h), color = COALESCE(?, color), updated_at = ?
         WHERE id = ? AND deleted_at IS NULL",
    )
    .bind(x)
    .bind(y)
    .bind(w)
    .bind(h)
    .bind(color)
    .bind(now())
    .bind(id)
    .execute(pool)
    .await?;
    if res.rows_affected() == 0 {
        return Err(RepoError::NotFound(format!("sticky {id}")));
    }
    bus.emit(DomainEvent::StickyChanged);
    Ok(())
}

pub async fn close_sticky(pool: &SqlitePool, bus: &EventBus, id: &str) -> Result<()> {
    sqlx::query("UPDATE sticky_notes SET open = 0, updated_at = ? WHERE id = ?")
        .bind(now())
        .bind(id)
        .execute(pool)
        .await?;
    bus.emit(DomainEvent::StickyChanged);
    Ok(())
}

pub async fn delete_sticky(pool: &SqlitePool, bus: &EventBus, id: &str) -> Result<()> {
    let ts = now();
    sqlx::query("UPDATE sticky_notes SET deleted_at = ?, updated_at = ? WHERE id = ?")
        .bind(&ts)
        .bind(&ts)
        .bind(id)
        .execute(pool)
        .await?;
    bus.emit(DomainEvent::StickyChanged);
    Ok(())
}

pub async fn list_open(pool: &SqlitePool) -> Result<Vec<StickyView>> {
    Ok(sqlx::query_as(
        "SELECT s.id, COALESCE(s.note_id, s.task_id) AS note_id, t.title, t.content_plain,
                s.x, s.y, s.w, s.h, s.color
         FROM sticky_notes s
         JOIN tasks t ON t.id = COALESCE(s.note_id, s.task_id)
         WHERE s.deleted_at IS NULL AND s.open = 1 AND t.deleted_at IS NULL
         ORDER BY s.created_at",
    )
    .fetch_all(pool)
    .await?)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::repo::db::connect_in_memory;

    async fn setup() -> (SqlitePool, EventBus) {
        (connect_in_memory().await.unwrap(), EventBus::new())
    }

    #[tokio::test]
    async fn quick_sticky_creates_note_and_lists() {
        let (pool, bus) = setup().await;
        let id = new_quick(&pool, &bus, "Remember the milk", None).await.unwrap();
        let list = list_open(&pool).await.unwrap();
        assert_eq!(list.len(), 1);
        assert_eq!(list[0].title, "Remember the milk");
        assert_eq!(list[0].id, id);
        // The backing note is hidden from smart lists.
        assert!(crate::repo::tasks::list_smart(&pool, crate::repo::tasks::SmartView::All, "2026-07-14", 0)
            .await
            .unwrap()
            .is_empty());
    }

    #[tokio::test]
    async fn move_and_close() {
        let (pool, bus) = setup().await;
        let id = new_quick(&pool, &bus, "Ideas", Some("#4772fa")).await.unwrap();
        update_sticky(&pool, &bus, &id, Some(120), Some(80), None, None, None).await.unwrap();
        let list = list_open(&pool).await.unwrap();
        assert_eq!((list[0].x, list[0].y), (120, 80));

        close_sticky(&pool, &bus, &id).await.unwrap();
        assert!(list_open(&pool).await.unwrap().is_empty());
    }
}
