use serde::Serialize;
use tokio::sync::broadcast;

/// Every repository mutation emits one of these on the in-process bus.
/// Consumers: the webview (live UI updates), and later the stats engine,
/// activity log, and scheduler.
#[derive(Debug, Clone, Serialize)]
#[serde(tag = "type", content = "payload")]
pub enum DomainEvent {
    #[serde(rename = "project.created")]
    ProjectCreated { id: String },
    #[serde(rename = "project.updated")]
    ProjectUpdated { id: String },
    #[serde(rename = "project.deleted")]
    ProjectDeleted { id: String },
    #[serde(rename = "folder.created")]
    FolderCreated { id: String },
    #[serde(rename = "folder.updated")]
    FolderUpdated { id: String },
    #[serde(rename = "folder.deleted")]
    FolderDeleted { id: String },
    #[serde(rename = "task.created")]
    TaskCreated { id: String },
    #[serde(rename = "task.updated")]
    TaskUpdated { id: String },
    #[serde(rename = "task.completed")]
    TaskCompleted { ids: Vec<String> },
    #[serde(rename = "task.trashed")]
    TaskTrashed { ids: Vec<String> },
    #[serde(rename = "task.restored")]
    TaskRestored { id: String },
    #[serde(rename = "task.deleted")]
    TaskDeleted { id: String },
    #[serde(rename = "task.moved")]
    TaskMoved { id: String },
    #[serde(rename = "checkitem.changed")]
    CheckItemChanged { task_id: String },
    #[serde(rename = "tag.created")]
    TagCreated { id: String },
    #[serde(rename = "tag.updated")]
    TagUpdated { id: String },
    #[serde(rename = "tag.deleted")]
    TagDeleted { id: String },
    #[serde(rename = "task.tags_changed")]
    TaskTagsChanged { task_id: String },
    #[serde(rename = "task.pinned")]
    TaskPinned { id: String },
    #[serde(rename = "reminder.changed")]
    ReminderChanged { task_id: String },
    #[serde(rename = "reminder.fired")]
    ReminderFired { task_id: String, reminder_id: String },
    #[serde(rename = "template.changed")]
    TemplateChanged,
    #[serde(rename = "section.changed")]
    SectionChanged { project_id: String },
    #[serde(rename = "filter.changed")]
    FilterChanged,
    #[serde(rename = "matrix.changed")]
    MatrixChanged,
    #[serde(rename = "calendar.changed")]
    CalendarChanged,
    #[serde(rename = "subscription.changed")]
    SubscriptionChanged,
    #[serde(rename = "focus.changed")]
    FocusChanged,
    #[serde(rename = "habit.changed")]
    HabitChanged,
    #[serde(rename = "habit.checkin_changed")]
    HabitCheckinChanged { habit_id: String },
    #[serde(rename = "countdown.changed")]
    CountdownChanged,
    #[serde(rename = "sticky.changed")]
    StickyChanged,
    #[serde(rename = "seed.completed")]
    SeedCompleted,
    #[serde(rename = "setting.changed")]
    SettingChanged { key: String },
    #[serde(rename = "savedsearch.changed")]
    SavedSearchChanged,
}

#[derive(Clone)]
pub struct EventBus {
    tx: broadcast::Sender<DomainEvent>,
}

impl EventBus {
    pub fn new() -> Self {
        let (tx, _) = broadcast::channel(256);
        Self { tx }
    }

    pub fn subscribe(&self) -> broadcast::Receiver<DomainEvent> {
        self.tx.subscribe()
    }

    /// Fire-and-forget: an event with no live subscribers is not an error.
    pub fn emit(&self, event: DomainEvent) {
        let _ = self.tx.send(event);
    }
}

impl Default for EventBus {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn delivers_events_to_subscribers() {
        let bus = EventBus::new();
        let mut rx = bus.subscribe();
        bus.emit(DomainEvent::ProjectCreated { id: "p1".into() });
        let got = rx.recv().await.expect("event delivered");
        match got {
            DomainEvent::ProjectCreated { id } => assert_eq!(id, "p1"),
            other => panic!("unexpected event: {other:?}"),
        }
    }

    #[tokio::test]
    async fn emit_without_subscribers_does_not_panic() {
        let bus = EventBus::new();
        bus.emit(DomainEvent::SettingChanged { key: "theme".into() });
    }
}
