//! Dev-only fixture data for the §8 perf budget (10k-task smoke testing).

use sqlx::SqlitePool;

use crate::error::Result;
use crate::events::{DomainEvent, EventBus};

use super::{append_changelog, new_id, now, ChangeOp};

/// Insert `projects_n` projects with `tasks_n` tasks spread across them.
/// Everything goes through one transaction with changelog rows (batched
/// payloads), then a single `seed.completed` event.
pub async fn seed_demo_data(
    pool: &SqlitePool,
    bus: &EventBus,
    projects_n: usize,
    tasks_n: usize,
) -> Result<()> {
    let ts = now();
    let mut tx = pool.begin().await?;

    let mut project_ids = Vec::with_capacity(projects_n);
    for i in 0..projects_n {
        let id = new_id();
        sqlx::query(
            "INSERT INTO projects (id, name, kind, view_mode, muted, sort_order, closed,
                                   created_at, updated_at)
             VALUES (?, ?, 'TASK', 'LIST', 0, ?, 0, ?, ?)",
        )
        .bind(&id)
        .bind(format!("Seed project {i}"))
        .bind((i as i64) + 100)
        .bind(&ts)
        .bind(&ts)
        .execute(&mut *tx)
        .await?;
        project_ids.push(id);
    }

    for i in 0..tasks_n {
        let id = new_id();
        let project = &project_ids[i % project_ids.len()];
        // Spread due dates over ±30 days around today; every 5th task undated.
        let due = if i % 5 == 0 {
            None
        } else {
            let offset_days = (i as i64 % 61) - 30;
            Some(format!("date('now', '{offset_days} day')"))
        };
        let due_sql = match &due {
            Some(expr) => format!("{expr} || 'T00:00:00.000Z'"),
            None => "NULL".to_string(),
        };
        sqlx::query(&format!(
            "INSERT INTO tasks (id, project_id, title, kind, status, priority, due_at,
                                is_all_day, pinned, sort_orders_json, created_at, updated_at)
             VALUES (?, ?, ?, 'TASK', 'ACTIVE', ?, {due_sql}, 1, 0,
                     json_object('project', ?), ?, ?)"
        ))
        .bind(&id)
        .bind(project)
        .bind(format!("Seed task {i} — lorem ipsum dolor"))
        .bind([0i64, 1, 3, 5][i % 4])
        .bind(((i as i64) + 1) * 1024)
        .bind(&ts)
        .bind(&ts)
        .execute(&mut *tx)
        .await?;
    }

    append_changelog(
        &mut tx,
        "seed",
        "seed",
        ChangeOp::Insert,
        &serde_json::json!({ "projects": projects_n, "tasks": tasks_n }),
    )
    .await?;
    tx.commit().await?;
    bus.emit(DomainEvent::SeedCompleted);
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::repo::db::connect_in_memory;

    #[tokio::test]
    async fn seeds_projects_and_tasks() {
        let pool = connect_in_memory().await.unwrap();
        let bus = EventBus::new();
        seed_demo_data(&pool, &bus, 5, 200).await.unwrap();

        let projects: i64 =
            sqlx::query_scalar("SELECT COUNT(*) FROM projects WHERE name LIKE 'Seed project%'")
                .fetch_one(&pool)
                .await
                .unwrap();
        let tasks: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM tasks")
            .fetch_one(&pool)
            .await
            .unwrap();
        assert_eq!(projects, 5);
        assert_eq!(tasks, 200);
    }
}
