//! Saved searches: a named query + filter set the user can re-run. Backed by the
//! `saved_searches` table (migration 0001). Soft-deleted, changelogged, and
//! event-emitting like every other mutation.

use serde::Serialize;
use sqlx::SqlitePool;

use crate::error::Result;
use crate::events::{DomainEvent, EventBus};

use super::{append_changelog, new_id, now, ChangeOp};

#[derive(Debug, Clone, Serialize, sqlx::FromRow)]
#[serde(rename_all = "camelCase")]
pub struct SavedSearch {
    pub id: String,
    pub query: String,
    pub filters_json: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

pub async fn list_saved_searches(pool: &SqlitePool) -> Result<Vec<SavedSearch>> {
    Ok(sqlx::query_as(
        "SELECT id, query, filters_json, created_at, updated_at FROM saved_searches
         WHERE deleted_at IS NULL ORDER BY created_at DESC",
    )
    .fetch_all(pool)
    .await?)
}

pub async fn create_saved_search(
    pool: &SqlitePool,
    bus: &EventBus,
    query: &str,
    filters_json: Option<&str>,
) -> Result<SavedSearch> {
    let id = new_id();
    let ts = now();
    let mut tx = pool.begin().await?;
    sqlx::query(
        "INSERT INTO saved_searches (id, query, filters_json, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?)",
    )
    .bind(&id)
    .bind(query)
    .bind(filters_json)
    .bind(&ts)
    .bind(&ts)
    .execute(&mut *tx)
    .await?;
    append_changelog(&mut tx, "saved_search", &id, ChangeOp::Insert, &serde_json::json!({ "query": query }))
        .await?;
    tx.commit().await?;

    bus.emit(DomainEvent::SavedSearchChanged);
    sqlx::query_as(
        "SELECT id, query, filters_json, created_at, updated_at FROM saved_searches WHERE id = ?",
    )
    .bind(&id)
    .fetch_one(pool)
    .await
    .map_err(Into::into)
}

pub async fn delete_saved_search(pool: &SqlitePool, bus: &EventBus, id: &str) -> Result<()> {
    let ts = now();
    let mut tx = pool.begin().await?;
    sqlx::query("UPDATE saved_searches SET deleted_at = ?, updated_at = ? WHERE id = ?")
        .bind(&ts)
        .bind(&ts)
        .bind(id)
        .execute(&mut *tx)
        .await?;
    append_changelog(&mut tx, "saved_search", id, ChangeOp::Delete, &serde_json::json!({})).await?;
    tx.commit().await?;

    bus.emit(DomainEvent::SavedSearchChanged);
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::repo::db::connect_in_memory;

    #[tokio::test]
    async fn create_list_and_delete() {
        let pool = connect_in_memory().await.unwrap();
        let bus = EventBus::new();

        let s = create_saved_search(&pool, &bus, "urgent report", Some("{\"status\":\"ACTIVE\"}"))
            .await
            .unwrap();
        assert_eq!(s.query, "urgent report");
        assert_eq!(s.filters_json.as_deref(), Some("{\"status\":\"ACTIVE\"}"));

        let all = list_saved_searches(&pool).await.unwrap();
        assert_eq!(all.len(), 1);

        delete_saved_search(&pool, &bus, &s.id).await.unwrap();
        assert!(list_saved_searches(&pool).await.unwrap().is_empty());
    }
}
