//! Exporters: full JSON, TickTick-ish CSV, and a Markdown checklist. Each reads
//! through the repo layer (projects + their tasks, tags attached) and returns a
//! string the UI downloads. ICS export is handled by `cal_subscriptions`.

use sqlx::SqlitePool;

use crate::error::Result;

use super::projects::list_projects;
use super::tags::list_tags;
use super::tasks::{list_project_tasks, Task};

/// Tasks grouped by their (non-trashed) project, in list then task order.
async fn tasks_by_project(pool: &SqlitePool) -> Result<Vec<(String, Vec<Task>)>> {
    let projects = list_projects(pool).await?;
    let mut out = Vec::with_capacity(projects.len());
    for p in projects {
        let tasks = list_project_tasks(pool, &p.id).await?;
        out.push((p.name, tasks));
    }
    Ok(out)
}

fn status_word(status: &str) -> &str {
    if status == "COMPLETED" {
        "Completed"
    } else {
        "Normal"
    }
}

/// Full backup as JSON: projects, tasks, and tags (camelCase, as stored).
pub async fn export_json(pool: &SqlitePool) -> Result<String> {
    let projects = list_projects(pool).await?;
    let tags = list_tags(pool).await?;
    let mut tasks = Vec::new();
    for p in &projects {
        tasks.extend(list_project_tasks(pool, &p.id).await?);
    }
    let doc = serde_json::json!({
        "app": "toodoo",
        "version": 1,
        "projects": projects,
        "tasks": tasks,
        "tags": tags,
    });
    Ok(serde_json::to_string_pretty(&doc)?)
}

/// TickTick-style CSV: a header plus one row per task, list-grouped.
pub async fn export_csv(pool: &SqlitePool) -> Result<String> {
    let mut wtr = csv::Writer::from_writer(Vec::new());
    wtr.write_record([
        "List Name", "Title", "Content", "Priority", "Status", "Due Date", "Start Date", "Tags",
    ])
    .map_err(csv_err)?;
    for (list, tasks) in tasks_by_project(pool).await? {
        for t in tasks {
            wtr.write_record([
                list.as_str(),
                &t.title,
                t.content_plain.as_deref().unwrap_or(""),
                &t.priority.to_string(),
                status_word(&t.status),
                t.due_at.as_deref().unwrap_or(""),
                t.start_at.as_deref().unwrap_or(""),
                &t.tag_ids.join(","),
            ])
            .map_err(csv_err)?;
        }
    }
    let bytes = wtr
        .into_inner()
        .map_err(|e| crate::error::RepoError::Invalid(format!("csv export failed: {e}")))?;
    Ok(String::from_utf8_lossy(&bytes).into_owned())
}

fn csv_err(e: csv::Error) -> crate::error::RepoError {
    crate::error::RepoError::Invalid(format!("csv export failed: {e}"))
}

/// A Markdown checklist grouped by list, with completion state as `- [x]`/`- [ ]`.
pub async fn export_markdown(pool: &SqlitePool) -> Result<String> {
    let mut out = String::from("# Toodoo export\n");
    for (list, tasks) in tasks_by_project(pool).await? {
        out.push_str(&format!("\n## {list}\n\n"));
        if tasks.is_empty() {
            out.push_str("_(empty)_\n");
            continue;
        }
        for t in tasks {
            let box_ = if t.status == "COMPLETED" { "x" } else { " " };
            out.push_str(&format!("- [{box_}] {}\n", t.title));
        }
    }
    Ok(out)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::events::EventBus;
    use crate::repo::db::connect_in_memory;
    use crate::repo::tasks::{complete_task, create_task, NewTask};

    async fn task(pool: &SqlitePool, bus: &EventBus, project: &str, title: &str) -> String {
        create_task(
            pool,
            bus,
            NewTask {
                project_id: project.into(),
                parent_id: None,
                title: title.into(),
                priority: None,
                start_at: None,
                due_at: None,
                is_all_day: None,
                duration_min: None,
                time_zone: None,
                rrule: None,
                repeat_from: None,
                kind: None,
            },
        )
        .await
        .unwrap()
        .id
    }

    #[tokio::test]
    async fn csv_has_header_and_quotes_commas() {
        let pool = connect_in_memory().await.unwrap();
        let bus = EventBus::new();
        task(&pool, &bus, "inbox", "Ship v1, then party").await;

        let csv = export_csv(&pool).await.unwrap();
        let mut lines = csv.lines();
        assert!(lines.next().unwrap().starts_with("List Name,Title,Content,Priority"));
        // The comma-bearing title is quoted.
        assert!(csv.contains("\"Ship v1, then party\""));
        assert!(csv.contains("Inbox"));
    }

    #[tokio::test]
    async fn markdown_groups_by_list_with_checkboxes() {
        let pool = connect_in_memory().await.unwrap();
        let bus = EventBus::new();
        let done = task(&pool, &bus, "inbox", "Done thing").await;
        task(&pool, &bus, "inbox", "Open thing").await;
        complete_task(&pool, &bus, &done, 0).await.unwrap();

        let md = export_markdown(&pool).await.unwrap();
        assert!(md.contains("## Inbox"));
        assert!(md.contains("- [x] Done thing"));
        assert!(md.contains("- [ ] Open thing"));
    }

    #[tokio::test]
    async fn json_round_trips_task_count() {
        let pool = connect_in_memory().await.unwrap();
        let bus = EventBus::new();
        task(&pool, &bus, "inbox", "One").await;
        task(&pool, &bus, "inbox", "Two").await;

        let json = export_json(&pool).await.unwrap();
        let parsed: serde_json::Value = serde_json::from_str(&json).unwrap();
        assert_eq!(parsed["tasks"].as_array().unwrap().len(), 2);
        assert_eq!(parsed["app"], "toodoo");
        assert!(parsed["projects"].as_array().unwrap().iter().any(|p| p["name"] == "Inbox"));
    }
}
