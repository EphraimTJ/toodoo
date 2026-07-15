use std::path::Path;

use sqlx::migrate::Migrator;
use sqlx::sqlite::{SqliteConnectOptions, SqliteJournalMode, SqlitePool, SqlitePoolOptions};

use crate::error::Result;

pub static MIGRATOR: Migrator = sqlx::migrate!("./migrations");

/// Open (creating if needed) the on-disk database and run pending migrations.
pub async fn connect(db_path: &Path) -> Result<SqlitePool> {
    let opts = SqliteConnectOptions::new()
        .filename(db_path)
        .create_if_missing(true)
        .foreign_keys(true)
        .journal_mode(SqliteJournalMode::Wal);
    let pool = SqlitePoolOptions::new().connect_with(opts).await?;
    MIGRATOR.run(&pool).await?;
    Ok(pool)
}

/// In-memory database for tests. Single connection: each SQLite `:memory:`
/// connection is its own database, so a larger pool would lose state.
pub async fn connect_in_memory() -> Result<SqlitePool> {
    let opts = SqliteConnectOptions::new()
        .in_memory(true)
        .foreign_keys(true);
    let pool = SqlitePoolOptions::new()
        .max_connections(1)
        .connect_with(opts)
        .await?;
    MIGRATOR.run(&pool).await?;
    Ok(pool)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn migrations_apply_cleanly_on_fresh_db() {
        let pool = connect_in_memory().await.expect("migrate");
        // Spot-check a few tables from migration 0001.
        for table in ["tasks", "habits", "changelog", "settings"] {
            let n: i64 =
                sqlx::query_scalar(&format!("SELECT COUNT(*) FROM {table}"))
                    .fetch_one(&pool)
                    .await
                    .unwrap_or_else(|e| panic!("table {table} missing: {e}"));
            assert_eq!(n, 0);
        }
        // Migration 0002 seeds exactly one project: the Inbox.
        let projects: Vec<String> = sqlx::query_scalar("SELECT id FROM projects")
            .fetch_all(&pool)
            .await
            .unwrap();
        assert_eq!(projects, vec!["inbox".to_string()]);
    }
}
