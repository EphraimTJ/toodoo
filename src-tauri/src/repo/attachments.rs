//! Task attachments: images, audio and arbitrary files kept **locally**.
//!
//! The row in `attachments` (migration 0011) is the index; the bytes live under
//! `<app_data>/attachments/<task_id>/<id>-<name>`. Deleting soft-deletes the row
//! (so the changelog stays coherent) *and* removes the bytes — attachments are
//! bulky and there is no restore UI, so we don't keep orphaned files around.
//! See docs/decisions.md.

use std::path::{Path, PathBuf};

use serde::Serialize;
use sqlx::SqlitePool;

use crate::error::{RepoError, Result};
use crate::events::{DomainEvent, EventBus};

use super::{append_changelog, new_id, now, ChangeOp};

/// Largest single attachment we accept (bytes). Keeps the local store sane and
/// bounds the base64 round-trip through the IPC boundary.
pub const MAX_BYTES: usize = 25 * 1024 * 1024;

#[derive(Debug, Clone, Serialize, sqlx::FromRow)]
#[serde(rename_all = "camelCase")]
pub struct Attachment {
    pub id: String,
    pub task_id: String,
    pub file_name: String,
    pub rel_path: String,
    pub mime: Option<String>,
    /// IMAGE | AUDIO | FILE — drives how the UI renders it.
    pub kind: String,
    pub size_bytes: i64,
    pub created_at: String,
    pub updated_at: String,
}

/// Bucket an attachment by MIME type, falling back to the file extension.
pub fn classify(mime: Option<&str>, file_name: &str) -> &'static str {
    if let Some(m) = mime {
        if m.starts_with("image/") {
            return "IMAGE";
        }
        if m.starts_with("audio/") {
            return "AUDIO";
        }
    }
    let ext = file_name.rsplit('.').next().unwrap_or("").to_ascii_lowercase();
    match ext.as_str() {
        "png" | "jpg" | "jpeg" | "gif" | "webp" | "bmp" | "svg" | "avif" => "IMAGE",
        "mp3" | "wav" | "ogg" | "m4a" | "flac" | "aac" | "opus" | "weba" => "AUDIO",
        _ => "FILE",
    }
}

/// Reduce a user-supplied name to a safe single path segment: no directory
/// separators, no `..`, no leading dots, length-capped. Never empty.
pub fn sanitize_file_name(raw: &str) -> String {
    let base = raw.rsplit(['/', '\\']).next().unwrap_or(raw);
    let cleaned: String = base
        .chars()
        .map(|c| if c.is_control() || "<>:\"/\\|?*".contains(c) { '_' } else { c })
        .collect();
    let trimmed = cleaned.trim().trim_start_matches('.').trim();
    let name = if trimmed.is_empty() { "file" } else { trimmed };
    name.chars().take(120).collect()
}

/// Absolute path of an attachment's bytes under `base_dir`.
pub fn resolve_path(base_dir: &Path, att: &Attachment) -> PathBuf {
    base_dir.join(&att.rel_path)
}

/// The 0001 table stores the relative path in `path` and the byte count in
/// `size`; alias them to the struct's field names.
const COLUMNS: &str = "id, task_id, file_name, path AS rel_path, mime, kind, \
                       COALESCE(size, 0) AS size_bytes, created_at, updated_at";

pub async fn list_attachments(pool: &SqlitePool, task_id: &str) -> Result<Vec<Attachment>> {
    Ok(sqlx::query_as(&format!(
        "SELECT {COLUMNS} FROM attachments
         WHERE task_id = ? AND deleted_at IS NULL ORDER BY created_at, id"
    ))
    .bind(task_id)
    .fetch_all(pool)
    .await?)
}

pub async fn get_attachment(pool: &SqlitePool, id: &str) -> Result<Attachment> {
    sqlx::query_as(&format!(
        "SELECT {COLUMNS} FROM attachments WHERE id = ? AND deleted_at IS NULL"
    ))
    .bind(id)
    .fetch_optional(pool)
    .await?
    .ok_or_else(|| RepoError::NotFound(format!("attachment {id}")))
}

