use serde::{Deserialize, Serialize};
use sqlx::{QueryBuilder, Sqlite, SqlitePool};

use crate::error::Result;
use crate::events::EventBus;

use super::settings::{get_setting, set_setting};
use super::tasks::Task;

const RECENT_KEY: &str = "search.recent";
const RECENT_CAP: usize = 12;

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

/// Optional facets that narrow task search results.
#[derive(Debug, Clone, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchFilters {
    #[serde(default)]
    pub project_id: Option<String>,
    #[serde(default)]
    pub tag_id: Option<String>,
    /// ACTIVE or COMPLETED.
    #[serde(default)]
    pub status: Option<String>,
    /// Local calendar-day bounds (YYYY-MM-DD) on `due_at`.
    #[serde(default)]
    pub due_from: Option<String>,
    #[serde(default)]
    pub due_to: Option<String>,
}

/// A lightweight, non-task search hit (habit or tag).
#[derive(Debug, Clone, Serialize, sqlx::FromRow)]
#[serde(rename_all = "camelCase")]
pub struct SearchHit {
    pub id: String,
    pub name: String,
}

/// Cross-entity search results.
#[derive(Debug, Clone, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchResults {
    pub tasks: Vec<Task>,
    pub habits: Vec<SearchHit>,
    pub tags: Vec<SearchHit>,
}

/// Global search across tasks (+ their check items, with `filters` applied),
/// habits, and tags. An empty/whitespace query returns empty results.
pub async fn search_all(
    pool: &SqlitePool,
    query: &str,
    filters: &SearchFilters,
    limit: i64,
) -> Result<SearchResults> {
    let Some(fts) = to_fts_query(query) else {
        return Ok(SearchResults::default());
    };

    // Task ids matched by title/content OR by a check item, then filtered.
    let mut qb: QueryBuilder<Sqlite> = QueryBuilder::new(
        "WITH matched(id) AS (
             SELECT t.id FROM tasks_fts f JOIN tasks t ON t.rowid = f.rowid
             WHERE tasks_fts MATCH ",
    );
    qb.push_bind(&fts);
    qb.push(
        " UNION
             SELECT ci.task_id FROM check_items_fts cf JOIN check_items ci ON ci.rowid = cf.rowid
             WHERE check_items_fts MATCH ",
    );
    qb.push_bind(&fts);
    qb.push(" AND ci.deleted_at IS NULL ) ");
    qb.push(format!(
        "SELECT {TASK_COLUMNS} FROM tasks t JOIN matched m ON m.id = t.id
         WHERE t.deleted_at IS NULL AND t.status <> 'TRASHED'"
    ));
    if let Some(pid) = &filters.project_id {
        qb.push(" AND t.project_id = ").push_bind(pid);
    }
    if let Some(status) = &filters.status {
        qb.push(" AND t.status = ").push_bind(status);
    }
    if let Some(tag) = &filters.tag_id {
        qb.push(" AND t.id IN (SELECT task_id FROM task_tags WHERE tag_id = ")
            .push_bind(tag)
            .push(" AND deleted_at IS NULL) ");
    }
    if let Some(from) = &filters.due_from {
        qb.push(" AND t.due_at IS NOT NULL AND substr(t.due_at, 1, 10) >= ").push_bind(from);
    }
    if let Some(to) = &filters.due_to {
        qb.push(" AND t.due_at IS NOT NULL AND substr(t.due_at, 1, 10) <= ").push_bind(to);
    }
    qb.push(" ORDER BY t.updated_at DESC LIMIT ").push_bind(limit);
    let tasks: Vec<Task> = qb.build_query_as().fetch_all(pool).await?;

    let habits: Vec<SearchHit> = sqlx::query_as(
        "SELECT h.id, h.name FROM habits_fts f JOIN habits h ON h.rowid = f.rowid
         WHERE habits_fts MATCH ?1 AND h.deleted_at IS NULL LIMIT ?2",
    )
    .bind(&fts)
    .bind(limit)
    .fetch_all(pool)
    .await?;

    let tags: Vec<SearchHit> = sqlx::query_as(
        "SELECT tg.id, tg.name FROM tags_fts f JOIN tags tg ON tg.rowid = f.rowid
         WHERE tags_fts MATCH ?1 AND tg.deleted_at IS NULL LIMIT ?2",
    )
    .bind(&fts)
    .bind(limit)
    .fetch_all(pool)
    .await?;

    Ok(SearchResults { tasks, habits, tags })
}

