//! Sections = Kanban columns within a project. Tasks reference a section via
//! `tasks.section_id` (NULL = the implicit "No Section" column). Deleting a
//! section detaches its tasks rather than trashing them.

use serde::Serialize;
use sqlx::SqlitePool;

use crate::error::{RepoError, Result};
use crate::events::{DomainEvent, EventBus};

use super::{append_changelog, new_id, now, ChangeOp};

const SORT_STEP: i64 = 1024;

#[derive(Debug, Clone, Serialize, sqlx::FromRow)]
#[serde(rename_all = "camelCase")]
pub struct Section {
    pub id: String,
    pub project_id: String,
    pub name: String,
    pub sort_order: i64,
}

pub async fn list_sections(pool: &SqlitePool, project_id: &str) -> Result<Vec<Section>> {
    Ok(sqlx::query_as(
        "SELECT id, project_id, name, sort_order FROM sections
         WHERE project_id = ? AND deleted_at IS NULL ORDER BY sort_order, created_at",
    )
    .bind(project_id)
    .fetch_all(pool)
    .await?)
}

pub async fn create_section(
    pool: &SqlitePool,
    bus: &EventBus,
    project_id: &str,
    name: &str,
) -> Result<Section> {
    let id = new_id();
    let ts = now();
    let mut tx = pool.begin().await?;
    let next_order: i64 = sqlx::query_scalar(
        "SELECT COALESCE(MAX(sort_order), 0) + ? FROM sections
         WHERE project_id = ? AND deleted_at IS NULL",
    )
    .bind(SORT_STEP)
    .bind(project_id)
    .fetch_one(&mut *tx)
    .await?;
    sqlx::query(
        "INSERT INTO sections (id, project_id, name, sort_order, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)",
    )
    .bind(&id)
    .bind(project_id)
    .bind(name)
    .bind(next_order)
    .bind(&ts)
    .bind(&ts)
    .execute(&mut *tx)
    .await?;
    append_changelog(
        &mut tx,
        "section",
        &id,
        ChangeOp::Insert,
        &serde_json::json!({ "projectId": project_id, "name": name }),
    )
    .await?;
    tx.commit().await?;
    bus.emit(DomainEvent::SectionChanged { project_id: project_id.to_string() });
    Ok(Section { id, project_id: project_id.to_string(), name: name.to_string(), sort_order: next_order })
}

async fn project_of(pool: &SqlitePool, section_id: &str) -> Result<String> {
    sqlx::query_scalar("SELECT project_id FROM sections WHERE id = ? AND deleted_at IS NULL")
        .bind(section_id)
        .fetch_optional(pool)
        .await?
        .ok_or_else(|| RepoError::NotFound(format!("section {section_id}")))
}

pub async fn rename_section(pool: &SqlitePool, bus: &EventBus, id: &str, name: &str) -> Result<()> {
    let project_id = project_of(pool, id).await?;
    let ts = now();
    let mut tx = pool.begin().await?;
    sqlx::query("UPDATE sections SET name = ?, updated_at = ? WHERE id = ?")
        .bind(name)
        .bind(&ts)
        .bind(id)
        .execute(&mut *tx)
        .await?;
    append_changelog(&mut tx, "section", id, ChangeOp::Update, &serde_json::json!({ "name": name }))
        .await?;
    tx.commit().await?;
    bus.emit(DomainEvent::SectionChanged { project_id });
    Ok(())
}

/// Reorder `id` to sit immediately after `after_id` (None = first). Simple
/// full renumber of the project's sections in the new order — column counts are
/// small, so gap math isn't worth it here.
pub async fn reorder_section(
    pool: &SqlitePool,
    bus: &EventBus,
    id: &str,
    after_id: Option<&str>,
) -> Result<()> {
    let project_id = project_of(pool, id).await?;
    let mut order: Vec<String> = sqlx::query_scalar(
        "SELECT id FROM sections WHERE project_id = ? AND deleted_at IS NULL AND id <> ?
         ORDER BY sort_order, created_at",
    )
    .bind(&project_id)
    .bind(id)
    .fetch_all(pool)
    .await?;

    let index = match after_id {
        None => 0,
        Some(after) => order
            .iter()
            .position(|x| x == after)
            .ok_or_else(|| RepoError::NotFound(format!("section {after}")))?
            + 1,
    };
    order.insert(index.min(order.len()), id.to_string());

    let ts = now();
    let mut tx = pool.begin().await?;
    for (pos, sid) in order.iter().enumerate() {
        sqlx::query("UPDATE sections SET sort_order = ?, updated_at = ? WHERE id = ?")
            .bind((pos as i64 + 1) * SORT_STEP)
            .bind(&ts)
            .bind(sid)
            .execute(&mut *tx)
            .await?;
    }
    append_changelog(&mut tx, "section", id, ChangeOp::Update, &serde_json::json!({ "reordered": true }))
        .await?;
    tx.commit().await?;
    bus.emit(DomainEvent::SectionChanged { project_id });
    Ok(())
}

