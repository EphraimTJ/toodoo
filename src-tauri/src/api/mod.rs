//! Local REST API — a TickTick-Open-API-compatible surface served on
//! `127.0.0.1:<port>` (off by default; enabled from Settings). Every handler
//! delegates to the repository layer; no SQL lives here. Bearer-token auth
//! guards the `/open/v1` routes. The token + flags live in `settings`.

mod auth;
mod dto;
mod routes;

#[cfg(test)]
mod tests;

use std::sync::{Arc, RwLock};

use axum::Router;
use serde::Serialize;
use serde_json::json;
use sqlx::SqlitePool;
use tokio::sync::oneshot;

use crate::error::Result;
use crate::events::EventBus;
use crate::repo::settings::{get_setting, set_setting};

pub const DEFAULT_PORT: u16 = 7420;

const KEY_TOKEN: &str = "api.token";
const KEY_ENABLED: &str = "api.enabled";
const KEY_PORT: &str = "api.port";

/// Shared state handed to every route. `token` is shared so regenerating it
/// takes effect on the live server without a restart.
#[derive(Clone)]
pub struct ApiState {
    pub pool: SqlitePool,
    pub bus: EventBus,
    pub token: Arc<RwLock<String>>,
}

impl ApiState {
    pub fn new(pool: SqlitePool, bus: EventBus, token: Arc<RwLock<String>>) -> Self {
        Self { pool, bus, token }
    }
}

/// The public view of the API configuration (sent to the Settings UI).
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ApiConfig {
    pub enabled: bool,
    pub port: u16,
    pub token: String,
}

/// A running server; dropping or calling `stop` triggers graceful shutdown.
pub struct ServerHandle {
    shutdown: Option<oneshot::Sender<()>>,
}

impl ServerHandle {
    pub fn stop(mut self) {
        if let Some(tx) = self.shutdown.take() {
            let _ = tx.send(());
        }
    }
}

/// Read `api.token`, minting and persisting a fresh one on first use.
pub async fn get_or_create_token(pool: &SqlitePool, bus: &EventBus) -> Result<String> {
    if let Some(v) = get_setting(pool, KEY_TOKEN).await? {
        if let Some(s) = v.as_str() {
            if !s.is_empty() {
                return Ok(s.to_string());
            }
        }
    }
    let token = super::repo::new_id().replace('-', "");
    set_setting(pool, bus, KEY_TOKEN, json!(token)).await?;
    Ok(token)
}

/// Replace the token with a fresh value and return it.
pub async fn regenerate_token(pool: &SqlitePool, bus: &EventBus) -> Result<String> {
    let token = super::repo::new_id().replace('-', "");
    set_setting(pool, bus, KEY_TOKEN, json!(token)).await?;
    Ok(token)
}

pub async fn get_port(pool: &SqlitePool) -> Result<u16> {
    Ok(get_setting(pool, KEY_PORT)
        .await?
        .and_then(|v| v.as_u64())
        .map(|n| n as u16)
        .unwrap_or(DEFAULT_PORT))
}

pub async fn is_enabled(pool: &SqlitePool) -> Result<bool> {
    Ok(get_setting(pool, KEY_ENABLED).await?.and_then(|v| v.as_bool()).unwrap_or(false))
}

pub async fn set_enabled_flag(pool: &SqlitePool, bus: &EventBus, enabled: bool) -> Result<()> {
    set_setting(pool, bus, KEY_ENABLED, json!(enabled)).await
}

/// Assemble the full configuration for the Settings UI.
pub async fn config(pool: &SqlitePool, bus: &EventBus) -> Result<ApiConfig> {
    Ok(ApiConfig {
        enabled: is_enabled(pool).await?,
        port: get_port(pool).await?,
        token: get_or_create_token(pool, bus).await?,
    })
}

/// Build the Axum router. `/ping` and `/openapi.json` are public; everything
/// under `/open/v1` requires the bearer token.
pub fn router(state: ApiState) -> Router {
    let shared = Arc::new(state);
    let authed = routes::open_v1_router().route_layer(axum::middleware::from_fn_with_state(
        shared.clone(),
        auth::require_bearer,
    ));
    Router::new()
        .route("/ping", axum::routing::get(routes::ping))
        .route("/openapi.json", axum::routing::get(routes::openapi))
        .merge(authed)
        .with_state(shared)
}

/// Bind `127.0.0.1:port` and serve until the returned handle is stopped.
pub async fn serve(state: ApiState) -> Result<ServerHandle> {
    let port = get_port(&state.pool).await?;
    let listener = tokio::net::TcpListener::bind(("127.0.0.1", port))
        .await
        .map_err(|e| crate::error::RepoError::Invalid(format!("cannot bind API port {port}: {e}")))?;
    let app = router(state);
    let (tx, rx) = oneshot::channel::<()>();
    tokio::spawn(async move {
        let server = axum::serve(listener, app).with_graceful_shutdown(async {
            let _ = rx.await;
        });
        if let Err(e) = server.await {
            log::error!("API server error: {e}");
        }
    });
    Ok(ServerHandle { shutdown: Some(tx) })
}