// ---- recent searches (settings-backed ring buffer) --------------------------

/// Prepend `query` to the recents: trimmed, blank ignored, case-insensitive
/// dedupe, newest first, capped at `cap`. Pure so it's unit-tested and mirrored
/// in the browser stub.
pub fn push_recent(existing: &[String], query: &str, cap: usize) -> Vec<String> {
    let q = query.trim();
    if q.is_empty() {
        return existing.to_vec();
    }
    let mut out = Vec::with_capacity(existing.len() + 1);
    out.push(q.to_string());
    for e in existing {
        if !e.trim().eq_ignore_ascii_case(q) {
            out.push(e.clone());
        }
    }
    out.truncate(cap);
    out
}

pub async fn recent_searches(pool: &SqlitePool) -> Result<Vec<String>> {
    Ok(get_setting(pool, RECENT_KEY)
        .await?
        .and_then(|v| serde_json::from_value(v).ok())
        .unwrap_or_default())
}

pub async fn add_recent_search(pool: &SqlitePool, bus: &EventBus, query: &str) -> Result<Vec<String>> {
    let updated = push_recent(&recent_searches(pool).await?, query, RECENT_CAP);
    set_setting(pool, bus, RECENT_KEY, serde_json::json!(updated)).await?;
    Ok(updated)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::events::EventBus;
    use crate::repo::check_items::add_check_item;
    use crate::repo::db::connect_in_memory;
    use crate::repo::tasks::tests::quick;
    use crate::repo::tasks::{create_task, restore_task, trash_task, update_task, TaskPatch};

    use crate::repo::habits::{create_habit, Freq, HabitInput};
    use crate::repo::tags::{assign_tag, create_tag};

    async fn titles(pool: &SqlitePool, q: &str) -> Vec<String> {
        let mut v: Vec<String> = search_tasks(pool, q, 50).await.unwrap().into_iter().map(|t| t.title).collect();
        v.sort();
        v
    }

    fn habit(name: &str) -> HabitInput {
        HabitInput {
            name: name.into(),
            icon: None,
            color: None,
            quote: None,
            goal_kind: "CHECK".into(),
            goal_amount: None,
            unit: None,
            freq: Freq::Daily,
            section: None,
            reminders: vec![],
            start_date: None,
        }
    }

    async fn all_titles(pool: &SqlitePool, q: &str, f: SearchFilters) -> Vec<String> {
        let mut v: Vec<String> =
            search_all(pool, q, &f, 50).await.unwrap().tasks.into_iter().map(|t| t.title).collect();
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

    #[tokio::test]
    async fn list_and_status_filters_narrow_tasks() {
        let pool = connect_in_memory().await.unwrap();
        let bus = EventBus::new();
        let work = crate::repo::projects::create_project(
            &pool,
            &bus,
            crate::repo::projects::NewProject { name: "Work".into(), color: None, icon: None, kind: None },
        )
        .await
        .unwrap();
        create_task(&pool, &bus, quick("inbox", "report draft")).await.unwrap();
        create_task(&pool, &bus, quick(&work.id, "report review")).await.unwrap();
        let done = create_task(&pool, &bus, quick("inbox", "report archived")).await.unwrap();
        crate::repo::tasks::complete_task(&pool, &bus, &done.id, 0).await.unwrap();

        // No filter: all three "report" tasks.
        assert_eq!(all_titles(&pool, "report", SearchFilters::default()).await.len(), 3);
        // List filter: only the Work one.
        assert_eq!(
            all_titles(&pool, "report", SearchFilters { project_id: Some(work.id), ..Default::default() }).await,
            ["report review"]
        );
        // Status filter: exclude the completed one.
        assert_eq!(
            all_titles(&pool, "report", SearchFilters { status: Some("ACTIVE".into()), ..Default::default() }).await,
            ["report draft", "report review"]
        );
        assert_eq!(
            all_titles(&pool, "report", SearchFilters { status: Some("COMPLETED".into()), ..Default::default() }).await,
            ["report archived"]
        );
    }

    #[tokio::test]
    async fn due_range_and_tag_filters() {
        let pool = connect_in_memory().await.unwrap();
        let bus = EventBus::new();
        let mut early = quick("inbox", "meeting early");
        early.due_at = Some("2026-03-01T09:00:00.000Z".into());
        let early = create_task(&pool, &bus, early).await.unwrap();
        let mut late = quick("inbox", "meeting late");
        late.due_at = Some("2026-03-20T09:00:00.000Z".into());
        create_task(&pool, &bus, late).await.unwrap();

        // Due window Mar 1–10 keeps only the early one.
        assert_eq!(
            all_titles(
                &pool,
                "meeting",
                SearchFilters { due_from: Some("2026-03-01".into()), due_to: Some("2026-03-10".into()), ..Default::default() },
            )
            .await,
            ["meeting early"]
        );

        // Tag filter: tag the early one, then require that tag.
        let tag = create_tag(&pool, &bus, "urgent", None).await.unwrap();
        assign_tag(&pool, &bus, &early.id, &tag.id).await.unwrap();
        assert_eq!(
            all_titles(&pool, "meeting", SearchFilters { tag_id: Some(tag.id), ..Default::default() }).await,
            ["meeting early"]
        );
    }

    #[test]
    fn push_recent_dedupes_caps_and_orders() {
        // Newest first.
        let r = push_recent(&["a".into()], "b", 5);
        assert_eq!(r, ["b", "a"]);
        // Case-insensitive dedupe, moved to front.
        let r = push_recent(&["Alpha".into(), "beta".into()], "alpha", 5);
        assert_eq!(r, ["alpha", "beta"]);
        // Blank/whitespace ignored (unchanged).
        assert_eq!(push_recent(&["x".into()], "   ", 5), ["x"]);
        // Trimmed, and capped.
        let r = push_recent(&["1".into(), "2".into(), "3".into()], "  0  ", 3);
        assert_eq!(r, ["0", "1", "2"]);
    }

    #[tokio::test]
    async fn recent_searches_persist_and_dedupe() {
        let pool = connect_in_memory().await.unwrap();
        let bus = EventBus::new();
        add_recent_search(&pool, &bus, "groceries").await.unwrap();
        add_recent_search(&pool, &bus, "review").await.unwrap();
        let recents = add_recent_search(&pool, &bus, "groceries").await.unwrap();
        assert_eq!(recents, ["groceries", "review"]);
        assert_eq!(recent_searches(&pool).await.unwrap(), ["groceries", "review"]);
    }

    #[tokio::test]
    async fn finds_habits_and_tags_by_name() {
        let pool = connect_in_memory().await.unwrap();
        let bus = EventBus::new();
        create_habit(&pool, &bus, habit("Drink water")).await.unwrap();
        create_tag(&pool, &bus, "waterfall", None).await.unwrap();

        let res = search_all(&pool, "water", &SearchFilters::default(), 50).await.unwrap();
        assert_eq!(res.habits.iter().map(|h| h.name.as_str()).collect::<Vec<_>>(), ["Drink water"]);
        assert_eq!(res.tags.iter().map(|t| t.name.as_str()).collect::<Vec<_>>(), ["waterfall"]);
    }
}