/// Delete a column; its tasks fall back to the "No Section" column.
pub async fn delete_section(pool: &SqlitePool, bus: &EventBus, id: &str) -> Result<()> {
    let project_id = project_of(pool, id).await?;
    let ts = now();
    let mut tx = pool.begin().await?;
    sqlx::query("UPDATE tasks SET section_id = NULL, updated_at = ? WHERE section_id = ?")
        .bind(&ts)
        .bind(id)
        .execute(&mut *tx)
        .await?;
    sqlx::query("UPDATE sections SET deleted_at = ?, updated_at = ? WHERE id = ?")
        .bind(&ts)
        .bind(&ts)
        .bind(id)
        .execute(&mut *tx)
        .await?;
    append_changelog(&mut tx, "section", id, ChangeOp::Delete, &serde_json::json!({})).await?;
    tx.commit().await?;
    bus.emit(DomainEvent::SectionChanged { project_id });
    Ok(())
}

/// Move a task into a section (or to `None` for the "No Section" column).
/// Validates the section belongs to the task's project.
pub async fn move_task_to_section(
    pool: &SqlitePool,
    bus: &EventBus,
    task_id: &str,
    section_id: Option<&str>,
) -> Result<()> {
    let ts = now();
    let project_id: String =
        sqlx::query_scalar("SELECT project_id FROM tasks WHERE id = ? AND deleted_at IS NULL")
            .bind(task_id)
            .fetch_optional(pool)
            .await?
            .ok_or_else(|| RepoError::NotFound(format!("task {task_id}")))?;

    if let Some(sid) = section_id {
        let owner = project_of(pool, sid).await?;
        if owner != project_id {
            return Err(RepoError::Invalid("section belongs to a different project".into()));
        }
    }

    let mut tx = pool.begin().await?;
    sqlx::query("UPDATE tasks SET section_id = ?, updated_at = ? WHERE id = ?")
        .bind(section_id)
        .bind(&ts)
        .bind(task_id)
        .execute(&mut *tx)
        .await?;
    append_changelog(
        &mut tx,
        "task",
        task_id,
        ChangeOp::Update,
        &serde_json::json!({ "sectionId": section_id }),
    )
    .await?;
    tx.commit().await?;
    bus.emit(DomainEvent::SectionChanged { project_id });
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::repo::db::connect_in_memory;
    use crate::repo::tasks::tests::quick;
    use crate::repo::tasks::{create_task, get_task};

    async fn setup() -> (SqlitePool, EventBus) {
        (connect_in_memory().await.unwrap(), EventBus::new())
    }

    #[tokio::test]
    async fn create_reorder_and_list() {
        let (pool, bus) = setup().await;
        let todo = create_section(&pool, &bus, "inbox", "To Do").await.unwrap();
        let doing = create_section(&pool, &bus, "inbox", "Doing").await.unwrap();
        let done = create_section(&pool, &bus, "inbox", "Done").await.unwrap();
        let names = |v: Vec<Section>| v.into_iter().map(|s| s.name).collect::<Vec<_>>();
        assert_eq!(names(list_sections(&pool, "inbox").await.unwrap()), ["To Do", "Doing", "Done"]);

        // Move Done to the front.
        reorder_section(&pool, &bus, &done.id, None).await.unwrap();
        assert_eq!(names(list_sections(&pool, "inbox").await.unwrap()), ["Done", "To Do", "Doing"]);
        let _ = (todo, doing);
    }

    #[tokio::test]
    async fn move_task_into_section_and_delete_detaches() {
        let (pool, bus) = setup().await;
        let col = create_section(&pool, &bus, "inbox", "Doing").await.unwrap();
        let task = create_task(&pool, &bus, quick("inbox", "ship it")).await.unwrap();

        move_task_to_section(&pool, &bus, &task.id, Some(&col.id)).await.unwrap();
        assert_eq!(get_task(&pool, &task.id).await.unwrap().section_id.as_deref(), Some(col.id.as_str()));

        delete_section(&pool, &bus, &col.id).await.unwrap();
        assert!(list_sections(&pool, "inbox").await.unwrap().is_empty());
        // Task survives, back in the No-Section column.
        assert_eq!(get_task(&pool, &task.id).await.unwrap().section_id, None);
    }

    #[tokio::test]
    async fn cannot_move_task_into_foreign_project_section() {
        let (pool, bus) = setup().await;
        let other = crate::repo::projects::create_project(
            &pool,
            &bus,
            crate::repo::projects::NewProject {
                name: "Work".into(),
                color: None,
                icon: None,
                kind: None,
            },
        )
        .await
        .unwrap();
        let col = create_section(&pool, &bus, &other.id, "Doing").await.unwrap();
        let task = create_task(&pool, &bus, quick("inbox", "x")).await.unwrap();
        assert!(matches!(
            move_task_to_section(&pool, &bus, &task.id, Some(&col.id)).await,
            Err(RepoError::Invalid(_))
        ));
    }
}
