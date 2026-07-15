use serde::{Deserialize, Serialize};
use sqlx::SqlitePool;

use crate::error::{RepoError, Result};
use crate::events::{DomainEvent, EventBus};

use super::{append_changelog, new_id, now, ChangeOp};

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
#[serde(rename_all = "camelCase")]
pub struct Project {
    pub id: String,
    pub folder_id: Option<String>,
    pub name: String,
    pub color: Option<String>,
    pub icon: Option<String>,
    pub kind: String,
    pub view_mode: String,
    pub muted: bool,
    pub sort_order: i64,
    pub closed: bool,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NewProject {
    pub name: String,
    #[serde(default)]
    pub color: Option<String>,
    #[serde(default)]
    pub icon: Option<String>,
    /// TASK (default) or NOTE.
    #[serde(default)]
    pub kind: Option<String>,
}

const COLUMNS: &str =
    "id, folder_id, name, color, icon, kind, view_mode, muted, sort_order, closed, \
     created_at, updated_at";

pub async fn create_project(pool: &SqlitePool, bus: &EventBus, input: NewProject) -> Result<Project> {
    let id = new_id();
    let ts = now();
    let kind = input.kind.unwrap_or_else(|| "TASK".to_string());

    let mut tx = pool.begin().await?;
    let next_order: i64 = sqlx::query_scalar(
        "SELECT COALESCE(MAX(sort_order) + 1, 0) FROM projects WHERE deleted_at IS NULL",
    )
    .fetch_one(&mut *tx)
    .await?;

    sqlx::query(
        "INSERT INTO projects (id, name, color, icon, kind, view_mode, muted, sort_order, closed,
                               created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, 'LIST', 0, ?, 0, ?, ?)",
    )
    .bind(&id)
    .bind(&input.name)
    .bind(&input.color)
    .bind(&input.icon)
    .bind(&kind)
    .bind(next_order)
    .bind(&ts)
    .bind(&ts)
    .execute(&mut *tx)
    .await?;

    let payload = serde_json::json!({ "name": input.name, "kind": kind });
    append_changelog(&mut tx, "project", &id, ChangeOp::Insert, &payload).await?;
    tx.commit().await?;

    bus.emit(DomainEvent::ProjectCreated { id: id.clone() });
    get_project(pool, &id).await
}

pub async fn get_project(pool: &SqlitePool, id: &str) -> Result<Project> {
    sqlx::query_as::<_, Project>(&format!(
        "SELECT {COLUMNS} FROM projects WHERE id = ? AND deleted_at IS NULL"
    ))
    .bind(id)
    .fetch_optional(pool)
    .await?
    .ok_or_else(|| RepoError::NotFound(format!("project {id}")))
}

pub async fn list_projects(pool: &SqlitePool) -> Result<Vec<Project>> {
    Ok(sqlx::query_as::<_, Project>(&format!(
        "SELECT {COLUMNS} FROM projects WHERE deleted_at IS NULL ORDER BY sort_order, created_at"
    ))
    .fetch_all(pool)
    .await?)
}

pub async fn soft_delete_project(pool: &SqlitePool, bus: &EventBus, id: &str) -> Result<()> {
    let ts = now();
    let mut tx = pool.begin().await?;
    let res = sqlx::query(
        "UPDATE projects SET deleted_at = ?, updated_at = ? WHERE id = ? AND deleted_at IS NULL",
    )
    .bind(&ts)
    .bind(&ts)
    .bind(id)
    .execute(&mut *tx)
    .await?;
    if res.rows_affected() == 0 {
        return Err(RepoError::NotFound(format!("project {id}")));
    }
    append_changelog(&mut tx, "project", id, ChangeOp::Delete, &serde_json::json!({})).await?;
    tx.commit().await?;

    bus.emit(DomainEvent::ProjectDeleted { id: id.to_string() });
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::repo::db::connect_in_memory;

    fn new_input(name: &str) -> NewProject {
        NewProject { name: name.into(), color: None, icon: None, kind: None }
    }

    #[tokio::test]
    async fn create_then_list_round_trip() {
        let pool = connect_in_memory().await.unwrap();
        let bus = EventBus::new();

        let created = create_project(&pool, &bus, new_input("Errands")).await.unwrap();
        assert_eq!(created.name, "Errands");
        assert_eq!(created.kind, "TASK");
        assert_eq!(created.view_mode, "LIST");

        let listed = list_projects(&pool).await.unwrap();
        assert_eq!(listed.len(), 1);
        assert_eq!(listed[0].id, created.id);
    }

    #[tokio::test]
    async fn projects_get_sequential_sort_orders() {
        let pool = connect_in_memory().await.unwrap();
        let bus = EventBus::new();
        let a = create_project(&pool, &bus, new_input("A")).await.unwrap();
        let b = create_project(&pool, &bus, new_input("B")).await.unwrap();
        assert_eq!(a.sort_order, 0);
        assert_eq!(b.sort_order, 1);
    }

    #[tokio::test]
    async fn soft_delete_hides_from_list_but_keeps_row() {
        let pool = connect_in_memory().await.unwrap();
        let bus = EventBus::new();
        let p = create_project(&pool, &bus, new_input("Doomed")).await.unwrap();

        soft_delete_project(&pool, &bus, &p.id).await.unwrap();
        assert!(list_projects(&pool).await.unwrap().is_empty());
        assert!(matches!(
            get_project(&pool, &p.id).await,
            Err(RepoError::NotFound(_))
        ));

        // Row still exists (soft delete, not DELETE).
        let raw: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM projects WHERE id = ?")
            .bind(&p.id)
            .fetch_one(&pool)
            .await
            .unwrap();
        assert_eq!(raw, 1);
    }

    #[tokio::test]
    async fn deleting_missing_project_is_not_found() {
        let pool = connect_in_memory().await.unwrap();
        let bus = EventBus::new();
        assert!(matches!(
            soft_delete_project(&pool, &bus, "nope").await,
            Err(RepoError::NotFound(_))
        ));
    }

    #[tokio::test]
    async fn every_mutation_appends_a_changelog_row() {
        let pool = connect_in_memory().await.unwrap();
        let bus = EventBus::new();
        let p = create_project(&pool, &bus, new_input("Tracked")).await.unwrap();
        soft_delete_project(&pool, &bus, &p.id).await.unwrap();

        let ops: Vec<String> = sqlx::query_scalar(
            "SELECT op FROM changelog WHERE entity_kind = 'project' AND entity_id = ? ORDER BY at",
        )
        .bind(&p.id)
        .fetch_all(&pool)
        .await
        .unwrap();
        assert_eq!(ops, vec!["INSERT".to_string(), "DELETE".to_string()]);
    }

    #[tokio::test]
    async fn mutations_emit_domain_events() {
        let pool = connect_in_memory().await.unwrap();
        let bus = EventBus::new();
        let mut rx = bus.subscribe();

        let p = create_project(&pool, &bus, new_input("Evented")).await.unwrap();
        soft_delete_project(&pool, &bus, &p.id).await.unwrap();

        assert!(matches!(rx.recv().await.unwrap(), DomainEvent::ProjectCreated { id } if id == p.id));
        assert!(matches!(rx.recv().await.unwrap(), DomainEvent::ProjectDeleted { id } if id == p.id));
    }
}
