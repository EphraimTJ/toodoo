use serde::Serialize;
use sqlx::SqlitePool;

use crate::error::{RepoError, Result};
use crate::events::{DomainEvent, EventBus};

use super::{append_changelog, new_id, now, ChangeOp};

#[derive(Debug, Clone, Serialize, sqlx::FromRow)]
#[serde(rename_all = "camelCase")]
pub struct CheckItem {
    pub id: String,
    pub task_id: String,
    pub title: String,
    pub done: bool,
    pub sort_order: i64,
}

pub async fn add_check_item(
    pool: &SqlitePool,
    bus: &EventBus,
    task_id: &str,
    title: &str,
) -> Result<CheckItem> {
    let id = new_id();
    let ts = now();
    let mut tx = pool.begin().await?;
    let next_order: i64 = sqlx::query_scalar(
        "SELECT COALESCE(MAX(sort_order) + 1, 0) FROM check_items
         WHERE task_id = ? AND deleted_at IS NULL",
    )
    .bind(task_id)
    .fetch_one(&mut *tx)
    .await?;
    sqlx::query(
        "INSERT INTO check_items (id, task_id, title, done, sort_order, created_at, updated_at)
         VALUES (?, ?, ?, 0, ?, ?, ?)",
    )
    .bind(&id)
    .bind(task_id)
    .bind(title)
    .bind(next_order)
    .bind(&ts)
    .bind(&ts)
    .execute(&mut *tx)
    .await?;
    append_changelog(
        &mut tx,
        "check_item",
        &id,
        ChangeOp::Insert,
        &serde_json::json!({ "taskId": task_id, "title": title }),
    )
    .await?;
    tx.commit().await?;
    bus.emit(DomainEvent::CheckItemChanged { task_id: task_id.to_string() });

    Ok(CheckItem { id, task_id: task_id.to_string(), title: title.to_string(), done: false, sort_order: next_order })
}

pub async fn list_check_items(pool: &SqlitePool, task_id: &str) -> Result<Vec<CheckItem>> {
    Ok(sqlx::query_as(
        "SELECT id, task_id, title, done, sort_order FROM check_items
         WHERE task_id = ? AND deleted_at IS NULL ORDER BY sort_order, created_at",
    )
    .bind(task_id)
    .fetch_all(pool)
    .await?)
}

pub async fn set_check_item(
    pool: &SqlitePool,
    bus: &EventBus,
    id: &str,
    title: Option<&str>,
    done: Option<bool>,
) -> Result<()> {
    let ts = now();
    let mut tx = pool.begin().await?;
    let task_id: Option<String> = sqlx::query_scalar(
        "SELECT task_id FROM check_items WHERE id = ? AND deleted_at IS NULL",
    )
    .bind(id)
    .fetch_optional(&mut *tx)
    .await?;
    let Some(task_id) = task_id else {
        return Err(RepoError::NotFound(format!("check item {id}")));
    };
    sqlx::query(
        "UPDATE check_items SET title = COALESCE(?, title), done = COALESCE(?, done),
                                updated_at = ?
         WHERE id = ?",
    )
    .bind(title)
    .bind(done)
    .bind(&ts)
    .bind(id)
    .execute(&mut *tx)
    .await?;
    append_changelog(&mut tx, "check_item", id, ChangeOp::Update, &serde_json::json!({})).await?;
    tx.commit().await?;
    bus.emit(DomainEvent::CheckItemChanged { task_id });
    Ok(())
}

pub async fn delete_check_item(pool: &SqlitePool, bus: &EventBus, id: &str) -> Result<()> {
    let ts = now();
    let mut tx = pool.begin().await?;
    let task_id: Option<String> = sqlx::query_scalar(
        "SELECT task_id FROM check_items WHERE id = ? AND deleted_at IS NULL",
    )
    .bind(id)
    .fetch_optional(&mut *tx)
    .await?;
    let Some(task_id) = task_id else {
        return Err(RepoError::NotFound(format!("check item {id}")));
    };
    sqlx::query("UPDATE check_items SET deleted_at = ?, updated_at = ? WHERE id = ?")
        .bind(&ts)
        .bind(&ts)
        .bind(id)
        .execute(&mut *tx)
        .await?;
    append_changelog(&mut tx, "check_item", id, ChangeOp::Delete, &serde_json::json!({})).await?;
    tx.commit().await?;
    bus.emit(DomainEvent::CheckItemChanged { task_id });
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::repo::db::connect_in_memory;
    use crate::repo::tasks::tests::quick;
    use crate::repo::tasks::create_task;

    #[tokio::test]
    async fn check_item_lifecycle() {
        let pool = connect_in_memory().await.unwrap();
        let bus = EventBus::new();
        let task = create_task(&pool, &bus, quick("inbox", "packing")).await.unwrap();

        let item = add_check_item(&pool, &bus, &task.id, "socks").await.unwrap();
        add_check_item(&pool, &bus, &task.id, "toothbrush").await.unwrap();
        assert_eq!(list_check_items(&pool, &task.id).await.unwrap().len(), 2);

        set_check_item(&pool, &bus, &item.id, None, Some(true)).await.unwrap();
        let items = list_check_items(&pool, &task.id).await.unwrap();
        assert!(items.iter().find(|i| i.id == item.id).unwrap().done);

        delete_check_item(&pool, &bus, &item.id).await.unwrap();
        assert_eq!(list_check_items(&pool, &task.id).await.unwrap().len(), 1);
    }
}
