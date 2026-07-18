//! Bearer-token check for the local REST API. The comparison (`bearer_ok`) is
//! pure and unit-tested; `require_bearer` is the Axum middleware wrapping it.

use std::sync::Arc;

use axum::{
    extract::{Request, State},
    http::{header::AUTHORIZATION, StatusCode},
    middleware::Next,
    response::{IntoResponse, Response},
    Json,
};
use serde_json::json;

use super::ApiState;

/// Reject any request to a guarded route without a valid `Authorization: Bearer`.
pub async fn require_bearer(
    State(state): State<Arc<ApiState>>,
    req: Request,
    next: Next,
) -> Response {
    let header = req.headers().get(AUTHORIZATION).and_then(|v| v.to_str().ok());
    let ok = {
        let token = state.token.read().unwrap();
        bearer_ok(header, &token)
    };
    if ok {
        next.run(req).await
    } else {
        (StatusCode::UNAUTHORIZED, Json(json!({ "error": "unauthorized" }))).into_response()
    }
}

/// True iff `header` is exactly `Bearer <token>` for the configured `token`.
/// Rejects an empty configured token so a blank setting can't authorize anyone.
/// Uses a length-then-bytewise compare that doesn't short-circuit on the first
/// mismatched byte.
pub fn bearer_ok(header: Option<&str>, token: &str) -> bool {
    if token.is_empty() {
        return false;
    }
    let Some(value) = header else { return false };
    let Some(presented) = value.strip_prefix("Bearer ") else { return false };
    constant_eq(presented.as_bytes(), token.as_bytes())
}

fn constant_eq(a: &[u8], b: &[u8]) -> bool {
    if a.len() != b.len() {
        return false;
    }
    let mut diff = 0u8;
    for (x, y) in a.iter().zip(b.iter()) {
        diff |= x ^ y;
    }
    diff == 0
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn missing_header_is_rejected() {
        assert!(!bearer_ok(None, "secret"));
    }

    #[test]
    fn wrong_token_or_scheme_is_rejected() {
        assert!(!bearer_ok(Some("Bearer nope"), "secret"));
        assert!(!bearer_ok(Some("secret"), "secret")); // missing "Bearer "
        assert!(!bearer_ok(Some("Basic secret"), "secret"));
    }

    #[test]
    fn correct_token_is_accepted() {
        assert!(bearer_ok(Some("Bearer secret"), "secret"));
    }

    #[test]
    fn empty_configured_token_never_authorizes() {
        assert!(!bearer_ok(Some("Bearer "), ""));
        assert!(!bearer_ok(None, ""));
    }
}
