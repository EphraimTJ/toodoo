//! Database backups: consistent single-file snapshots via SQLite `VACUUM INTO`
//! (safe despite WAL), listing/pruning, and a staged restore applied at startup
//! (before the pool opens) so we never swap the DB under a live connection.

use std::fs;
use std::path::Path;

use chrono::{DateTime, SecondsFormat, Utc};
use serde::Serialize;
use serde_json::json;
use sqlx::SqlitePool;

use crate::error::{RepoError, Result};
use crate::events::EventBus;

use super::now;
use super::settings::{get_setting, set_setting};

const PREFIX: &str = "toodoo-";
const SUFFIX: &str = ".db";
/// Staged-restore filename under the app data dir.
pub const PENDING_RESTORE: &str = "pending-restore.db";

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BackupInfo {
    pub name: String,
    pub path: String,
    pub bytes: u64,
    pub created_at: String,
}

fn io_err(e: std::io::Error) -> RepoError {
    RepoError::Invalid(format!("backup io error: {e}"))
}

// ---- config (settings-backed) ----------------------------------------------

const KEY_AUTO: &str = "backup.autoEnabled";
const KEY_KEEP: &str = "backup.keep";
const KEY_LAST: &str = "backup.lastAt";
pub const DEFAULT_KEEP: i64 = 10;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BackupConfig {
    pub auto_enabled: bool,
    pub keep: i64,
    pub last_at: Option<String>,
}

pub async fn config(pool: &SqlitePool) -> Result<BackupConfig> {
    Ok(BackupConfig {
        auto_enabled: get_setting(pool, KEY_AUTO).await?.and_then(|v| v.as_bool()).unwrap_or(true),
        keep: get_setting(pool, KEY_KEEP).await?.and_then(|v| v.as_i64()).unwrap_or(DEFAULT_KEEP),
        last_at: get_setting(pool, KEY_LAST).await?.and_then(|v| v.as_str().map(String::from)),
    })
}

pub async fn set_config(
    pool: &SqlitePool,
    bus: &EventBus,
    auto_enabled: bool,
    keep: i64,
) -> Result<BackupConfig> {
    set_setting(pool, bus, KEY_AUTO, json!(auto_enabled)).await?;
    set_setting(pool, bus, KEY_KEEP, json!(keep.max(1))).await?;
    config(pool).await
}

async fn mark_backed_up(pool: &SqlitePool, bus: &EventBus) -> Result<()> {
    set_setting(pool, bus, KEY_LAST, json!(now())).await
}

/// The `YYYY-MM-DD` of the last auto-backup, if any (local calendar day).
pub async fn last_backup_day(pool: &SqlitePool) -> Result<Option<String>> {
    Ok(config(pool).await?.last_at.and_then(|s| s.get(0..10).map(String::from)))
}

/// Snapshot into `dir`, prune to `keep`, and stamp the time. Used by both the
/// manual "Back up now" command and the daily scheduler (which skips repeat days).
pub async fn backup_now(pool: &SqlitePool, bus: &EventBus, dir: &Path) -> Result<BackupInfo> {
    let info = create_backup(pool, dir).await?;
    let keep = config(pool).await?.keep.max(1) as usize;
    prune(dir, keep)?;
    mark_backed_up(pool, bus).await?;
    Ok(info)
}

/// Snapshot the live database into `dir` as `toodoo-<timestamp>.db`.
pub async fn create_backup(pool: &SqlitePool, dir: &Path) -> Result<BackupInfo> {
    fs::create_dir_all(dir).map_err(io_err)?;
    let name = format!("{PREFIX}{}{SUFFIX}", Utc::now().format("%Y%m%d-%H%M%S%3f"));
    let path = dir.join(&name);
    // VACUUM INTO writes a fresh, consistent copy regardless of WAL state. It
    // won't take a bound parameter, so embed the path as a quoted literal
    // (backslashes are literal in SQLite strings; only single quotes need escaping).
    let literal = path.to_string_lossy().replace('\'', "''");
    sqlx::query(&format!("VACUUM INTO '{literal}'")).execute(pool).await?;
    info_for(&path)
}

fn info_for(path: &Path) -> Result<BackupInfo> {
    let meta = fs::metadata(path).map_err(io_err)?;
    let created: DateTime<Utc> = meta.modified().map_err(io_err)?.into();
    Ok(BackupInfo {
        name: path.file_name().and_then(|n| n.to_str()).unwrap_or_default().to_string(),
        path: path.to_string_lossy().into_owned(),
        bytes: meta.len(),
        created_at: created.to_rfc3339_opts(SecondsFormat::Millis, true),
    })
}

