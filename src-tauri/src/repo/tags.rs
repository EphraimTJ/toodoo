use serde::Serialize;
use sqlx::SqlitePool;

use crate::error::{RepoError, Result};
use crate::events::{DomainEvent, EventBus};

use super::{append_changelog, new_id, now, ChangeOp};

#[derive(Debug, Clone, Serialize, sqlx::FromRow)]
#[serde(rename_all = "camelCase")]
pub struct Tag {
    pub id: String,
    pub name: String,
    pub color: Option<String>,
    pub parent_id: Option<String>,
    pub sort_order: i64,
}

async fn name_taken(pool: &SqlitePool, name: &str, exclude_id: Option<&str>) -> Result<bool> {
    Ok(sqlx::query_scalar(
        "SELECT EXISTS(SELECT 1 FROM tags WHERE lower(name) = lower(?)
                       AND deleted_at IS NULL AND id <> COALESCE(?, ''))",
    )
    .bind(name)
    .bind(exclude_id)
    .fetch_one(pool)
    .await?)
}

pub async fn create_tag(
    pool: &SqlitePool,
    bus: &EventBus,
    name: &str,
    color: Option<&str>,
) -> Result<Tag> {
    let name = name.trim();
    if name.is_empty() {
        return Err(RepoError::Invalid("tag name cannot be empty".into()));
    }
    if name_taken(pool, name, None).await? {
        return Err(RepoError::Invalid(format!("tag \"{name}\" already exists")));
    }
    let id = new_id();
    let ts = now();
    let mut tx = pool.begin().await?;
    let next_order: i64 = sqlx::query_scalar(
        "SELECT COALESCE(MAX(sort_order) + 1, 0) FROM tags WHERE deleted_at IS NULL",
    )
    .fetch_one(&mut *tx)
    .await?;
    sqlx::query(
        "INSERT INTO tags (id, name, color, sort_order, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)",
    )
    .bind(&id)
    .bind(name)
    .bind(color)
    .bind(next_order)
    .bind(&ts)
    .bind(&ts)
    .execute(&mut *tx)
    .await?;
    append_changelog(&mut tx, "tag", &id, ChangeOp::Insert, &serde_json::json!({ "name": name }))
        .await?;
    tx.commit().await?;
    bus.emit(DomainEvent::TagCreated { id: id.clone() });
    Ok(Tag { id, name: name.to_string(), color: color.map(String::from), parent_id: None, sort_order: next_order })
}

pub async fn list_tags(pool: &SqlitePool) -> Result<Vec<Tag>> {
    Ok(sqlx::query_as(
        "SELECT id, name, color, parent_id, sort_order FROM tags
         WHERE deleted_at IS NULL ORDER BY sort_order, name",
    )
    .fetch_all(pool)
    .await?)
}

pub async fn update_tag(
    pool: &SqlitePool,
    bus: &EventBus,
    id: &str,
    name: Option<&str>,
    color: Option<Option<&str>>,
) -> Result<()> {
    if let Some(name) = name {
        if name_taken(pool, name, Some(id)).await? {
            return Err(RepoError::Invalid(format!("tag \"{name}\" already exists")));
        }
    }
    let ts = now();
    let mut tx = pool.begin().await?;
    let res = sqlx::query(
        "UPDATE tags SET name = COALESCE(?, name),
                         color = CASE WHEN ? THEN ? ELSE color END,
                         updated_at = ?
         WHERE id = ? AND deleted_at IS NULL",
    )
    .bind(name)
    .bind(color.is_some())
    .bind(color.flatten())
    .bind(&ts)
    .bind(id)
    .execute(&mut *tx)
    .await?;
    if res.rows_affected() == 0 {
        return Err(RepoError::NotFound(format!("tag {id}")));
    }
    append_changelog(&mut tx, "tag", id, ChangeOp::Update, &serde_json::json!({})).await?;
    tx.commit().await?;
    bus.emit(DomainEvent::TagUpdated { id: id.to_string() });
    Ok(())
}

/// Deleting a tag removes it from every task; the tasks themselves are
/// untouched (docs/decisions.md).
pub async fn delete_tag(pool: &SqlitePool, bus: &EventBus, id: &str) -> Result<()> {
    let ts = now();
    let mut tx = pool.begin().await?;
    let res = sqlx::query(
        "UPDATE tags SET deleted_at = ?, updated_at = ? WHERE id = ? AND deleted_at IS NULL",
    )
    .bind(&ts)
    .bind(&ts)
    .bind(id)
    .execute(&mut *tx)
    .await?;
    if res.rows_affected() == 0 {
        return Err(RepoError::NotFound(format!("tag {id}")));
    }
    sqlx::query("UPDATE task_tags SET deleted_at = ?, updated_at = ? WHERE tag_id = ? AND deleted_at IS NULL")
        .bind(&ts)
        .bind(&ts)
        .bind(id)
        .execute(&mut *tx)
        .await?;
    append_changelog(&mut tx, "tag", id, ChangeOp::Delete, &serde_json::json!({})).await?;
    tx.commit().await?;
    bus.emit(DomainEvent::TagDeleted { id: id.to_string() });
    Ok(())
}

