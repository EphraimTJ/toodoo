//! Database backups: consistent single-file snapshots via SQLite `VACUUM INTO`
//! (safe despite WAL), listing/pruning, and a staged restore applied at startup
//! (before the pool opens) so we never swap the DB under a live connection.

use std::fs;
use std::path::Path;

use chrono::{DateTime, SecondsFormat, Utc};
use serde::Serialize;
use serde_json::json;
use sqlx::sqlite::SqliteConnectOptions;
use sqlx::{Connection, SqliteConnection, SqlitePool};

use crate::error::{RepoError, Result};
use crate::events::EventBus;

use super::now;
use super::settings::{get_setting, set_setting};

const PREFIX: &str = "toodoo-";
const SUFFIX: &str = ".db";
/// Staged-restore filename under the app data dir.
pub const PENDING_RESTORE: &str = "pending-restore.db";
/// Where the previous live db is parked while a restore is being confirmed.
pub const RESTORE_ROLLBACK: &str = "toodoo.db.rollback";
/// Where a restored db that failed to open is parked for inspection.
pub const FAILED_RESTORE: &str = "toodoo.db.failed-restore";

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

/// Verify that `path` is a healthy SQLite database carrying our core schema.
/// Guards both staging and application of a restore: a partial/corrupt file
/// (interrupted copy, disk full, antivirus) must never become the live db.
async fn validate_snapshot(path: &Path) -> Result<()> {
    let invalid = |what: &str| RepoError::Invalid(format!("restore validation failed: {what}"));
    let opts = SqliteConnectOptions::new().filename(path).read_only(true);
    let mut conn = SqliteConnection::connect_with(&opts)
        .await
        .map_err(|e| invalid(&format!("cannot open as SQLite: {e}")))?;
    let verdict: String = sqlx::query_scalar("PRAGMA integrity_check")
        .fetch_one(&mut conn)
        .await
        .map_err(|e| invalid(&format!("integrity_check errored: {e}")))?;
    if verdict != "ok" {
        let _ = conn.close().await;
        return Err(invalid(&format!("integrity_check reported {verdict:?}")));
    }
    let core_tables: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND name IN ('tasks', 'projects')",
    )
    .fetch_one(&mut conn)
    .await
    .map_err(|e| invalid(&format!("schema check errored: {e}")))?;
    conn.close().await.map_err(|e| invalid(&format!("close failed: {e}")))?;
    if core_tables != 2 {
        return Err(invalid("not a Toodoo database (tasks/projects tables missing)"));
    }
    Ok(())
}

fn with_tmp_suffix(path: &Path) -> std::path::PathBuf {
    let mut os = path.as_os_str().to_owned();
    os.push(".tmp");
    std::path::PathBuf::from(os)
}

/// Stage a snapshot to be applied on the next launch: copy to a temp file,
/// validate it as a SQLite db with our schema, fsync, then atomically rename to
/// `staged`. An invalid or partially-copied snapshot never becomes
/// `pending-restore.db`, so `apply_pending_restore` only ever sees a file that
/// passed validation at staging time (and re-validates anyway).
pub async fn stage_restore(src: &Path, staged: &Path) -> Result<()> {
    let tmp = with_tmp_suffix(staged);
    if let Err(e) = fs::copy(src, &tmp) {
        let _ = fs::remove_file(&tmp);
        return Err(io_err(e));
    }
    if let Err(e) = validate_snapshot(&tmp).await {
        let _ = fs::remove_file(&tmp);
        return Err(e);
    }
    // fsync needs a writable handle on Windows (FlushFileBuffers).
    match fs::OpenOptions::new().write(true).open(&tmp).and_then(|f| f.sync_all()) {
        Ok(()) => {}
        Err(e) => {
            let _ = fs::remove_file(&tmp);
            return Err(io_err(e));
        }
    }
    fs::rename(&tmp, staged).map_err(io_err)?;
    Ok(())
}

/// If a staged restore exists in `data_dir`, swap it onto `toodoo.db` before
/// the pool opens. The staged file is re-validated first (a corrupt file is
/// discarded and the live db left untouched), and the live db is renamed to
/// `RESTORE_ROLLBACK` — never deleted — so a restore that later fails to open
/// can be undone (`undo_failed_restore`). Call `finalize_restore` once the
/// restored db has opened and migrated to drop the rollback. Returns whether a
/// restore was applied.
pub async fn apply_pending_restore(data_dir: &Path) -> Result<bool> {
    let staged = data_dir.join(PENDING_RESTORE);
    if !staged.exists() {
        return Ok(false);
    }
    if let Err(e) = validate_snapshot(&staged).await {
        let _ = fs::remove_file(&staged);
        return Err(e);
    }
    let target = data_dir.join("toodoo.db");
    for sidecar in ["toodoo.db-wal", "toodoo.db-shm"] {
        let p = data_dir.join(sidecar);
        if p.exists() {
            let _ = fs::remove_file(p);
        }
    }
    let rollback = data_dir.join(RESTORE_ROLLBACK);
    let _ = fs::remove_file(&rollback);
    if target.exists() {
        fs::rename(&target, &rollback).map_err(io_err)?;
    }
    if let Err(e) = fs::rename(&staged, &target) {
        // Put the live db back so a rename failure can't leave the app with
        // no database at all.
        if rollback.exists() {
            let _ = fs::rename(&rollback, &target);
        }
        return Err(io_err(e));
    }
    Ok(true)
}

/// Drop the rollback copy of the pre-restore db. Call only after the restored
/// db has successfully opened and migrated.
pub fn finalize_restore(data_dir: &Path) {
    let _ = fs::remove_file(data_dir.join(RESTORE_ROLLBACK));
}

