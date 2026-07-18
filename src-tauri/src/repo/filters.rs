//! Saved Custom Filters: a named `filter_rule::Rule` (stored as `rule_json`)
//! that materializes a smart list. Evaluation reuses `filter_rule::evaluate`
//! over candidate tasks; the advanced text syntax comes via `query`.

use serde::Serialize;
use sqlx::SqlitePool;

use crate::error::{RepoError, Result};
use crate::events::{DomainEvent, EventBus};

use super::filter_rule::{evaluate, Condition, Rule};
use super::tasks::{list_for_filter, Task};
use super::{append_changelog, new_id, now, query, ChangeOp};

#[derive(Debug, Clone, Serialize, sqlx::FromRow)]
#[serde(rename_all = "camelCase")]
pub struct Filter {
    pub id: String,
    pub name: String,
    pub rule_json: String,
    pub color: Option<String>,
    pub sort_order: i64,
}

fn parse_rule(rule_json: &str) -> Result<Rule> {
    serde_json::from_str(rule_json)
        .map_err(|e| RepoError::Invalid(format!("bad filter rule: {e}")))
}

pub async fn list_filters(pool: &SqlitePool) -> Result<Vec<Filter>> {
    Ok(sqlx::query_as(
        "SELECT id, name, rule_json, color, sort_order FROM filters
         WHERE deleted_at IS NULL ORDER BY sort_order, created_at",
    )
    .fetch_all(pool)
    .await?)
}

pub async fn create_filter(
    pool: &SqlitePool,
    bus: &EventBus,
    name: &str,
    rule: &Rule,
    color: Option<&str>,
) -> Result<Filter> {
    let id = new_id();
    let ts = now();
    let rule_json = serde_json::to_string(rule)
        .map_err(|e| RepoError::Invalid(format!("cannot serialize rule: {e}")))?;
    let next_order: i64 =
        sqlx::query_scalar("SELECT COALESCE(MAX(sort_order), 0) + 1 FROM filters WHERE deleted_at IS NULL")
            .fetch_one(pool)
            .await?;

    let mut tx = pool.begin().await?;
    sqlx::query(
        "INSERT INTO filters (id, name, rule_json, color, sort_order, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)",
    )
    .bind(&id)
    .bind(name)
    .bind(&rule_json)
    .bind(color)
    .bind(next_order)
    .bind(&ts)
    .bind(&ts)
    .execute(&mut *tx)
    .await?;
    append_changelog(&mut tx, "filter", &id, ChangeOp::Insert, &serde_json::json!({ "name": name }))
        .await?;
    tx.commit().await?;
    bus.emit(DomainEvent::FilterChanged);
    Ok(Filter { id, name: name.to_string(), rule_json, color: color.map(String::from), sort_order: next_order })
}

pub async fn update_filter(
    pool: &SqlitePool,
    bus: &EventBus,
    id: &str,
    name: Option<&str>,
    rule: Option<&Rule>,
    color: Option<&str>,
) -> Result<()> {
    let ts = now();
    let rule_json = match rule {
        Some(r) => Some(
            serde_json::to_string(r)
                .map_err(|e| RepoError::Invalid(format!("cannot serialize rule: {e}")))?,
        ),
        None => None,
    };
    let mut tx = pool.begin().await?;
    // COALESCE keeps existing values for any field left unspecified (None).
    let res = sqlx::query(
        "UPDATE filters SET name = COALESCE(?, name), rule_json = COALESCE(?, rule_json),
                            color = COALESCE(?, color), updated_at = ?
         WHERE id = ? AND deleted_at IS NULL",
    )
    .bind(name)
    .bind(&rule_json)
    .bind(color)
    .bind(&ts)
    .bind(id)
    .execute(&mut *tx)
    .await?;
    if res.rows_affected() == 0 {
        return Err(RepoError::NotFound(format!("filter {id}")));
    }
    append_changelog(&mut tx, "filter", id, ChangeOp::Update, &serde_json::json!({})).await?;
    tx.commit().await?;
    bus.emit(DomainEvent::FilterChanged);
    Ok(())
}

pub async fn delete_filter(pool: &SqlitePool, bus: &EventBus, id: &str) -> Result<()> {
    let ts = now();
    let mut tx = pool.begin().await?;
    let res = sqlx::query("UPDATE filters SET deleted_at = ?, updated_at = ? WHERE id = ? AND deleted_at IS NULL")
        .bind(&ts)
        .bind(&ts)
        .bind(id)
        .execute(&mut *tx)
        .await?;
    if res.rows_affected() == 0 {
        return Err(RepoError::NotFound(format!("filter {id}")));
    }
    append_changelog(&mut tx, "filter", id, ChangeOp::Delete, &serde_json::json!({})).await?;
    tx.commit().await?;
    bus.emit(DomainEvent::FilterChanged);
    Ok(())
}

