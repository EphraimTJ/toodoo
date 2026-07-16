//! Task comments: a single-user running log/note thread on a task (plain text
//! v1). Backed by the `comments` table (migration 0001).

use serde::Serialize;
use sqlx::SqlitePool;

use crate::error::{RepoError, Result};
use crate::events::{DomainEvent, EventBus};

use super::{append_changelog, new_id, now, ChangeOp};

#[derive(Debug, Clone, Serialize, sqlx::FromRow)]
#[serde(rename_all = "camelCase")]
pub struct Comment {
    pub id: String,
    pub task_id: String,
    pub body: String,
    pub created_at: String,
    pub updated_at: String,
}

/// Comments on a task, oldest first (a running thread).
pub async fn list_comments(pool: &SqlitePool, task_id: &str) -> Result<Vec<Comment>> {
    Ok(sqlx::query_as(
        "SELECT id, task_id, body, created_at, updated_at FROM comments
         WHERE task_id = ? AND deleted_at IS NULL ORDER BY created_at, id",
    )
    .bind(task_id)
    .fetch_all(pool)
    .await?)
}

pub async fn add_comment(pool: &SqlitePool, bus: &EventBus, task_id: &str, body: &str) -> Result<Comment> {
    let body = body.trim();
    if body.is_empty() {
        return Err(RepoError::Invalid("comment cannot be empty".into()));
    }
    let id = new_id();
    let ts = now();
    let mut tx = pool.begin().await?;
    sqlx::query(
        "INSERT INTO comments (id, task_id, body, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
    )
    .bind(&id)
    .bind(task_id)
    .bind(body)
    .bind(&ts)
    .bind(&ts)
    .execute(&mut *tx)
    .await?;
    append_changelog(&mut tx, "comment", &id, ChangeOp::Insert, &serde_json::json!({ "taskId": task_id }))
        .await?;
    tx.commit().await?;
    bus.emit(DomainEvent::CommentChanged { task_id: task_id.to_string() });

    Ok(Comment {
        id,
        task_id: task_id.to_string(),
        body: body.to_string(),
        created_at: ts.clone(),
        updated_at: ts,
    })
}

pub async fn delete_comment(pool: &SqlitePool, bus: &EventBus, id: &str) -> Result<()> {
    let ts = now();
    let mut tx = pool.begin().await?;
    let task_id: Option<String> =
        sqlx::query_scalar("SELECT task_id FROM comments WHERE id = ? AND deleted_at IS NULL")
            .bind(id)
            .fetch_optional(&mut *tx)
            .await?;
    let Some(task_id) = task_id else {
        return Err(RepoError::NotFound(format!("comment {id}")));
    };
    sqlx::query("UPDATE comments SET deleted_at = ?, updated_at = ? WHERE id = ?")
        .bind(&ts)
        .bind(&ts)
        .bind(id)
        .execute(&mut *tx)
        .await?;
    append_changelog(&mut tx, "comment", id, ChangeOp::Delete, &serde_json::json!({})).await?;
    tx.commit().await?;
    bus.emit(DomainEvent::CommentChanged { task_id });
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::repo::db::connect_in_memory;
    use crate::repo::tasks::tests::quick;
    use crate::repo::tasks::create_task;

    #[tokio::test]
    async fn add_list_ordered_and_delete() {
        let pool = connect_in_memory().await.unwrap();
        let bus = EventBus::new();
        let task = create_task(&pool, &bus, quick("inbox", "t")).await.unwrap();

        let first = add_comment(&pool, &bus, &task.id, "first note").await.unwrap();
        add_comment(&pool, &bus, &task.id, "second note").await.unwrap();

        let all = list_comments(&pool, &task.id).await.unwrap();
        assert_eq!(all.iter().map(|c| c.body.as_str()).collect::<Vec<_>>(), ["first note", "second note"]);

        // Empty body rejected.
        assert!(matches!(add_comment(&pool, &bus, &task.id, "  ").await, Err(RepoError::Invalid(_))));

        delete_comment(&pool, &bus, &first.id).await.unwrap();
        let left = list_comments(&pool, &task.id).await.unwrap();
        assert_eq!(left.iter().map(|c| c.body.as_str()).collect::<Vec<_>>(), ["second note"]);
    }
}
