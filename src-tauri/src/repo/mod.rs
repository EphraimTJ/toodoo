//! Repository layer: the ONLY place SQL is written. The UI reaches this
//! through Tauri commands (and later the local REST API). Every mutation
//! appends to `changelog` and emits a `DomainEvent` on the bus.

pub mod db;
pub mod projects;
pub mod settings;

use chrono::{SecondsFormat, Utc};
use sqlx::SqliteConnection;
use uuid::Uuid;

use crate::error::Result;

pub fn new_id() -> String {
    Uuid::new_v4().to_string()
}

/// RFC 3339 UTC timestamp, millisecond precision — the format every
/// `created_at`/`updated_at`/`deleted_at` column stores.
pub fn now() -> String {
    Utc::now().to_rfc3339_opts(SecondsFormat::Millis, true)
}

#[derive(Debug, Clone, Copy)]
pub enum ChangeOp {
    Insert,
    Update,
    Delete,
}

impl ChangeOp {
    fn as_str(self) -> &'static str {
        match self {
            ChangeOp::Insert => "INSERT",
            ChangeOp::Update => "UPDATE",
            ChangeOp::Delete => "DELETE",
        }
    }
}

/// Append one changelog row inside the caller's transaction, so the data
/// write and its changelog entry commit (or roll back) together.
pub(crate) async fn append_changelog(
    conn: &mut SqliteConnection,
    entity_kind: &str,
    entity_id: &str,
    op: ChangeOp,
    payload: &serde_json::Value,
) -> Result<()> {
    sqlx::query(
        "INSERT INTO changelog (id, entity_kind, entity_id, op, payload_json, at)
         VALUES (?, ?, ?, ?, ?, ?)",
    )
    .bind(new_id())
    .bind(entity_kind)
    .bind(entity_id)
    .bind(op.as_str())
    .bind(payload.to_string())
    .bind(now())
    .execute(conn)
    .await?;
    Ok(())
}
