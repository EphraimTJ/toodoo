//! Reusable task templates. A template stores a `NewTask`-shaped JSON body
//! (title, content, priority, recurrence, check items, reminders); instantiating
//! one materializes a fresh task in a target project and attaches its children.

use serde::{Deserialize, Serialize};
use sqlx::SqlitePool;

use crate::error::{RepoError, Result};
use crate::events::{DomainEvent, EventBus};

use super::tasks::{create_task, update_task, NewTask, Task, TaskPatch};
use super::{append_changelog, check_items, new_id, now, reminders, ChangeOp};

#[derive(Debug, Clone, Serialize, sqlx::FromRow)]
#[serde(rename_all = "camelCase")]
pub struct TaskTemplate {
    pub id: String,
    pub name: String,
    pub payload_json: String,
    pub sort_order: i64,
    pub created_at: String,
    pub updated_at: String,
}

/// One reminder to attach when a template is instantiated. `at` is only
/// meaningful for absolute reminders (rare in a reusable template); relative
/// reminders carry `offset_min`.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReminderSpec {
    pub trigger_kind: String,
    #[serde(default)]
    pub at: Option<String>,
    #[serde(default)]
    pub offset_min: Option<i64>,
}

/// The body stored in `task_templates.payload_json`. A superset of `NewTask`
/// that also carries content, check items, and reminders; `project_id` is
/// supplied at instantiation time, not stored on the template.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TemplatePayload {
    pub title: String,
    #[serde(default)]
    pub content_rich: Option<String>,
    #[serde(default)]
    pub content_plain: Option<String>,
    #[serde(default)]
    pub priority: Option<i64>,
    #[serde(default)]
    pub is_all_day: Option<bool>,
    #[serde(default)]
    pub duration_min: Option<i64>,
    #[serde(default)]
    pub time_zone: Option<String>,
    #[serde(default)]
    pub rrule: Option<String>,
    #[serde(default)]
    pub repeat_from: Option<String>,
    #[serde(default)]
    pub check_items: Vec<String>,
    #[serde(default)]
    pub reminders: Vec<ReminderSpec>,
}

pub async fn list_templates(pool: &SqlitePool) -> Result<Vec<TaskTemplate>> {
    Ok(sqlx::query_as(
        "SELECT id, name, payload_json, sort_order, created_at, updated_at
         FROM task_templates WHERE deleted_at IS NULL
         ORDER BY sort_order, created_at",
    )
    .fetch_all(pool)
    .await?)
}

pub async fn create_template(
    pool: &SqlitePool,
    bus: &EventBus,
    name: &str,
    payload: &TemplatePayload,
) -> Result<TaskTemplate> {
    let id = new_id();
    let ts = now();
    let payload_json = serde_json::to_string(payload)
        .map_err(|e| RepoError::Invalid(format!("bad template payload: {e}")))?;
    let next_order: i64 = sqlx::query_scalar(
        "SELECT COALESCE(MAX(sort_order), 0) + 1 FROM task_templates WHERE deleted_at IS NULL",
    )
    .fetch_one(pool)
    .await?;

    let mut tx = pool.begin().await?;
    sqlx::query(
        "INSERT INTO task_templates (id, name, payload_json, sort_order, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)",
    )
    .bind(&id)
    .bind(name)
    .bind(&payload_json)
    .bind(next_order)
    .bind(&ts)
    .bind(&ts)
    .execute(&mut *tx)
    .await?;
    append_changelog(&mut tx, "template", &id, ChangeOp::Insert, &serde_json::json!({ "name": name }))
        .await?;
    tx.commit().await?;

    bus.emit(DomainEvent::TemplateChanged);
    Ok(TaskTemplate {
        id,
        name: name.to_string(),
        payload_json,
        sort_order: next_order,
        created_at: ts.clone(),
        updated_at: ts,
    })
}

pub async fn update_template(
    pool: &SqlitePool,
    bus: &EventBus,
    id: &str,
    name: Option<&str>,
    payload: Option<&TemplatePayload>,
) -> Result<()> {
    let ts = now();
    let mut tx = pool.begin().await?;
    let res = if let Some(payload) = payload {
        let payload_json = serde_json::to_string(payload)
            .map_err(|e| RepoError::Invalid(format!("bad template payload: {e}")))?;
        sqlx::query(
            "UPDATE task_templates SET name = COALESCE(?, name), payload_json = ?, updated_at = ?
             WHERE id = ? AND deleted_at IS NULL",
        )
        .bind(name)
        .bind(&payload_json)
        .bind(&ts)
        .bind(id)
        .execute(&mut *tx)
        .await?
    } else {
        sqlx::query(
            "UPDATE task_templates SET name = COALESCE(?, name), updated_at = ?
             WHERE id = ? AND deleted_at IS NULL",
        )
        .bind(name)
        .bind(&ts)
        .bind(id)
        .execute(&mut *tx)
        .await?
    };
    if res.rows_affected() == 0 {
        return Err(RepoError::NotFound(format!("template {id}")));
    }
    append_changelog(&mut tx, "template", id, ChangeOp::Update, &serde_json::json!({})).await?;
    tx.commit().await?;
    bus.emit(DomainEvent::TemplateChanged);
    Ok(())
}

