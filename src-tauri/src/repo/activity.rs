//! Per-entity activity log (created / completed / edited history). Written from
//! task mutations; surfaced in the detail pane.

use serde::Serialize;
use sqlx::{SqliteConnection, SqlitePool};

use crate::error::Result;

use super::{new_id, now};

#[derive(Debug, Clone, Serialize, sqlx::FromRow)]
#[serde(rename_all = "camelCase")]
pub struct ActivityEntry {
    pub id: String,
    pub entity_kind: String,
    pub entity_id: String,
    pub action: String,
    pub payload_json: Option<String>,
    pub at: String,
}

/// Append an activity row inside the caller's transaction so it commits with
/// the mutation it describes.
pub(crate) async fn log(
    conn: &mut SqliteConnection,
    entity_kind: &str,
    entity_id: &str,
    action: &str,
    payload: &serde_json::Value,
) -> Result<()> {
    let ts = now();
    sqlx::query(
        "INSERT INTO activity (id, entity_kind, entity_id, action, payload_json, at,
                               created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    )
    .bind(new_id())
    .bind(entity_kind)
    .bind(entity_id)
    .bind(action)
    .bind(payload.to_string())
    .bind(&ts)
    .bind(&ts)
    .bind(&ts)
    .execute(conn)
    .await?;
    Ok(())
}

pub async fn list_activity(
    pool: &SqlitePool,
    entity_kind: &str,
    entity_id: &str,
) -> Result<Vec<ActivityEntry>> {
    Ok(sqlx::query_as(
        "SELECT id, entity_kind, entity_id, action, payload_json, at FROM activity
         WHERE entity_kind = ? AND entity_id = ? AND deleted_at IS NULL
         ORDER BY at DESC",
    )
    .bind(entity_kind)
    .bind(entity_id)
    .fetch_all(pool)
    .await?)
}
