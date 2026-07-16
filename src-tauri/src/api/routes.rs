//! REST handlers. Each delegates to the repository layer and maps results into
//! TickTick-Open-API-shaped JSON (see `dto`). Errors become HTTP status codes.

use std::sync::Arc;

use axum::{
    extract::{Path, State},
    http::StatusCode,
    response::{IntoResponse, Response},
    routing::{get, post},
    Json, Router,
};
use serde_json::{json, Value};

use super::dto::{new_task_from_ticktick, patch_from_ticktick, task_to_ticktick};
use super::ApiState;
use crate::error::RepoError;
use crate::repo;
use crate::repo::projects::Project;
use crate::repo::tasks::Task;

/// Handler error → HTTP status + `{ "error": msg }` body.
pub struct ApiError(StatusCode, String);

impl IntoResponse for ApiError {
    fn into_response(self) -> Response {
        (self.0, Json(json!({ "error": self.1 }))).into_response()
    }
}

impl From<RepoError> for ApiError {
    fn from(e: RepoError) -> Self {
        let code = match &e {
            RepoError::NotFound(_) => StatusCode::NOT_FOUND,
            RepoError::Invalid(_) => StatusCode::BAD_REQUEST,
            _ => StatusCode::INTERNAL_SERVER_ERROR,
        };
        ApiError(code, e.to_string())
    }
}

type ApiResult = std::result::Result<Json<Value>, ApiError>;

/// Routes under `/open/v1` — all bearer-guarded by the caller's middleware.
pub fn open_v1_router() -> Router<Arc<ApiState>> {
    Router::new()
        .route("/open/v1/project", get(list_projects))
        .route("/open/v1/project/:id/data", get(project_data))
        .route("/open/v1/task", post(create_task))
        .route("/open/v1/task/:id", post(update_task))
        .route("/open/v1/project/:pid/task/:tid/complete", post(complete_task))
        .route("/open/v1/project/:pid/task/:tid", axum::routing::delete(delete_task))
        .route("/open/v1/toodoo/habits", get(ext_habits))
        .route("/open/v1/toodoo/focus/stats", get(ext_focus_stats))
        .route("/open/v1/toodoo/filters", get(ext_filters))
}

// ---- public (unauthenticated) ----------------------------------------------

pub async fn ping() -> Json<Value> {
    Json(json!({ "ok": true, "app": "toodoo" }))
}

pub async fn openapi() -> Json<Value> {
    Json(openapi_spec())
}

// ---- TickTick-compatible mapping helpers ------------------------------------

fn project_to_ticktick(p: &Project) -> Value {
    json!({
        "id": p.id,
        "name": p.name,
        "color": p.color,
        "kind": p.kind,
        "closed": p.closed,
        "viewMode": p.view_mode,
    })
}

fn tasks_json(tasks: &[Task]) -> Vec<Value> {
    tasks.iter().map(task_to_ticktick).collect()
}

// ---- handlers ---------------------------------------------------------------

async fn list_projects(State(s): State<Arc<ApiState>>) -> ApiResult {
    let projects = repo::projects::list_projects(&s.pool).await?;
    Ok(Json(json!(projects.iter().map(project_to_ticktick).collect::<Vec<_>>())))
}

async fn project_data(State(s): State<Arc<ApiState>>, Path(id): Path<String>) -> ApiResult {
    let project = repo::projects::get_project(&s.pool, &id).await?;
    let tasks = repo::tasks::list_project_tasks(&s.pool, &id).await?;
    Ok(Json(json!({
        "project": project_to_ticktick(&project),
        "tasks": tasks_json(&tasks),
        "columns": [],
    })))
}

async fn create_task(State(s): State<Arc<ApiState>>, Json(body): Json<Value>) -> ApiResult {
    let task = repo::tasks::create_task(&s.pool, &s.bus, new_task_from_ticktick(&body)).await?;
    Ok(Json(task_to_ticktick(&task)))
}

async fn update_task(
    State(s): State<Arc<ApiState>>,
    Path(id): Path<String>,
    Json(body): Json<Value>,
) -> ApiResult {
    let task = repo::tasks::update_task(&s.pool, &s.bus, &id, patch_from_ticktick(&body)).await?;
    Ok(Json(task_to_ticktick(&task)))
}

async fn complete_task(
    State(s): State<Arc<ApiState>>,
    Path((_pid, tid)): Path<(String, String)>,
) -> ApiResult {
    // The API has no client timezone; score against UTC day (tz offset 0).
    repo::tasks::complete_task(&s.pool, &s.bus, &tid, 0).await?;
    Ok(Json(json!({ "ok": true })))
}

async fn delete_task(
    State(s): State<Arc<ApiState>>,
    Path((_pid, tid)): Path<(String, String)>,
) -> ApiResult {
    repo::tasks::delete_task_forever(&s.pool, &s.bus, &tid).await?;
    Ok(Json(json!({ "ok": true })))
}

// ---- Toodoo extensions ------------------------------------------------------

async fn ext_habits(State(s): State<Arc<ApiState>>) -> ApiResult {
    let habits = repo::habits::list_habits(&s.pool, false).await?;
    Ok(Json(json!(habits)))
}

async fn ext_focus_stats(State(s): State<Arc<ApiState>>) -> ApiResult {
    // Last 30 days, UTC.
    let to = chrono::Utc::now();
    let from = to - chrono::Duration::days(30);
    let fmt = |d: chrono::DateTime<chrono::Utc>| {
        d.to_rfc3339_opts(chrono::SecondsFormat::Millis, true)
    };
    let stats = repo::focus::focus_stats(&s.pool, &fmt(from), &fmt(to), 0).await?;
    Ok(Json(json!(stats)))
}

async fn ext_filters(State(s): State<Arc<ApiState>>) -> ApiResult {
    let filters = repo::filters::list_filters(&s.pool).await?;
    Ok(Json(json!(filters)))
}

// ---- OpenAPI (hand-authored, no proc-macro dependency) ----------------------

fn openapi_spec() -> Value {
    let ok = json!({ "description": "OK" });
    let path = |summary: &str| json!({ "summary": summary, "responses": { "200": ok } });
    json!({
        "openapi": "3.0.0",
        "info": { "title": "Toodoo Local API", "version": "1.0.0",
                  "description": "TickTick-Open-API-compatible local REST API. Bearer-token auth on /open/v1." },
        "servers": [{ "url": "http://127.0.0.1:7420" }],
        "components": {
            "securitySchemes": { "bearerAuth": { "type": "http", "scheme": "bearer" } }
        },
        "security": [{ "bearerAuth": [] }],
        "paths": {
            "/ping": { "get": { "summary": "Health check (no auth)", "security": [], "responses": { "200": ok } } },
            "/open/v1/project": { "get": path("List projects") },
            "/open/v1/project/{id}/data": { "get": path("Project with its tasks") },
            "/open/v1/task": { "post": path("Create a task") },
            "/open/v1/task/{id}": { "post": path("Update a task") },
            "/open/v1/project/{projectId}/task/{taskId}/complete": { "post": path("Complete a task") },
            "/open/v1/project/{projectId}/task/{taskId}": { "delete": path("Delete a task") },
            "/open/v1/toodoo/habits": { "get": path("List habits (Toodoo extension)") },
            "/open/v1/toodoo/focus/stats": { "get": path("Focus stats, last 30 days (Toodoo extension)") },
            "/open/v1/toodoo/filters": { "get": path("List custom filters (Toodoo extension)") }
        }
    })
}
