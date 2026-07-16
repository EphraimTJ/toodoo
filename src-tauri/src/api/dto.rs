//! TickTick-Open-API ⇄ Toodoo mapping. Pure and unit-tested — this is the
//! trickiest part of the REST layer, so the field/enum/date mapping is pinned
//! by tests. `priority` is already stored as TickTick's 0/1/3/5
//! (docs/decisions.md 2026-07-14), so it passes through unchanged.

use serde_json::{json, Value};

use crate::repo::tasks::{NewTask, Task, TaskPatch};

const STATUS_COMPLETED: i64 = 2;
const STATUS_NORMAL: i64 = 0;

/// Serialize a Toodoo task into TickTick Open-API task JSON.
pub fn task_to_ticktick(t: &Task) -> Value {
    json!({
        "id": t.id,
        "projectId": t.project_id,
        "title": t.title,
        "content": t.content_plain,
        "priority": t.priority,
        "status": if t.status == "COMPLETED" { STATUS_COMPLETED } else { STATUS_NORMAL },
        "startDate": t.start_at,
        "dueDate": t.due_at,
        "isAllDay": t.is_all_day,
        "completedTime": t.completed_at,
    })
}

fn str_field(v: &Value, key: &str) -> Option<String> {
    v.get(key).and_then(|x| x.as_str()).map(|s| s.to_string())
}

/// Build a `NewTask` from a TickTick task payload (for `POST /open/v1/task`).
/// Falls back to the Inbox and an empty title when those are omitted.
pub fn new_task_from_ticktick(v: &Value) -> NewTask {
    NewTask {
        project_id: str_field(v, "projectId").unwrap_or_else(|| "inbox".to_string()),
        parent_id: None,
        title: str_field(v, "title").unwrap_or_default(),
        priority: v.get("priority").and_then(|x| x.as_i64()),
        start_at: str_field(v, "startDate"),
        due_at: str_field(v, "dueDate"),
        is_all_day: v.get("isAllDay").and_then(|x| x.as_bool()),
        duration_min: None,
        time_zone: None,
        rrule: None,
        repeat_from: None,
        kind: None,
    }
}

/// Build a `TaskPatch` from a TickTick task payload (for `POST /open/v1/task/{id}`).
/// A present key is applied; an absent key is left unchanged. Nullable fields use
/// `Some(None)` to clear when the payload carries an explicit JSON `null`.
pub fn patch_from_ticktick(v: &Value) -> TaskPatch {
    let nullable_str = |key: &str| -> Option<Option<String>> {
        v.get(key).map(|x| x.as_str().map(|s| s.to_string()))
    };
    TaskPatch {
        title: str_field(v, "title"),
        content_plain: nullable_str("content"),
        content_rich: None,
        priority: v.get("priority").and_then(|x| x.as_i64()),
        start_at: nullable_str("startDate"),
        due_at: nullable_str("dueDate"),
        is_all_day: v.get("isAllDay").and_then(|x| x.as_bool()),
        section_id: None,
        duration_min: None,
        time_zone: None,
        rrule: None,
        repeat_from: None,
        est_pomos: None,
        est_duration_min: None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn sample_task() -> Task {
        Task {
            id: "t1".into(),
            project_id: "inbox".into(),
            section_id: None,
            parent_id: None,
            title: "Write report".into(),
            content_rich: None,
            content_plain: Some("with charts".into()),
            kind: "TASK".into(),
            status: "ACTIVE".into(),
            priority: 5,
            start_at: None,
            due_at: Some("2026-03-10T09:00:00.000Z".into()),
            is_all_day: false,
            duration_min: None,
            time_zone: None,
            rrule: None,
            repeat_from: None,
            pinned: false,
            est_pomos: None,
            est_duration_min: None,
            sort_order: Some(1024),
            completed_at: None,
            created_at: "2026-03-01T00:00:00.000Z".into(),
            updated_at: "2026-03-01T00:00:00.000Z".into(),
            tag_ids: vec![],
        }
    }

    #[test]
    fn task_to_ticktick_maps_fields_and_status() {
        let v = task_to_ticktick(&sample_task());
        assert_eq!(v["id"], "t1");
        assert_eq!(v["projectId"], "inbox");
        assert_eq!(v["title"], "Write report");
        assert_eq!(v["content"], "with charts");
        assert_eq!(v["priority"], 5);
        assert_eq!(v["status"], 0); // ACTIVE
        assert_eq!(v["dueDate"], "2026-03-10T09:00:00.000Z"); // date passthrough
        assert_eq!(v["isAllDay"], false);
    }

    #[test]
    fn completed_task_maps_to_status_2() {
        let mut t = sample_task();
        t.status = "COMPLETED".into();
        t.completed_at = Some("2026-03-10T10:00:00.000Z".into());
        let v = task_to_ticktick(&t);
        assert_eq!(v["status"], 2);
        assert_eq!(v["completedTime"], "2026-03-10T10:00:00.000Z");
    }

    #[test]
    fn new_task_from_ticktick_reads_fields_with_defaults() {
        let nt = new_task_from_ticktick(&json!({
            "projectId": "work",
            "title": "Ship it",
            "priority": 3,
            "dueDate": "2026-04-01T00:00:00.000Z",
            "isAllDay": true,
        }));
        assert_eq!(nt.project_id, "work");
        assert_eq!(nt.title, "Ship it");
        assert_eq!(nt.priority, Some(3));
        assert_eq!(nt.due_at.as_deref(), Some("2026-04-01T00:00:00.000Z"));
        assert_eq!(nt.is_all_day, Some(true));

        // Omitted projectId/title fall back to Inbox / empty.
        let bare = new_task_from_ticktick(&json!({}));
        assert_eq!(bare.project_id, "inbox");
        assert_eq!(bare.title, "");
        assert_eq!(bare.priority, None);
    }

    #[test]
    fn patch_from_ticktick_applies_present_keys_only() {
        // Only title present → other fields stay None (unchanged).
        let p = patch_from_ticktick(&json!({ "title": "Renamed" }));
        assert_eq!(p.title.as_deref(), Some("Renamed"));
        assert!(p.due_at.is_none());
        assert!(p.priority.is_none());

        // Explicit null clears the due date.
        let cleared = patch_from_ticktick(&json!({ "dueDate": null }));
        assert_eq!(cleared.due_at, Some(None));

        // A value sets it.
        let set = patch_from_ticktick(&json!({ "dueDate": "2026-05-01T00:00:00.000Z" }));
        assert_eq!(set.due_at, Some(Some("2026-05-01T00:00:00.000Z".to_string())));
    }
}