/// Idempotent: assigning an already-assigned tag is a no-op (revives a
/// soft-deleted assignment).
pub async fn assign_tag(pool: &SqlitePool, bus: &EventBus, task_id: &str, tag_id: &str) -> Result<()> {
    let ts = now();
    let mut tx = pool.begin().await?;
    sqlx::query(
        "INSERT INTO task_tags (task_id, tag_id, created_at, updated_at, deleted_at)
         VALUES (?, ?, ?, ?, NULL)
         ON CONFLICT(task_id, tag_id) DO UPDATE SET deleted_at = NULL, updated_at = excluded.updated_at",
    )
    .bind(task_id)
    .bind(tag_id)
    .bind(&ts)
    .bind(&ts)
    .execute(&mut *tx)
    .await?;
    append_changelog(
        &mut tx,
        "task_tag",
        task_id,
        ChangeOp::Update,
        &serde_json::json!({ "tagId": tag_id, "assigned": true }),
    )
    .await?;
    tx.commit().await?;
    bus.emit(DomainEvent::TaskTagsChanged { task_id: task_id.to_string() });
    Ok(())
}

pub async fn unassign_tag(pool: &SqlitePool, bus: &EventBus, task_id: &str, tag_id: &str) -> Result<()> {
    let ts = now();
    let mut tx = pool.begin().await?;
    sqlx::query(
        "UPDATE task_tags SET deleted_at = ?, updated_at = ?
         WHERE task_id = ? AND tag_id = ? AND deleted_at IS NULL",
    )
    .bind(&ts)
    .bind(&ts)
    .bind(task_id)
    .bind(tag_id)
    .execute(&mut *tx)
    .await?;
    append_changelog(
        &mut tx,
        "task_tag",
        task_id,
        ChangeOp::Update,
        &serde_json::json!({ "tagId": tag_id, "assigned": false }),
    )
    .await?;
    tx.commit().await?;
    bus.emit(DomainEvent::TaskTagsChanged { task_id: task_id.to_string() });
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::repo::db::connect_in_memory;
    use crate::repo::tasks::tests::quick;
    use crate::repo::tasks::{create_task, get_task};

    #[tokio::test]
    async fn duplicate_name_rejected_case_insensitively() {
        let pool = connect_in_memory().await.unwrap();
        let bus = EventBus::new();
        create_tag(&pool, &bus, "Errands", None).await.unwrap();
        assert!(matches!(
            create_tag(&pool, &bus, "errands", None).await,
            Err(RepoError::Invalid(_))
        ));
    }

    #[tokio::test]
    async fn assign_is_idempotent_and_unassign_removes() {
        let pool = connect_in_memory().await.unwrap();
        let bus = EventBus::new();
        let task = create_task(&pool, &bus, quick("inbox", "t")).await.unwrap();
        let tag = create_tag(&pool, &bus, "home", Some("#00ff00")).await.unwrap();

        assign_tag(&pool, &bus, &task.id, &tag.id).await.unwrap();
        assign_tag(&pool, &bus, &task.id, &tag.id).await.unwrap();
        assert_eq!(get_task(&pool, &task.id).await.unwrap().tag_ids, vec![tag.id.clone()]);

        unassign_tag(&pool, &bus, &task.id, &tag.id).await.unwrap();
        assert!(get_task(&pool, &task.id).await.unwrap().tag_ids.is_empty());

        // Re-assign revives the soft-deleted row.
        assign_tag(&pool, &bus, &task.id, &tag.id).await.unwrap();
        assert_eq!(get_task(&pool, &task.id).await.unwrap().tag_ids.len(), 1);
    }

    #[tokio::test]
    async fn list_tag_tasks_filters_by_tag_and_excludes_trashed() {
        use crate::repo::tasks::{list_tag_tasks, trash_task};

        let pool = connect_in_memory().await.unwrap();
        let bus = EventBus::new();
        let tagged = create_task(&pool, &bus, quick("inbox", "tagged")).await.unwrap();
        let other = create_task(&pool, &bus, quick("inbox", "untagged")).await.unwrap();
        let doomed = create_task(&pool, &bus, quick("inbox", "tagged then trashed")).await.unwrap();
        let tag = create_tag(&pool, &bus, "focus", None).await.unwrap();
        assign_tag(&pool, &bus, &tagged.id, &tag.id).await.unwrap();
        assign_tag(&pool, &bus, &doomed.id, &tag.id).await.unwrap();
        trash_task(&pool, &bus, &doomed.id).await.unwrap();

        let hits = list_tag_tasks(&pool, &tag.id).await.unwrap();
        let titles: Vec<&str> = hits.iter().map(|t| t.title.as_str()).collect();
        assert_eq!(titles, vec!["tagged"]);
        assert!(!titles.contains(&other.title.as_str()));

        // Unassigning removes it from the view.
        unassign_tag(&pool, &bus, &tagged.id, &tag.id).await.unwrap();
        assert!(list_tag_tasks(&pool, &tag.id).await.unwrap().is_empty());
    }

    #[tokio::test]
    async fn deleting_tag_unassigns_but_keeps_tasks() {
        let pool = connect_in_memory().await.unwrap();
        let bus = EventBus::new();
        let task = create_task(&pool, &bus, quick("inbox", "keep me")).await.unwrap();
        let tag = create_tag(&pool, &bus, "doomed", None).await.unwrap();
        assign_tag(&pool, &bus, &task.id, &tag.id).await.unwrap();

        delete_tag(&pool, &bus, &tag.id).await.unwrap();
        assert!(list_tags(&pool).await.unwrap().is_empty());
        let task = get_task(&pool, &task.id).await.unwrap();
        assert!(task.tag_ids.is_empty());
        assert_eq!(task.title, "keep me");
    }
}