/// Parse advanced text syntax into a stored `Rule` (names resolved to ids).
/// Used both to preview a query and to save it as a filter.
pub async fn parse_query(pool: &SqlitePool, text: &str) -> Result<Rule> {
    query::resolve(query::parse(text), pool).await
}

/// Evaluate a saved filter. Results are ACTIVE tasks unless the rule carries a
/// `Status` condition, in which case completed/won't-do are candidates too.
pub async fn list_filter_tasks(
    pool: &SqlitePool,
    id: &str,
    today: &str,
    tz_off_min: i32,
) -> Result<Vec<Task>> {
    let rule_json: String =
        sqlx::query_scalar("SELECT rule_json FROM filters WHERE id = ? AND deleted_at IS NULL")
            .bind(id)
            .fetch_optional(pool)
            .await?
            .ok_or_else(|| RepoError::NotFound(format!("filter {id}")))?;
    let rule = parse_rule(&rule_json)?;
    eval_rule_tasks(pool, &rule, today, tz_off_min).await
}

/// Shared evaluation path (also used by matrix quadrant listing).
pub async fn eval_rule_tasks(
    pool: &SqlitePool,
    rule: &Rule,
    today: &str,
    tz_off_min: i32,
) -> Result<Vec<Task>> {
    let has_status = rule.conditions.iter().any(|c| matches!(c, Condition::Status { .. }));
    let statuses: &[&str] =
        if has_status { &["ACTIVE", "COMPLETED", "WONT_DO"] } else { &["ACTIVE"] };
    let candidates = list_for_filter(pool, statuses).await?;
    Ok(candidates
        .into_iter()
        .filter(|task| evaluate(rule, task, today, tz_off_min))
        .collect())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::repo::db::connect_in_memory;
    use crate::repo::filter_rule::{Condition, Match};
    use crate::repo::tasks::tests::quick;
    use crate::repo::tasks::{create_task, update_task, NewTask, TaskPatch};

    const TODAY: &str = "2026-07-15";

    async fn high(pool: &SqlitePool, bus: &EventBus, title: &str) -> Task {
        let t = create_task(pool, bus, quick("inbox", title)).await.unwrap();
        update_task(pool, bus, &t.id, TaskPatch { priority: Some(5), ..Default::default() })
            .await
            .unwrap()
    }

    #[tokio::test]
    async fn list_filter_tasks_returns_matches_only() {
        let pool = connect_in_memory().await.unwrap();
        let bus = EventBus::new();
        high(&pool, &bus, "urgent thing").await;
        create_task(&pool, &bus, quick("inbox", "whatever")).await.unwrap();

        let rule = Rule {
            match_: Match::All,
            conditions: vec![Condition::Priority { values: vec![5] }],
        };
        let filter = create_filter(&pool, &bus, "High priority", &rule, Some("#e0362a")).await.unwrap();

        let tasks = list_filter_tasks(&pool, &filter.id, TODAY, 0).await.unwrap();
        assert_eq!(tasks.len(), 1);
        assert_eq!(tasks[0].title, "urgent thing");
    }

    #[tokio::test]
    async fn parse_query_resolves_list_names() {
        let pool = connect_in_memory().await.unwrap();
        let bus = EventBus::new();
        create_task(
            &pool,
            &bus,
            NewTask { due_at: Some("2026-07-15T00:00:00.000Z".into()), ..quick("inbox", "due today in inbox") },
        )
        .await
        .unwrap();

        // "inbox" is the seeded project's name? It's id "inbox", name "Inbox".
        let rule = parse_query(&pool, "list:Inbox due:today").await.unwrap();
        let saved = create_filter(&pool, &bus, "Inbox today", &rule, None).await.unwrap();
        let tasks = list_filter_tasks(&pool, &saved.id, TODAY, 0).await.unwrap();
        assert_eq!(tasks.len(), 1);
    }

    #[tokio::test]
    async fn update_and_delete_filter() {
        let pool = connect_in_memory().await.unwrap();
        let bus = EventBus::new();
        let rule = Rule::all(vec![]);
        let f = create_filter(&pool, &bus, "All", &rule, None).await.unwrap();

        update_filter(&pool, &bus, &f.id, Some("Everything"), None, Some("#4772fa")).await.unwrap();
        let listed = list_filters(&pool).await.unwrap();
        assert_eq!(listed[0].name, "Everything");
        assert_eq!(listed[0].color.as_deref(), Some("#4772fa"));

        delete_filter(&pool, &bus, &f.id).await.unwrap();
        assert!(list_filters(&pool).await.unwrap().is_empty());
    }
}
