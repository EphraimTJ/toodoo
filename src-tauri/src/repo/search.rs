use sqlx::SqlitePool;

use crate::error::Result;

use super::tasks::Task;

/// Turn free text into an FTS5 prefix query: each whitespace token becomes a
/// quoted prefix term (`"tok"*`), so user input can never inject FTS syntax.
fn to_fts_query(input: &str) -> Option<String> {
    let terms: Vec<String> = input
        .split_whitespace()
        .map(|token| format!("\"{}\"*", token.replace('"', "\"\"")))
        .collect();
    if terms.is_empty() {
        None
    } else {
        Some(terms.join(" "))
    }
}

const TASK_COLUMNS: &str =
    "t.id, t.project_id, t.section_id, t.parent_id, t.title, t.content_rich, t.content_plain, \
     t.kind, t.status, t.priority, t.start_at, t.due_at, t.is_all_day, t.duration_min, \
     t.time_zone, t.rrule, t.repeat_from, t.pinned, t.est_pomos, t.est_duration_min, \
     CAST(json_extract(t.sort_orders_json, '$.project') AS INTEGER) AS sort_order, \
     t.completed_at, t.created_at, t.updated_at";

/// Full-text search over task titles, descriptions, and check-item text.
/// Check-item hits map to their parent task. Trashed/deleted tasks are never
/// returned (the FTS index already excludes them; the WHERE is belt and
/// braces).
pub async fn search_tasks(pool: &SqlitePool, query: &str, limit: i64) -> Result<Vec<Task>> {
    let Some(fts) = to_fts_query(query) else {
        return Ok(Vec::new());
    };
    let tasks: Vec<Task> = sqlx::query_as(&format!(
        "SELECT {TASK_COLUMNS} FROM tasks_fts f
             JOIN tasks t ON t.rowid = f.rowid
         WHERE tasks_fts MATCH ?1 AND t.deleted_at IS NULL AND t.status <> 'TRASHED'
         UNION
         SELECT {TASK_COLUMNS} FROM check_items_fts cf
             JOIN check_items ci ON ci.rowid = cf.rowid
             JOIN tasks t ON t.id = ci.task_id
         WHERE check_items_fts MATCH ?1 AND ci.deleted_at IS NULL
               AND t.deleted_at IS NULL AND t.status <> 'TRASHED'
         LIMIT ?2"
    ))
    .bind(&fts)
    .bind(limit)
    .fetch_all(pool)
    .await?;
    Ok(tasks)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::events::EventBus;
    use crate::repo::check_items::add_check_item;
    use crate::repo::db::connect_in_memory;
    use crate::repo::tasks::tests::quick;
    use crate::repo::tasks::{create_task, restore_task, trash_task, update_task, TaskPatch};

    async fn titles(pool: &SqlitePool, q: &str) -> Vec<String> {
        let mut v: Vec<String> = search_tasks(pool, q, 50).await.unwrap().into_iter().map(|t| t.title).collect();
        v.sort();
        v
    }

    #[tokio::test]
    async fn finds_by_title_prefix_and_description() {
        let pool = connect_in_memory().await.unwrap();
        let bus = EventBus::new();
        create_task(&pool, &bus, quick("inbox", "Groceries run")).await.unwrap();
        let t = create_task(&pool, &bus, quick("inbox", "Weekly review")).await.unwrap();
        update_task(
            &pool,
            &bus,
            &t.id,
            TaskPatch {
                content_rich: Some(Some("{}".into())),
                content_plain: Some(Some("remember the groceries budget".into())),
                ..Default::default()
            },
        )
        .await
        .unwrap();

        assert_eq!(titles(&pool, "grocer").await, ["Groceries run", "Weekly review"]);
        assert_eq!(titles(&pool, "review").await, ["Weekly review"]);
    }

    #[tokio::test]
    async fn finds_task_via_check_item_text() {
        let pool = connect_in_memory().await.unwrap();
        let bus = EventBus::new();
        let t = create_task(&pool, &bus, quick("inbox", "Trip prep")).await.unwrap();
        add_check_item(&pool, &bus, &t.id, "passport photocopy").await.unwrap();

        assert_eq!(titles(&pool, "passport").await, ["Trip prep"]);
    }

    #[tokio::test]
    async fn trash_removes_from_index_and_restore_returns() {
        let pool = connect_in_memory().await.unwrap();
        let bus = EventBus::new();
        let t = create_task(&pool, &bus, quick("inbox", "Vanishing act")).await.unwrap();
        assert_eq!(titles(&pool, "vanish").await.len(), 1);

        trash_task(&pool, &bus, &t.id).await.unwrap();
        assert!(titles(&pool, "vanish").await.is_empty());

        restore_task(&pool, &bus, &t.id).await.unwrap();
        assert_eq!(titles(&pool, "vanish").await.len(), 1);
    }

    #[tokio::test]
    async fn title_edits_reindex() {
        let pool = connect_in_memory().await.unwrap();
        let bus = EventBus::new();
        let t = create_task(&pool, &bus, quick("inbox", "Old name")).await.unwrap();
        update_task(
            &pool,
            &bus,
            &t.id,
            TaskPatch { title: Some("New shiny name".into()), ..Default::default() },
        )
        .await
        .unwrap();

        assert!(titles(&pool, "old").await.is_empty());
        assert_eq!(titles(&pool, "shiny").await, ["New shiny name"]);
    }

    #[tokio::test]
    async fn operators_and_quotes_do_not_error() {
        let pool = connect_in_memory().await.unwrap();
        let bus = EventBus::new();
        create_task(&pool, &bus, quick("inbox", "AND OR NOT \"quoted\"")).await.unwrap();

        for q in ["AND", "OR NOT", "\"", "task\" OR \"", "(", "*", ""] {
            // Must not error, whatever it matches.
            search_tasks(&pool, q, 50).await.unwrap();
        }
        assert_eq!(titles(&pool, "quoted").await.len(), 1);
    }
}
