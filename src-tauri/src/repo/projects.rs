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
    let mut tx = pool.begin().await?;
    let id = create_project_core(&mut tx, &input).await?;
    tx.commit().await?;

    bus.emit(DomainEvent::ProjectCreated { id: id.clone() });
    get_project(pool, &id).await
}

/// Insert + changelog for a new project, inside the caller's transaction
/// (shared by `create_project` and the atomic CSV import). Returns the new
/// id; the caller emits `ProjectCreated` after its commit.
pub(crate) async fn create_project_core(
    conn: &mut sqlx::SqliteConnection,
    input: &NewProject,
) -> Result<String> {
    let id = new_id();
    let ts = now();
    let kind = input.kind.clone().unwrap_or_else(|| "TASK".to_string());

    let next_order: i64 = sqlx::query_scalar(
        "SELECT COALESCE(MAX(sort_order) + 1, 0) FROM projects WHERE deleted_at IS NULL",
    )
    .fetch_one(&mut *conn)
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
    .execute(&mut *conn)
    .await?;

    let payload = serde_json::json!({ "name": input.name, "kind": kind });
    append_changelog(conn, "project", &id, ChangeOp::Insert, &payload).await?;
    Ok(id)
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

/// Deleting a project moves its tasks to the Trash; restoring one of those
/// tasks later re-homes it to the Inbox (docs/decisions.md). The Inbox itself
/// can never be deleted.
pub async fn soft_delete_project(pool: &SqlitePool, bus: &EventBus, id: &str) -> Result<()> {
    if id == INBOX_ID {
        return Err(RepoError::Invalid("the Inbox cannot be deleted".into()));
    }
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
    let task_ids: Vec<String> = sqlx::query_scalar(
        "SELECT id FROM tasks WHERE project_id = ? AND deleted_at IS NULL AND status <> 'TRASHED'",
    )
    .bind(id)
    .fetch_all(&mut *tx)
    .await?;
    for task_id in &task_ids {
        sqlx::query("UPDATE tasks SET status = 'TRASHED', updated_at = ? WHERE id = ?")
            .bind(&ts)
            .bind(task_id)
            .execute(&mut *tx)
            .await?;
        append_changelog(
            &mut tx,
            "task",
            task_id,
            ChangeOp::Update,
            &serde_json::json!({ "status": "TRASHED" }),
        )
        .await?;
    }
    append_changelog(&mut tx, "project", id, ChangeOp::Delete, &serde_json::json!({})).await?;
    tx.commit().await?;

    if !task_ids.is_empty() {
        bus.emit(DomainEvent::TaskTrashed { ids: task_ids });
    }
    bus.emit(DomainEvent::ProjectDeleted { id: id.to_string() });
    Ok(())
}

pub const INBOX_ID: &str = "inbox";

#[derive(Debug, Clone, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectPatch {
    #[serde(default)]
    pub name: Option<String>,
    #[serde(default)]
    pub color: Option<Option<String>>,
    #[serde(default)]
    pub icon: Option<Option<String>>,
    #[serde(default)]
    pub folder_id: Option<Option<String>>,
    #[serde(default)]
    pub view_mode: Option<String>,
}

/// The Inbox cannot be renamed or moved into a folder (docs/decisions.md);
/// its color/icon/view mode may change.
pub async fn update_project(
    pool: &SqlitePool,
    bus: &EventBus,
    id: &str,
    patch: ProjectPatch,
) -> Result<Project> {
    if id == INBOX_ID && (patch.name.is_some() || patch.folder_id.is_some()) {
        return Err(RepoError::Invalid("the Inbox cannot be renamed or moved".into()));
    }
    let ts = now();
    let mut tx = pool.begin().await?;
    let res = sqlx::query(
        "UPDATE projects SET name = COALESCE(?, name),
                             color = CASE WHEN ? THEN ? ELSE color END,
                             icon = CASE WHEN ? THEN ? ELSE icon END,
                             folder_id = CASE WHEN ? THEN ? ELSE folder_id END,
                             view_mode = COALESCE(?, view_mode),
                             updated_at = ?
         WHERE id = ? AND deleted_at IS NULL",
    )
    .bind(&patch.name)
    .bind(patch.color.is_some())
    .bind(patch.color.clone().flatten())
    .bind(patch.icon.is_some())
    .bind(patch.icon.clone().flatten())
    .bind(patch.folder_id.is_some())
    .bind(patch.folder_id.clone().flatten())
    .bind(&patch.view_mode)
    .bind(&ts)
    .bind(id)
    .execute(&mut *tx)
    .await?;
    if res.rows_affected() == 0 {
        return Err(RepoError::NotFound(format!("project {id}")));
    }
    append_changelog(&mut tx, "project", id, ChangeOp::Update, &serde_json::json!({})).await?;
    tx.commit().await?;
    bus.emit(DomainEvent::ProjectUpdated { id: id.to_string() });
    get_project(pool, id).await
}