pub async fn delete_template(pool: &SqlitePool, bus: &EventBus, id: &str) -> Result<()> {
    let ts = now();
    let mut tx = pool.begin().await?;
    let res = sqlx::query(
        "UPDATE task_templates SET deleted_at = ?, updated_at = ? WHERE id = ? AND deleted_at IS NULL",
    )
    .bind(&ts)
    .bind(&ts)
    .bind(id)
    .execute(&mut *tx)
    .await?;
    if res.rows_affected() == 0 {
        return Err(RepoError::NotFound(format!("template {id}")));
    }
    append_changelog(&mut tx, "template", id, ChangeOp::Delete, &serde_json::json!({})).await?;
    tx.commit().await?;
    bus.emit(DomainEvent::TemplateChanged);
    Ok(())
}

/// Materialize a template into `project_id`: create the task, then attach its
/// content, check items, and reminders. Returns the fully-hydrated task.
pub async fn instantiate_template(
    pool: &SqlitePool,
    bus: &EventBus,
    template_id: &str,
    project_id: &str,
) -> Result<Task> {
    let payload_json: String =
        sqlx::query_scalar("SELECT payload_json FROM task_templates WHERE id = ? AND deleted_at IS NULL")
            .bind(template_id)
            .fetch_optional(pool)
            .await?
            .ok_or_else(|| RepoError::NotFound(format!("template {template_id}")))?;
    let payload: TemplatePayload = serde_json::from_str(&payload_json)
        .map_err(|e| RepoError::Invalid(format!("corrupt template payload: {e}")))?;

    let task = create_task(
        pool,
        bus,
        NewTask {
            project_id: project_id.to_string(),
            parent_id: None,
            title: payload.title.clone(),
            priority: payload.priority,
            start_at: None,
            due_at: None,
            is_all_day: payload.is_all_day,
            duration_min: payload.duration_min,
            time_zone: payload.time_zone.clone(),
            rrule: payload.rrule.clone(),
            repeat_from: payload.repeat_from.clone(),
            kind: None,
        },
    )
    .await?;

    if payload.content_rich.is_some() || payload.content_plain.is_some() {
        update_task(
            pool,
            bus,
            &task.id,
            TaskPatch {
                content_rich: Some(payload.content_rich.clone()),
                content_plain: Some(payload.content_plain.clone()),
                ..Default::default()
            },
        )
        .await?;
    }

    for title in &payload.check_items {
        check_items::add_check_item(pool, bus, &task.id, title).await?;
    }
    for spec in &payload.reminders {
        reminders::add_reminder(
            pool,
            bus,
            &task.id,
            &spec.trigger_kind,
            spec.at.as_deref(),
            spec.offset_min,
        )
        .await?;
    }

    super::tasks::get_task(pool, &task.id).await
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::repo::tasks::tests::setup;

    fn sample() -> TemplatePayload {
        TemplatePayload {
            title: "Weekly review".into(),
            content_rich: None,
            content_plain: Some("Reflect on the week".into()),
            priority: Some(3),
            is_all_day: Some(true),
            duration_min: None,
            time_zone: None,
            rrule: Some("FREQ=WEEKLY;BYDAY=FR".into()),
            repeat_from: Some("DUE".into()),
            check_items: vec!["Clear inbox".into(), "Plan next week".into()],
            reminders: vec![ReminderSpec {
                trigger_kind: "REL".into(),
                at: None,
                offset_min: Some(0),
            }],
        }
    }

    #[tokio::test]
    async fn create_list_and_delete() {
        let (pool, bus) = setup().await;
        let tpl = create_template(&pool, &bus, "Weekly review", &sample()).await.unwrap();
        assert_eq!(list_templates(&pool).await.unwrap().len(), 1);

        delete_template(&pool, &bus, &tpl.id).await.unwrap();
        assert!(list_templates(&pool).await.unwrap().is_empty());
    }

    #[tokio::test]
    async fn instantiate_materializes_task_with_children() {
        let (pool, bus) = setup().await;
        let tpl = create_template(&pool, &bus, "Weekly review", &sample()).await.unwrap();

        let task = instantiate_template(&pool, &bus, &tpl.id, "inbox").await.unwrap();
        assert_eq!(task.title, "Weekly review");
        assert_eq!(task.priority, 3);
        assert_eq!(task.rrule.as_deref(), Some("FREQ=WEEKLY;BYDAY=FR"));
        assert_eq!(task.content_plain.as_deref(), Some("Reflect on the week"));

        let items = check_items::list_check_items(&pool, &task.id).await.unwrap();
        assert_eq!(items.len(), 2);
        let rems = reminders::list_reminders(&pool, &task.id).await.unwrap();
        assert_eq!(rems.len(), 1);
    }

    #[tokio::test]
    async fn instantiate_unknown_template_is_not_found() {
        let (pool, bus) = setup().await;
        assert!(matches!(
            instantiate_template(&pool, &bus, "nope", "inbox").await,
            Err(RepoError::NotFound(_))
        ));
    }
}
