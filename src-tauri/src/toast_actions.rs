//! Toast action-button arguments. A Windows toast button carries an opaque
//! string back through the activation callback; this module owns that string's
//! encoding so the round-trip is pure and unit-testable. `|` is the separator —
//! it cannot appear in UUIDs or RFC3339 timestamps, the only payloads carried.

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ToastAction {
    /// "Complete" button: close the task, carrying the occurrence the toast
    /// was rendered for so the recurring idempotency guard applies.
    Complete { task_id: String, expected_occurrence: Option<String> },
    /// "Snooze Nm" button: reschedule the reminder by the minutes the button
    /// label promised at show time.
    Snooze { reminder_id: String, minutes: i64 },
    /// Body click (no argument) or an unrecognized argument: open the app on
    /// the toast's task (an empty id just focuses the app).
    OpenTask { task_id: String },
    /// "Don't show again" on the close-to-tray notice: persist the dismissal.
    AckTrayNotice,
}

pub fn encode(action: &ToastAction) -> String {
    match action {
        ToastAction::Complete { task_id, expected_occurrence } => {
            format!("complete|{task_id}|{}", expected_occurrence.as_deref().unwrap_or(""))
        }
        ToastAction::Snooze { reminder_id, minutes } => format!("snooze|{reminder_id}|{minutes}"),
        ToastAction::OpenTask { task_id } => format!("open|{task_id}"),
        ToastAction::AckTrayNotice => "traynotice|ack".to_string(),
    }
}

/// Decode an activation argument. `None`/empty (a body click) and anything
/// unparseable fall back to opening the toast's task — a click never gets lost.
pub fn parse(arg: Option<&str>, toast_task_id: &str) -> ToastAction {
    let open = || ToastAction::OpenTask { task_id: toast_task_id.to_string() };
    let Some(arg) = arg.filter(|a| !a.is_empty()) else { return open() };
    let mut parts = arg.splitn(3, '|');
    match (parts.next(), parts.next(), parts.next()) {
        (Some("complete"), Some(task_id), occ) if !task_id.is_empty() => ToastAction::Complete {
            task_id: task_id.to_string(),
            expected_occurrence: occ.filter(|o| !o.is_empty()).map(String::from),
        },
        (Some("snooze"), Some(reminder_id), Some(minutes)) if !reminder_id.is_empty() => {
            ToastAction::Snooze {
                reminder_id: reminder_id.to_string(),
                minutes: minutes.parse().unwrap_or(10),
            }
        }
        (Some("open"), Some(task_id), _) if !task_id.is_empty() => {
            ToastAction::OpenTask { task_id: task_id.to_string() }
        }
        (Some("traynotice"), Some("ack"), _) => ToastAction::AckTrayNotice,
        _ => open(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn complete_round_trips_with_and_without_occurrence() {
        for occ in [Some("2026-07-20T09:00:00.000Z".to_string()), None] {
            let a = ToastAction::Complete { task_id: "t-1".into(), expected_occurrence: occ };
            assert_eq!(parse(Some(&encode(&a)), "fallback"), a);
        }
    }

    #[test]
    fn snooze_round_trips_and_bad_minutes_default_to_ten() {
        let a = ToastAction::Snooze { reminder_id: "r-1".into(), minutes: 30 };
        assert_eq!(parse(Some(&encode(&a)), "fallback"), a);
        assert_eq!(
            parse(Some("snooze|r-1|nonsense"), "fallback"),
            ToastAction::Snooze { reminder_id: "r-1".into(), minutes: 10 }
        );
    }

    #[test]
    fn occurrence_timestamps_survive_their_colons() {
        let a = ToastAction::Complete {
            task_id: "0e5f-42".into(),
            expected_occurrence: Some("2026-03-10T17:30:00.000Z".into()),
        };
        assert_eq!(parse(Some(&encode(&a)), "x"), a);
    }

    #[test]
    fn body_click_and_garbage_open_the_toasts_task() {
        let open = ToastAction::OpenTask { task_id: "task-9".into() };
        assert_eq!(parse(None, "task-9"), open);
        assert_eq!(parse(Some(""), "task-9"), open);
        assert_eq!(parse(Some("wat|"), "task-9"), open);
        assert_eq!(parse(Some("complete||"), "task-9"), open);
    }

    #[test]
    fn open_round_trips() {
        let a = ToastAction::OpenTask { task_id: "t-7".into() };
        assert_eq!(parse(Some(&encode(&a)), "x"), a);
    }

    #[test]
    fn tray_notice_ack_round_trips() {
        assert_eq!(parse(Some(&encode(&ToastAction::AckTrayNotice)), ""), ToastAction::AckTrayNotice);
    }
}
