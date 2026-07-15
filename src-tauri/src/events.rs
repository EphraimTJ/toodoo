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
    #[serde(rename = "project.deleted")]
    ProjectDeleted { id: String },
    #[serde(rename = "setting.changed")]
    SettingChanged { key: String },
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