/// List snapshots in `dir`, newest first. A missing dir is an empty list.
pub fn list_backups(dir: &Path) -> Result<Vec<BackupInfo>> {
    if !dir.exists() {
        return Ok(Vec::new());
    }
    let mut out = Vec::new();
    for entry in fs::read_dir(dir).map_err(io_err)? {
        let path = entry.map_err(io_err)?.path();
        let is_backup = path
            .file_name()
            .and_then(|n| n.to_str())
            .is_some_and(|n| n.starts_with(PREFIX) && n.ends_with(SUFFIX));
        if is_backup {
            out.push(info_for(&path)?);
        }
    }
    // Timestamped names sort chronologically, so reverse-name = newest first.
    out.sort_by(|a, b| b.name.cmp(&a.name));
    Ok(out)
}

pub fn delete_backup(path: &Path) -> Result<()> {
    fs::remove_file(path).map_err(io_err)
}

/// Keep the `keep` newest snapshots in `dir`, deleting the rest.
pub fn prune(dir: &Path, keep: usize) -> Result<()> {
    let backups = list_backups(dir)?;
    for b in backups.into_iter().skip(keep) {
        let _ = fs::remove_file(&b.path);
    }
    Ok(())
}

/// Stage a snapshot to be applied on the next launch (copied to `staged`).
pub fn stage_restore(src: &Path, staged: &Path) -> Result<()> {
    fs::copy(src, staged).map_err(io_err)?;
    Ok(())
}

/// If a staged restore exists in `data_dir`, swap it onto `toodoo.db` (clearing
/// the stale `-wal`/`-shm` sidecars) before the pool opens. Returns whether one
/// was applied.
pub fn apply_pending_restore(data_dir: &Path) -> Result<bool> {
    let staged = data_dir.join(PENDING_RESTORE);
    if !staged.exists() {
        return Ok(false);
    }
    let target = data_dir.join("toodoo.db");
    for sidecar in ["toodoo.db-wal", "toodoo.db-shm"] {
        let p = data_dir.join(sidecar);
        if p.exists() {
            let _ = fs::remove_file(p);
        }
    }
    if target.exists() {
        fs::remove_file(&target).map_err(io_err)?;
    }
    fs::rename(&staged, &target).map_err(io_err)?;
    Ok(true)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;

    fn temp_dir() -> PathBuf {
        let d = std::env::temp_dir().join(format!("toodoo-bk-{}", uuid::Uuid::new_v4()));
        fs::create_dir_all(&d).unwrap();
        d
    }

    #[tokio::test]
    async fn create_backup_writes_an_openable_db() {
        // VACUUM INTO snapshots the main database file, so the source must be
        // on-disk (a `:memory:` source produces no file). This mirrors the app.
        let dir = temp_dir();
        let src = dir.join("source.db");
        let pool = crate::repo::db::connect(&src).await.unwrap();

        let info = create_backup(&pool, &dir).await.unwrap();
        assert!(info.name.starts_with("toodoo-") && info.name.ends_with(".db"));
        assert!(info.bytes > 0);

        // The snapshot opens and carries the seeded Inbox.
        let restored = crate::repo::db::connect(Path::new(&info.path)).await.unwrap();
        let n: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM projects WHERE id = 'inbox'")
            .fetch_one(&restored)
            .await
            .unwrap();
        assert_eq!(n, 1);

        drop(pool);
        drop(restored);
        fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn stage_and_apply_swaps_the_database() {
        let data_dir = temp_dir();
        let target = data_dir.join("toodoo.db");
        fs::write(&target, b"OLD").unwrap();
        // A leftover WAL sidecar should be cleared on apply.
        fs::write(data_dir.join("toodoo.db-wal"), b"junk").unwrap();

        let snapshot = data_dir.join("snap.db");
        fs::write(&snapshot, b"NEW-CONTENT").unwrap();
        stage_restore(&snapshot, &data_dir.join(PENDING_RESTORE)).unwrap();

        assert!(apply_pending_restore(&data_dir).unwrap());
        assert_eq!(fs::read(&target).unwrap(), b"NEW-CONTENT");
        assert!(!data_dir.join(PENDING_RESTORE).exists());
        assert!(!data_dir.join("toodoo.db-wal").exists());
        // Second call is a no-op.
        assert!(!apply_pending_restore(&data_dir).unwrap());

        fs::remove_dir_all(&data_dir).ok();
    }

    #[test]
    fn prune_keeps_the_newest() {
        let dir = temp_dir();
        for stamp in ["20260101-000000000", "20260102-000000000", "20260103-000000000"] {
            fs::write(dir.join(format!("toodoo-{stamp}.db")), b"x").unwrap();
        }
        // A non-backup file is ignored.
        fs::write(dir.join("notes.txt"), b"y").unwrap();

        prune(&dir, 2).unwrap();
        let left = list_backups(&dir).unwrap();
        assert_eq!(left.len(), 2);
        assert_eq!(left[0].name, "toodoo-20260103-000000000.db"); // newest first
        assert_eq!(left[1].name, "toodoo-20260102-000000000.db");

        fs::remove_dir_all(&dir).ok();
    }
}
