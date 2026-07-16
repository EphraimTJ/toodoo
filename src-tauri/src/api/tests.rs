//! Integration test: spin the Axum router over an in-memory DB on an ephemeral
//! port and drive it with a real HTTP client, covering auth + the task lifecycle.

use std::sync::{Arc, RwLock};

use super::{router, ApiState};
use crate::events::EventBus;
use crate::repo::db::connect_in_memory;

const TOKEN: &str = "test-token-123";

/// Bind 127.0.0.1:0, serve the router, and return the base URL.
async fn start() -> String {
    let pool = connect_in_memory().await.unwrap();
    let bus = EventBus::new();
    let state = ApiState::new(pool, bus, Arc::new(RwLock::new(TOKEN.to_string())));
    let listener = tokio::net::TcpListener::bind(("127.0.0.1", 0)).await.unwrap();
    let addr = listener.local_addr().unwrap();
    let app = router(state);
    tokio::spawn(async move {
        axum::serve(listener, app).await.unwrap();
    });
    format!("http://{addr}")
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