/// Manual sidebar reorder; `after_id = None` moves to the top.
pub async fn reorder_project(
    pool: &SqlitePool,
    bus: &EventBus,
    id: &str,
    after_id: Option<&str>,
) -> Result<()> {
    let mut ordered: Vec<String> = sqlx::query_scalar(
        "SELECT id FROM projects WHERE deleted_at IS NULL AND id <> ?
         ORDER BY sort_order, created_at",
    )
    .bind(id)
    .fetch_all(pool)
    .await?;
    let insert_index = match after_id {
        None => 0,
        Some(after) => {
            ordered
                .iter()
                .position(|p| p == after)
                .ok_or_else(|| RepoError::NotFound(format!("project {after}")))?
                + 1
        }
    };
    ordered.insert(insert_index.min(ordered.len()), id.to_string());

    let ts = now();
    let mut tx = pool.begin().await?;
    for (position, project_id) in ordered.iter().enumerate() {
        sqlx::query("UPDATE projects SET sort_order = ?, updated_at = ? WHERE id = ?")
            .bind(position as i64)
            .bind(&ts)
            .bind(project_id)
            .execute(&mut *tx)
            .await?;
    }
    append_changelog(&mut tx, "project", id, ChangeOp::Update, &serde_json::json!({ "reordered": true }))
        .await?;
    tx.commit().await?;
    bus.emit(DomainEvent::ProjectUpdated { id: id.to_string() });
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

        // The seeded Inbox plus the new project.
        let listed = list_projects(&pool).await.unwrap();
        assert_eq!(listed.len(), 2);
        assert!(listed.iter().any(|p| p.id == created.id));
        assert!(listed.iter().any(|p| p.id == INBOX_ID));
    }

    #[tokio::test]
    async fn projects_get_sequential_sort_orders() {
        let pool = connect_in_memory().await.unwrap();
        let bus = EventBus::new();
        let a = create_project(&pool, &bus, new_input("A")).await.unwrap();
        let b = create_project(&pool, &bus, new_input("B")).await.unwrap();
        assert_eq!(b.sort_order, a.sort_order + 1);
    }

    #[tokio::test]
    async fn soft_delete_hides_from_list_but_keeps_row() {
        let pool = connect_in_memory().await.unwrap();
        let bus = EventBus::new();
        let p = create_project(&pool, &bus, new_input("Doomed")).await.unwrap();

        soft_delete_project(&pool, &bus, &p.id).await.unwrap();
        assert!(list_projects(&pool).await.unwrap().iter().all(|x| x.id != p.id));
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
    async fn inbox_cannot_be_deleted_renamed_or_moved() {
        let pool = connect_in_memory().await.unwrap();
        let bus = EventBus::new();

        assert!(matches!(
            soft_delete_project(&pool, &bus, INBOX_ID).await,
            Err(RepoError::Invalid(_))
        ));
        assert!(matches!(
            update_project(
                &pool,
                &bus,
                INBOX_ID,
                ProjectPatch { name: Some("Not Inbox".into()), ..Default::default() },
            )
            .await,
            Err(RepoError::Invalid(_))
        ));
        // Color is allowed.
        let p = update_project(
            &pool,
            &bus,
            INBOX_ID,
            ProjectPatch { color: Some(Some("#4772fa".into())), ..Default::default() },
        )
        .await
        .unwrap();
        assert_eq!(p.color.as_deref(), Some("#4772fa"));
    }

    #[tokio::test]
    async fn deleting_project_trashes_its_tasks() {
        use crate::repo::tasks::{create_task, get_task, restore_task, tests::quick, SmartView};

        let pool = connect_in_memory().await.unwrap();
        let bus = EventBus::new();
        let p = create_project(&pool, &bus, new_input("Short-lived")).await.unwrap();
        let t = create_task(&pool, &bus, quick(&p.id, "stranded")).await.unwrap();

        soft_delete_project(&pool, &bus, &p.id).await.unwrap();
        assert_eq!(get_task(&pool, &t.id).await.unwrap().status, "TRASHED");

        // Restoring re-homes to Inbox because the project is gone.
        let restored = restore_task(&pool, &bus, &t.id).await.unwrap();
        assert_eq!(restored.project_id, INBOX_ID);
        assert_eq!(restored.status, "ACTIVE");

        let trash = crate::repo::tasks::list_smart(&pool, SmartView::Trash, "2026-07-14", 0)
            .await
            .unwrap();
        assert!(trash.is_empty());
    }

    #[tokio::test]
    async fn reorder_projects_to_top_and_middle() {
        let pool = connect_in_memory().await.unwrap();
        let bus = EventBus::new();
        let a = create_project(&pool, &bus, new_input("A")).await.unwrap();
        let b = create_project(&pool, &bus, new_input("B")).await.unwrap();
        let c = create_project(&pool, &bus, new_input("C")).await.unwrap();

        let names = |projects: &[Project]| -> Vec<String> {
            projects.iter().filter(|p| p.id != INBOX_ID).map(|p| p.name.clone()).collect()
        };

        reorder_project(&pool, &bus, &c.id, None).await.unwrap();
        assert_eq!(names(&list_projects(&pool).await.unwrap()), ["C", "A", "B"]);

        reorder_project(&pool, &bus, &a.id, Some(&b.id)).await.unwrap();
        assert_eq!(names(&list_projects(&pool).await.unwrap()), ["C", "B", "A"]);
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