/// Undo a just-applied restore whose db failed to open: park the bad file at
/// `FAILED_RESTORE` (for inspection) and put the rollback back as the live db.
/// Returns whether a rollback existed to restore.
pub fn undo_failed_restore(data_dir: &Path) -> Result<bool> {
    let rollback = data_dir.join(RESTORE_ROLLBACK);
    if !rollback.exists() {
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
        let failed = data_dir.join(FAILED_RESTORE);
        let _ = fs::remove_file(&failed);
        fs::rename(&target, &failed).map_err(io_err)?;
    }
    fs::rename(&rollback, &target).map_err(io_err)?;
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

    /// A real migrated db at `path` with a marker project so the file can be
    /// identified after swaps. Closed (pool dropped) before returning.
    async fn seeded_db(path: &Path, marker: &str) {
        let pool = crate::repo::db::connect(path).await.unwrap();
        sqlx::query(
            "INSERT INTO projects (id, name, sort_order, created_at, updated_at)
             VALUES (?, ?, 0, '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z')",
        )
        .bind(marker)
        .bind(marker)
        .execute(&pool)
        .await
        .unwrap();
        // Fold the WAL into the main file so a plain file copy is complete
        // (production snapshots use VACUUM INTO, which never has a WAL).
        sqlx::query("PRAGMA wal_checkpoint(TRUNCATE)").execute(&pool).await.unwrap();
        pool.close().await;
    }

    async fn has_project(path: &Path, id: &str) -> bool {
        let pool = crate::repo::db::connect(path).await.unwrap();
        let n: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM projects WHERE id = ?")
            .bind(id)
            .fetch_one(&pool)
            .await
            .unwrap();
        pool.close().await;
        n == 1
    }

    #[tokio::test]
    async fn stage_and_apply_swaps_the_database() {
        let data_dir = temp_dir();
        let target = data_dir.join("toodoo.db");
        seeded_db(&target, "old-marker").await;
        // A leftover WAL sidecar should be cleared on apply.
        fs::write(data_dir.join("toodoo.db-wal"), b"junk").unwrap();

        let snapshot = data_dir.join("snap.db");
        seeded_db(&snapshot, "new-marker").await;
        stage_restore(&snapshot, &data_dir.join(PENDING_RESTORE)).await.unwrap();

        assert!(apply_pending_restore(&data_dir).await.unwrap());
        assert!(!data_dir.join(PENDING_RESTORE).exists());
        assert!(!data_dir.join("toodoo.db-wal").exists());
        // The restored db is live; the old db is parked as the rollback.
        assert!(has_project(&target, "new-marker").await);
        assert!(data_dir.join(RESTORE_ROLLBACK).exists());
        // Confirming the restore drops the rollback; second apply is a no-op.
        finalize_restore(&data_dir);
        assert!(!data_dir.join(RESTORE_ROLLBACK).exists());
        assert!(!apply_pending_restore(&data_dir).await.unwrap());

        fs::remove_dir_all(&data_dir).ok();
    }

    /// docs/adversarial-review-findings.md finding 1: a corrupt/truncated
    /// staged file (interrupted copy, disk full, antivirus lock) must never
    /// replace the live database.
    #[tokio::test]
    async fn apply_pending_restore_rejects_a_truncated_corrupt_file() {
        let data_dir = temp_dir();
        let target = data_dir.join("toodoo.db");
        fs::write(&target, b"GOOD-LIVE-DB").unwrap();

        fs::write(data_dir.join(PENDING_RESTORE), b"TRUNC").unwrap();

        let result = apply_pending_restore(&data_dir).await;
        assert!(result.is_err(), "corrupt staged restore must be rejected");
        assert_eq!(fs::read(&target).unwrap(), b"GOOD-LIVE-DB");
        // The garbage file is discarded so it can't be retried next launch.
        assert!(!data_dir.join(PENDING_RESTORE).exists());

        fs::remove_dir_all(&data_dir).ok();
    }

    #[tokio::test]
    async fn stage_restore_rejects_an_invalid_source_snapshot() {
        let data_dir = temp_dir();
        let bad = data_dir.join("bad-snap.db");
        fs::write(&bad, b"not a database").unwrap();

        let staged = data_dir.join(PENDING_RESTORE);
        assert!(stage_restore(&bad, &staged).await.is_err());
        assert!(!staged.exists(), "invalid snapshot must not become pending-restore.db");
        assert!(!with_tmp_suffix(&staged).exists(), "temp staging file must be cleaned up");

        fs::remove_dir_all(&data_dir).ok();
    }

    /// After an apply, the pre-restore db survives as the rollback until the
    /// restored db is confirmed; `undo_failed_restore` puts it back.
    #[tokio::test]
    async fn rollback_survives_failed_apply() {
        let data_dir = temp_dir();
        let target = data_dir.join("toodoo.db");
        seeded_db(&target, "original-marker").await;

        let snapshot = data_dir.join("snap.db");
        seeded_db(&snapshot, "restored-marker").await;
        stage_restore(&snapshot, &data_dir.join(PENDING_RESTORE)).await.unwrap();
        assert!(apply_pending_restore(&data_dir).await.unwrap());

        // Simulate the restored db failing to open/migrate on startup: the
        // rollback must still exist and undo must reinstate the original.
        assert!(data_dir.join(RESTORE_ROLLBACK).exists());
        assert!(undo_failed_restore(&data_dir).unwrap());
        assert!(has_project(&target, "original-marker").await);
        // The bad restore is parked for inspection, not lost.
        assert!(data_dir.join(FAILED_RESTORE).exists());
        // Without a rollback, undo is a no-op.
        assert!(!undo_failed_restore(&data_dir).unwrap());

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
