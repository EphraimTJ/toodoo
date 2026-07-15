use serde_json::Value;
use sqlx::SqlitePool;

use crate::error::Result;
use crate::events::{DomainEvent, EventBus};

use super::{append_changelog, now, ChangeOp};

pub async fn get_setting(pool: &SqlitePool, key: &str) -> Result<Option<Value>> {
    let raw: Option<String> = sqlx::query_scalar(
        "SELECT value_json FROM settings WHERE key = ? AND deleted_at IS NULL",
    )
    .bind(key)
    .fetch_optional(pool)
    .await?;
    match raw {
        Some(s) => Ok(Some(serde_json::from_str(&s)?)),
        None => Ok(None),
    }
}

pub async fn set_setting(pool: &SqlitePool, bus: &EventBus, key: &str, value: Value) -> Result<()> {
    let ts = now();
    let mut tx = pool.begin().await?;
    sqlx::query(
        "INSERT INTO settings (key, value_json, created_at, updated_at, deleted_at)
         VALUES (?, ?, ?, ?, NULL)
         ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json,
                                        updated_at = excluded.updated_at,
                                        deleted_at = NULL",
    )
    .bind(key)
    .bind(value.to_string())
    .bind(&ts)
    .bind(&ts)
    .execute(&mut *tx)
    .await?;
    append_changelog(&mut tx, "setting", key, ChangeOp::Update, &value).await?;
    tx.commit().await?;

    bus.emit(DomainEvent::SettingChanged { key: key.to_string() });
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::repo::db::connect_in_memory;
    use serde_json::json;

    #[tokio::test]
    async fn missing_setting_is_none() {
        let pool = connect_in_memory().await.unwrap();
        assert_eq!(get_setting(&pool, "theme").await.unwrap(), None);
    }

    #[tokio::test]
    async fn set_then_get_round_trip_and_upsert() {
        let pool = connect_in_memory().await.unwrap();
        let bus = EventBus::new();

        set_setting(&pool, &bus, "theme", json!("dark")).await.unwrap();
        assert_eq!(get_setting(&pool, "theme").await.unwrap(), Some(json!("dark")));

        set_setting(&pool, &bus, "theme", json!("light")).await.unwrap();
        assert_eq!(get_setting(&pool, "theme").await.unwrap(), Some(json!("light")));

        // Both mutations logged.
        let n: i64 = sqlx::query_scalar(
            "SELECT COUNT(*) FROM changelog WHERE entity_kind = 'setting' AND entity_id = 'theme'",
        )
        .fetch_one(&pool)
        .await
        .unwrap();
        assert_eq!(n, 2);
    }

    #[tokio::test]
    async fn set_setting_emits_event() {
        let pool = connect_in_memory().await.unwrap();
        let bus = EventBus::new();
        let mut rx = bus.subscribe();
        set_setting(&pool, &bus, "theme", json!("dark")).await.unwrap();
        assert!(matches!(
            rx.recv().await.unwrap(),
            DomainEvent::SettingChanged { key } if key == "theme"
        ));
    }
}
