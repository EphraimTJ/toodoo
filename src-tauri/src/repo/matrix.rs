//! Eisenhower Matrix: four quadrants, each an editable `filter_rule::Rule`
//! stored in `matrix_config`. Defaults are priority-based (Q0 High … Q3 None) so
//! every task lands in exactly one quadrant; dragging a card sets the task's
//! priority to the target quadrant's representative priority.

use serde::Serialize;
use sqlx::SqlitePool;

use crate::error::{RepoError, Result};
use crate::events::{DomainEvent, EventBus};

use super::filter_rule::{evaluate, Condition, Rule};
use super::filters::eval_rule_tasks;
use super::tasks::{update_task, Task, TaskPatch};
use super::now;

pub const QUADRANTS: [i64; 4] = [0, 1, 2, 3];

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Quadrant {
    pub quadrant: i64,
    pub rule: Rule,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct QuadrantTasks {
    pub quadrant: i64,
    pub tasks: Vec<Task>,
}

/// Default priority-based rule for a quadrant: Q0→High(5) … Q3→None(0).
fn default_rule(quadrant: i64) -> Rule {
    let priority = match quadrant {
        0 => 5,
        1 => 3,
        2 => 1,
        _ => 0,
    };
    Rule::all(vec![Condition::Priority { values: vec![priority] }])
}

/// The four quadrant rules, falling back to defaults for any not yet customized.
pub async fn get_matrix(pool: &SqlitePool) -> Result<Vec<Quadrant>> {
    let rows: Vec<(i64, String)> = sqlx::query_as(
        "SELECT quadrant, rule_json FROM matrix_config WHERE deleted_at IS NULL",
    )
    .fetch_all(pool)
    .await?;

    QUADRANTS
        .iter()
        .map(|&q| {
            let rule = match rows.iter().find(|(quadrant, _)| *quadrant == q) {
                Some((_, json)) => serde_json::from_str(json)
                    .map_err(|e| RepoError::Invalid(format!("bad quadrant {q} rule: {e}")))?,
                None => default_rule(q),
            };
            Ok(Quadrant { quadrant: q, rule })
        })
        .collect()
}

pub async fn set_quadrant(pool: &SqlitePool, bus: &EventBus, quadrant: i64, rule: &Rule) -> Result<()> {
    if !QUADRANTS.contains(&quadrant) {
        return Err(RepoError::Invalid(format!("quadrant {quadrant} out of range")));
    }
    let ts = now();
    let rule_json = serde_json::to_string(rule)
        .map_err(|e| RepoError::Invalid(format!("cannot serialize rule: {e}")))?;
    sqlx::query(
        "INSERT INTO matrix_config (quadrant, rule_json, created_at, updated_at)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(quadrant) DO UPDATE SET rule_json = excluded.rule_json,
                                             updated_at = excluded.updated_at,
                                             deleted_at = NULL",
    )
    .bind(quadrant)
    .bind(&rule_json)
    .bind(&ts)
    .bind(&ts)
    .execute(pool)
    .await?;
    bus.emit(DomainEvent::MatrixChanged);
    Ok(())
}

/// Partition active tasks into quadrants: each task goes to the FIRST quadrant
/// whose rule it satisfies; tasks matching none are omitted.
pub async fn list_matrix(pool: &SqlitePool, today: &str, tz_off_min: i32) -> Result<Vec<QuadrantTasks>> {
    let quadrants = get_matrix(pool).await?;
    // Candidate set = union of all quadrant matches; simplest is to evaluate
    // each quadrant's rule over the active tasks and take first-match.
    let active = eval_rule_tasks(pool, &Rule::all(vec![]), today, tz_off_min).await?;

    let mut buckets: Vec<QuadrantTasks> =
        QUADRANTS.iter().map(|&q| QuadrantTasks { quadrant: q, tasks: vec![] }).collect();
    for task in active {
        if let Some(q) = quadrants
            .iter()
            .find(|q| evaluate(&q.rule, &task, today, tz_off_min))
        {
            buckets[q.quadrant as usize].tasks.push(task);
        }
    }
    Ok(buckets)
}

/// The priority a card takes when dragged into `quadrant` — the first Priority
/// value in that quadrant's rule.
fn representative_priority(rule: &Rule) -> Option<i64> {
    rule.conditions.iter().find_map(|c| match c {
        Condition::Priority { values } => values.first().copied(),
        _ => None,
    })
}

/// Drag action: move a task into a quadrant by setting its priority. A no-op if
/// the quadrant's rule has no priority condition (nothing unambiguous to apply).
pub async fn assign_to_quadrant(
    pool: &SqlitePool,
    bus: &EventBus,
    task_id: &str,
    quadrant: i64,
) -> Result<()> {
    let quadrants = get_matrix(pool).await?;
    let rule = &quadrants
        .iter()
        .find(|q| q.quadrant == quadrant)
        .ok_or_else(|| RepoError::Invalid(format!("quadrant {quadrant} out of range")))?
        .rule;
    let Some(priority) = representative_priority(rule) else {
        return Ok(());
    };
    update_task(pool, bus, task_id, TaskPatch { priority: Some(priority), ..Default::default() }).await?;
    bus.emit(DomainEvent::MatrixChanged);
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::repo::db::connect_in_memory;
    use crate::repo::filter_rule::Match;
    use crate::repo::tasks::tests::quick;
    use crate::repo::tasks::{create_task, get_task, update_task};

    const TODAY: &str = "2026-07-15";

    async fn task_prio(pool: &SqlitePool, bus: &EventBus, title: &str, prio: i64) -> Task {
        let t = create_task(pool, bus, quick("inbox", title)).await.unwrap();
        update_task(pool, bus, &t.id, TaskPatch { priority: Some(prio), ..Default::default() })
            .await
            .unwrap()
    }

    #[tokio::test]
    async fn defaults_are_priority_partitioned() {
        let pool = connect_in_memory().await.unwrap();
        let m = get_matrix(&pool).await.unwrap();
        assert_eq!(m.len(), 4);
        assert_eq!(m[0].rule, Rule::all(vec![Condition::Priority { values: vec![5] }]));
        assert_eq!(m[3].rule, Rule::all(vec![Condition::Priority { values: vec![0] }]));
    }

    #[tokio::test]
    async fn list_matrix_places_each_task_by_priority() {
        let pool = connect_in_memory().await.unwrap();
        let bus = EventBus::new();
        task_prio(&pool, &bus, "hi", 5).await;
        task_prio(&pool, &bus, "med", 3).await;
        task_prio(&pool, &bus, "none", 0).await;

        let m = list_matrix(&pool, TODAY, 0).await.unwrap();
        assert_eq!(m[0].tasks.len(), 1);
        assert_eq!(m[0].tasks[0].title, "hi");
        assert_eq!(m[1].tasks.len(), 1);
        assert_eq!(m[3].tasks.len(), 1);
        assert_eq!(m[2].tasks.len(), 0);
    }

    #[tokio::test]
    async fn assign_to_quadrant_sets_priority() {
        let pool = connect_in_memory().await.unwrap();
        let bus = EventBus::new();
        let t = task_prio(&pool, &bus, "bump me", 0).await;

        assign_to_quadrant(&pool, &bus, &t.id, 0).await.unwrap();
        assert_eq!(get_task(&pool, &t.id).await.unwrap().priority, 5);
    }

    #[tokio::test]
    async fn overlapping_custom_rule_first_match_wins() {
        let pool = connect_in_memory().await.unwrap();
        let bus = EventBus::new();
        task_prio(&pool, &bus, "any", 3).await;
        // Make Q0 a catch-all: every task should land there, not in Q1(medium).
        set_quadrant(&pool, &bus, 0, &Rule { match_: Match::All, conditions: vec![] })
            .await
            .unwrap();

        let m = list_matrix(&pool, TODAY, 0).await.unwrap();
        assert_eq!(m[0].tasks.len(), 1);
        assert_eq!(m[1].tasks.len(), 0);
    }
}
