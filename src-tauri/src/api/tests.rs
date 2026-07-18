//! Integration test: spin the Axum router over an in-memory DB on an ephemeral
//! port and drive it with a real HTTP client, covering auth + the task lifecycle.

use std::sync::{Arc, RwLock};

use super::{router, ApiState};
use crate::events::EventBus;
use crate::repo::db::connect_in_memory;

const TOKEN: &str = "test-token-123";

/// Bind 127.0.0.1:0, serve the router, and return the base URL plus the
/// backing pool/bus so tests can seed state the API doesn't expose.
async fn start_with_state() -> (String, sqlx::SqlitePool, EventBus) {
    let pool = connect_in_memory().await.unwrap();
    let bus = EventBus::new();
    let state = ApiState::new(pool.clone(), bus.clone(), Arc::new(RwLock::new(TOKEN.to_string())));
    let listener = tokio::net::TcpListener::bind(("127.0.0.1", 0)).await.unwrap();
    let addr = listener.local_addr().unwrap();
    let app = router(state);
    tokio::spawn(async move {
        axum::serve(listener, app).await.unwrap();
    });
    (format!("http://{addr}"), pool, bus)
}

async fn start() -> String {
    start_with_state().await.0
}

#[tokio::test]
async fn ping_is_public() {
    let base = start().await;
    let r = reqwest::get(format!("{base}/ping")).await.unwrap();
    assert_eq!(r.status(), 200);
    assert_eq!(r.json::<serde_json::Value>().await.unwrap()["ok"], true);
}

#[tokio::test]
async fn open_v1_requires_bearer() {
    let base = start().await;
    let client = reqwest::Client::new();

    // No token → 401.
    let r = client.get(format!("{base}/open/v1/project")).send().await.unwrap();
    assert_eq!(r.status(), 401);

    // Wrong token → 401.
    let r = client
        .get(format!("{base}/open/v1/project"))
        .bearer_auth("nope")
        .send()
        .await
        .unwrap();
    assert_eq!(r.status(), 401);

    // Correct token → 200 and the seeded Inbox is present.
    let r = client
        .get(format!("{base}/open/v1/project"))
        .bearer_auth(TOKEN)
        .send()
        .await
        .unwrap();
    assert_eq!(r.status(), 200);
    let projects: serde_json::Value = r.json().await.unwrap();
    assert!(projects.as_array().unwrap().iter().any(|p| p["id"] == "inbox"));
}

#[tokio::test]
async fn task_lifecycle_create_complete_delete() {
    let base = start().await;
    let client = reqwest::Client::new();
    let auth = |rb: reqwest::RequestBuilder| rb.bearer_auth(TOKEN);

    // Create.
    let created: serde_json::Value = auth(client.post(format!("{base}/open/v1/task")))
        .json(&serde_json::json!({ "projectId": "inbox", "title": "From API", "priority": 3 }))
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap();
    let id = created["id"].as_str().unwrap().to_string();
    assert_eq!(created["title"], "From API");
    assert_eq!(created["priority"], 3);
    assert_eq!(created["status"], 0);

    // It shows up in project data.
    let data: serde_json::Value = auth(client.get(format!("{base}/open/v1/project/inbox/data")))
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap();
    let find = |data: &serde_json::Value| -> Option<serde_json::Value> {
        data["tasks"].as_array().unwrap().iter().find(|t| t["id"] == id.as_str()).cloned()
    };
    assert!(find(&data).is_some());

    // Complete → status flips to 2.
    let r = auth(client.post(format!("{base}/open/v1/project/inbox/task/{id}/complete")))
        .send()
        .await
        .unwrap();
    assert_eq!(r.status(), 200);
    let data: serde_json::Value = auth(client.get(format!("{base}/open/v1/project/inbox/data")))
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap();
    assert_eq!(find(&data).unwrap()["status"], 2);

    // Delete → gone.
    let r = auth(client.delete(format!("{base}/open/v1/project/inbox/task/{id}")))
        .send()
        .await
        .unwrap();
    assert_eq!(r.status(), 200);
    let data: serde_json::Value = auth(client.get(format!("{base}/open/v1/project/inbox/data")))
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap();
    assert!(find(&data).is_none());
}

/// Adversarial-review follow-up: completing a RECURRING task over REST requires
/// the occurrence key, and retrying the identical request must not advance the
/// series a second time. Non-recurring completion stays keyless (covered by
/// `task_lifecycle_create_complete_delete` above).
#[tokio::test]
async fn recurring_completion_requires_and_honors_occurrence_key() {
    use crate::repo::tasks::{create_task, get_task, tests::quick, NewTask};

    let (base, pool, bus) = start_with_state().await;
    let client = reqwest::Client::new();
    let auth = |rb: reqwest::RequestBuilder| rb.bearer_auth(TOKEN);

    let task = create_task(
        &pool,
        &bus,
        NewTask {
            due_at: Some("2026-07-01T00:00:00.000Z".into()),
            rrule: Some("FREQ=DAILY".into()),
            ..quick("inbox", "Water plants")
        },
    )
    .await
    .unwrap();
    let url = format!("{base}/open/v1/project/inbox/task/{}/complete", task.id);

    // Keyless → 409 carrying the current occurrence so the client can confirm.
    let r = auth(client.post(&url)).send().await.unwrap();
    assert_eq!(r.status(), 409);
    let body: serde_json::Value = r.json().await.unwrap();
    let occ = body["expectedOccurrence"].as_str().unwrap().to_string();
    assert_eq!(occ, "2026-07-01T00:00:00.000Z");

    // With the key → 200 and the series advances one day.
    let r = auth(client.post(&url))
        .json(&serde_json::json!({ "expectedOccurrence": occ }))
        .send()
        .await
        .unwrap();
    assert_eq!(r.status(), 200);
    let advanced = get_task(&pool, &task.id).await.unwrap();
    assert_eq!(advanced.due_at.as_deref(), Some("2026-07-02T00:00:00.000Z"));
    assert_eq!(advanced.status, "ACTIVE");

    // The identical retry (lost-response replay) → 200 but a safe no-op:
    // no second advance, no extra ledger row.
    let r = auth(client.post(&url))
        .json(&serde_json::json!({ "expectedOccurrence": occ }))
        .send()
        .await
        .unwrap();
    assert_eq!(r.status(), 200);
    let after = get_task(&pool, &task.id).await.unwrap();
    assert_eq!(after.due_at.as_deref(), Some("2026-07-02T00:00:00.000Z"));
    let completions: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM task_completions WHERE task_id = ? AND deleted_at IS NULL",
    )
    .bind(&task.id)
    .fetch_one(&pool)
    .await
    .unwrap();
    assert_eq!(completions, 1);

    // The query-param form works too (still the same occurrence → no-op).
    let r = auth(client.post(format!("{url}?expectedOccurrence={occ}"))).send().await.unwrap();
    assert_eq!(r.status(), 200);
    assert_eq!(get_task(&pool, &task.id).await.unwrap().due_at.as_deref(), Some("2026-07-02T00:00:00.000Z"));
}
