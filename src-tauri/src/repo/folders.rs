use serde::{Deserialize, Serialize};
use sqlx::SqlitePool;

use crate::error::{RepoError, Result};
use crate::events::{DomainEvent, EventBus};

use super::{append_changelog, new_id, now, ChangeOp};

#[derive(Debug, Clone, Serialize, sqlx::FromRow)]
#[serde(rename_all = "camelCase")]
pub struct Folder {
    pub id: String,
    pub name: String,
    pub color: Option<String>,
    pub sort_order: i64,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FolderPatch {
    #[serde(default)]
    pub name: Option<String>,
    #[serde(default)]
    pub color: Option<Option<String>>,
    #[serde(default)]
    pub sort_order: Option<i64>,
}

pub async fn create_folder(pool: &SqlitePool, bus: &EventBus, name: &str) -> Result<Folder> {
    let id = new_id();
    let ts = now();
    let mut tx = pool.begin().await?;
    let next_order: i64 = sqlx::query_scalar(
        "SELECT COALESCE(MAX(sort_order) + 1, 0) FROM folders WHERE deleted_at IS NULL",
    )
    .fetch_one(&mut *tx)
    .await?;
    sqlx::query(
        "INSERT INTO folders (id, name, sort_order, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?)",
    )
    .bind(&id)
    .bind(name)
    .bind(next_order)
    .bind(&ts)
    .bind(&ts)
    .execute(&mut *tx)
    .await?;
    append_changelog(&mut tx, "folder", &id, ChangeOp::Insert, &serde_json::json!({ "name": name }))
        .await?;
    tx.commit().await?;
    bus.emit(DomainEvent::FolderCreated { id: id.clone() });
    get_folder(pool, &id).await
}

pub async fn get_folder(pool: &SqlitePool, id: &str) -> Result<Folder> {
    sqlx::query_as(
        "SELECT id, name, color, sort_order, created_at, updated_at
         FROM folders WHERE id = ? AND deleted_at IS NULL",
    )
    .bind(id)
    .fetch_optional(pool)
    .await?
    .ok_or_else(|| RepoError::NotFound(format!("folder {id}")))
}

pub async fn list_folders(pool: &SqlitePool) -> Result<Vec<Folder>> {
    Ok(sqlx::query_as(
        "SELECT id, name, color, sort_order, created_at, updated_at
         FROM folders WHERE deleted_at IS NULL ORDER BY sort_order, created_at",
    )
    .fetch_all(pool)
    .await?)
}

pub async fn update_folder(
    pool: &SqlitePool,
    bus: &EventBus,
    id: &str,
    patch: FolderPatch,
) -> Result<Folder> {
    let ts = now();
    let mut tx = pool.begin().await?;
    let res = sqlx::query(
        "UPDATE folders SET name = COALESCE(?, name),
                            color = CASE WHEN ? THEN ? ELSE color END,
                            sort_order = COALESCE(?, sort_order),
                            updated_at = ?
         WHERE id = ? AND deleted_at IS NULL",
    )
    .bind(&patch.name)
    .bind(patch.color.is_some())
    .bind(patch.color.clone().flatten())
    .bind(patch.sort_order)
    .bind(&ts)
    .bind(id)
    .execute(&mut *tx)
    .await?;
    if res.rows_affected() == 0 {
        return Err(RepoError::NotFound(format!("folder {id}")));
    }
    append_changelog(&mut tx, "folder", id, ChangeOp::Update, &serde_json::json!({})).await?;
    tx.commit().await?;
    bus.emit(DomainEvent::FolderUpdated { id: id.to_string() });
    get_folder(pool, id).await
}

/// Deleting a folder ungroups its lists — it never deletes them
/// (docs/decisions.md).
pub async fn soft_delete_folder(pool: &SqlitePool, bus: &EventBus, id: &str) -> Result<()> {
    let ts = now();
    let mut tx = pool.begin().await?;
    let res = sqlx::query(
        "UPDATE folders SET deleted_at = ?, updated_at = ? WHERE id = ? AND deleted_at IS NULL",
    )
    .bind(&ts)
    .bind(&ts)
    .bind(id)
    .execute(&mut *tx)
    .await?;
    if res.rows_affected() == 0 {
        return Err(RepoError::NotFound(format!("folder {id}")));
    }
    sqlx::query("UPDATE projects SET folder_id = NULL, updated_at = ? WHERE folder_id = ?")
        .bind(&ts)
        .bind(id)
        .execute(&mut *tx)
        .await?;
    append_changelog(&mut tx, "folder", id, ChangeOp::Delete, &serde_json::json!({})).await?;
    tx.commit().await?;
    bus.emit(DomainEvent::FolderDeleted { id: id.to_string() });
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::repo::db::connect_in_memory;
    use crate::repo::projects::{create_project, get_project, NewProject};

    #[tokio::test]
    async fn deleting_folder_ungroups_projects() {
        let pool = connect_in_memory().await.unwrap();
        let bus = EventBus::new();
        let folder = create_folder(&pool, &bus, "Work").await.unwrap();
        let project = create_project(
            &pool,
            &bus,
            NewProject { name: "Q3".into(), color: None, icon: None, kind: None },
        )
        .await
        .unwrap();
        sqlx::query("UPDATE projects SET folder_id = ? WHERE id = ?")
            .bind(&folder.id)
            .bind(&project.id)
            .execute(&pool)
            .await
            .unwrap();

        soft_delete_folder(&pool, &bus, &folder.id).await.unwrap();
        let p = get_project(&pool, &project.id).await.unwrap();
        assert_eq!(p.folder_id, None, "project must survive folder deletion, ungrouped");
    }

    #[tokio::test]
    async fn folder_rename_and_color() {
        let pool = connect_in_memory().await.unwrap();
        let bus = EventBus::new();
        let f = create_folder(&pool, &bus, "Home").await.unwrap();
        let f = update_folder(
            &pool,
            &bus,
            &f.id,
            FolderPatch { name: Some("Household".into()), color: Some(Some("#ff0000".into())), ..Default::default() },
        )
        .await
        .unwrap();
        assert_eq!(f.name, "Household");
        assert_eq!(f.color.as_deref(), Some("#ff0000"));
    }
}