/// Store `bytes` as a new attachment on `task_id` and index it.
pub async fn add_attachment(
    pool: &SqlitePool,
    bus: &EventBus,
    base_dir: &Path,
    task_id: &str,
    file_name: &str,
    mime: Option<&str>,
    bytes: &[u8],
) -> Result<Attachment> {
    if bytes.is_empty() {
        return Err(RepoError::Invalid("attachment is empty".into()));
    }
    if bytes.len() > MAX_BYTES {
        return Err(RepoError::Invalid(format!(
            "attachment is larger than {} MB",
            MAX_BYTES / (1024 * 1024)
        )));
    }
    // The task must exist (and not be a stale id) before we write any bytes.
    let exists: Option<String> =
        sqlx::query_scalar("SELECT id FROM tasks WHERE id = ? AND deleted_at IS NULL")
            .bind(task_id)
            .fetch_optional(pool)
            .await?;
    if exists.is_none() {
        return Err(RepoError::NotFound(format!("task {task_id}")));
    }

    let id = new_id();
    let name = sanitize_file_name(file_name);
    let kind = classify(mime, &name);
    // Task-scoped folder keeps the store browsable and deletes cheap.
    let rel_path = format!("{task_id}/{id}-{name}");
    let abs = base_dir.join(&rel_path);
    if let Some(parent) = abs.parent() {
        std::fs::create_dir_all(parent)
            .map_err(|e| RepoError::Invalid(format!("cannot create attachment folder: {e}")))?;
    }
    std::fs::write(&abs, bytes)
        .map_err(|e| RepoError::Invalid(format!("cannot write attachment: {e}")))?;

    let ts = now();
    let mut tx = pool.begin().await?;
    let insert = sqlx::query(
        "INSERT INTO attachments
           (id, task_id, file_name, path, mime, kind, size, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
    )
    .bind(&id)
    .bind(task_id)
    .bind(&name)
    .bind(&rel_path)
    .bind(mime)
    .bind(kind)
    .bind(bytes.len() as i64)
    .bind(&ts)
    .bind(&ts)
    .execute(&mut *tx)
    .await;
    if let Err(e) = insert {
        // Don't leave bytes behind for a row that never landed.
        let _ = std::fs::remove_file(&abs);
        return Err(e.into());
    }
    append_changelog(
        &mut tx,
        "attachment",
        &id,
        ChangeOp::Insert,
        &serde_json::json!({ "taskId": task_id, "fileName": name }),
    )
    .await?;
    tx.commit().await?;
    bus.emit(DomainEvent::AttachmentChanged { task_id: task_id.to_string() });

    Ok(Attachment {
        id,
        task_id: task_id.to_string(),
        file_name: name,
        rel_path,
        mime: mime.map(str::to_string),
        kind: kind.to_string(),
        size_bytes: bytes.len() as i64,
        created_at: ts.clone(),
        updated_at: ts,
    })
}

/// Read an attachment's bytes back off disk.
pub async fn read_attachment(
    pool: &SqlitePool,
    base_dir: &Path,
    id: &str,
) -> Result<(Attachment, Vec<u8>)> {
    let att = get_attachment(pool, id).await?;
    let bytes = std::fs::read(resolve_path(base_dir, &att))
        .map_err(|e| RepoError::Invalid(format!("cannot read attachment: {e}")))?;
    Ok((att, bytes))
}

/// Soft-delete the row and remove the stored bytes.
pub async fn delete_attachment(
    pool: &SqlitePool,
    bus: &EventBus,
    base_dir: &Path,
    id: &str,
) -> Result<()> {
    let att = get_attachment(pool, id).await?;
    let ts = now();
    let mut tx = pool.begin().await?;
    sqlx::query("UPDATE attachments SET deleted_at = ?, updated_at = ? WHERE id = ?")
        .bind(&ts)
        .bind(&ts)
        .bind(id)
        .execute(&mut *tx)
        .await?;
    append_changelog(&mut tx, "attachment", id, ChangeOp::Delete, &serde_json::json!({})).await?;
    tx.commit().await?;
    // Best-effort: the index is the source of truth, a leftover file is harmless.
    let _ = std::fs::remove_file(resolve_path(base_dir, &att));
    bus.emit(DomainEvent::AttachmentChanged { task_id: att.task_id });
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::repo::db::connect_in_memory;
    use crate::repo::tasks::create_task;
    use crate::repo::tasks::tests::quick;

    #[test]
    fn classify_uses_mime_then_extension() {
        assert_eq!(classify(Some("image/png"), "x.bin"), "IMAGE");
        assert_eq!(classify(Some("audio/mpeg"), "x.bin"), "AUDIO");
        assert_eq!(classify(None, "clip.WAV"), "AUDIO");
        assert_eq!(classify(None, "shot.jpeg"), "IMAGE");
        assert_eq!(classify(None, "notes.pdf"), "FILE");
        assert_eq!(classify(Some("application/pdf"), "notes.pdf"), "FILE");
    }

    #[test]
    fn sanitize_strips_paths_and_traversal() {
        assert_eq!(sanitize_file_name("../../etc/passwd"), "passwd");
        assert_eq!(sanitize_file_name(r"C:\tmp\a b.png"), "a b.png");
        assert_eq!(sanitize_file_name("   "), "file");
        assert_eq!(sanitize_file_name(".."), "file");
        assert!(!sanitize_file_name("a/b|c?.txt").contains(['/', '|', '?']));
    }

    #[tokio::test]
    async fn add_list_read_and_delete() {
        let dir = std::env::temp_dir().join(format!("toodoo-att-{}", new_id()));
        let pool = connect_in_memory().await.unwrap();
        let bus = EventBus::new();
        let task = create_task(&pool, &bus, quick("inbox", "t")).await.unwrap();

        let att = add_attachment(&pool, &bus, &dir, &task.id, "shot.png", Some("image/png"), b"hello")
            .await
            .unwrap();
        assert_eq!(att.kind, "IMAGE");
        assert_eq!(att.size_bytes, 5);
        assert!(resolve_path(&dir, &att).exists());

        let listed = list_attachments(&pool, &task.id).await.unwrap();
        assert_eq!(listed.len(), 1);

        let (_, bytes) = read_attachment(&pool, &dir, &att.id).await.unwrap();
        assert_eq!(bytes, b"hello");

        delete_attachment(&pool, &bus, &dir, &att.id).await.unwrap();
        assert!(list_attachments(&pool, &task.id).await.unwrap().is_empty());
        assert!(!resolve_path(&dir, &att).exists());

        let _ = std::fs::remove_dir_all(&dir);
    }

    #[tokio::test]
    async fn rejects_empty_and_unknown_task() {
        let dir = std::env::temp_dir().join(format!("toodoo-att-{}", new_id()));
        let pool = connect_in_memory().await.unwrap();
        let bus = EventBus::new();
        let task = create_task(&pool, &bus, quick("inbox", "t")).await.unwrap();

        assert!(matches!(
            add_attachment(&pool, &bus, &dir, &task.id, "e.txt", None, b"").await,
            Err(RepoError::Invalid(_))
        ));
        assert!(matches!(
            add_attachment(&pool, &bus, &dir, "nope", "a.txt", None, b"x").await,
            Err(RepoError::NotFound(_))
        ));
        let _ = std::fs::remove_dir_all(&dir);
    }
}
