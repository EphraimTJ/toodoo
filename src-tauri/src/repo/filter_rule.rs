//! The shared rule model behind Custom Filters and the Eisenhower Matrix. A
//! `Rule` is a flat list of conditions combined with All (AND) or Any (OR); it
//! serializes to the `rule_json` stored on `filters` and `matrix_config`.
//!
//! `evaluate` is pure (no DB) so it is exhaustively unit-testable; the repo
//! layer fetches candidate tasks and filters them through it. Date conditions
//! reuse the same "effective date" notion as `tasks::list_smart` (due→start,
//! all-day by calendar date, timed by the observer's local date).

use chrono::{DateTime, Duration, NaiveDate, Utc};
use serde::{Deserialize, Serialize};

use super::tasks::Task;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum Match {
    All,
    Any,
}

/// Due-date predicates. `Next7` mirrors the Next 7 Days smart list (anything due
/// on or before today+6, overdue included); `Overdue` is strictly before today.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum DueOp {
    Overdue,
    Today,
    Tomorrow,
    Next7,
    None,
    Range {
        from: Option<String>,
        to: Option<String>,
    },
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "field", rename_all = "camelCase")]
pub enum Condition {
    List { ids: Vec<String> },
    Tag { ids: Vec<String> },
    Priority { values: Vec<i64> },
    Due { op: DueOp },
    Keyword { text: String },
    Kind { values: Vec<String> },
    Status { values: Vec<String> },
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Rule {
    #[serde(rename = "match")]
    pub match_: Match,
    pub conditions: Vec<Condition>,
}

impl Rule {
    pub fn all(conditions: Vec<Condition>) -> Self {
        Rule { match_: Match::All, conditions }
    }
}

/// The task's effective local date (YYYY-MM-DD), or None if it has no date.
/// All-day tasks compare by their stored calendar date; timed tasks shift into
/// the observer's timezone via `tz_off_min`.
fn eff_local_date(task: &Task, tz_off_min: i32) -> Option<String> {
    let base = task.due_at.as_deref().or(task.start_at.as_deref())?;
    if task.is_all_day {
        return Some(base.get(0..10)?.to_string());
    }
    let dt = DateTime::parse_from_rfc3339(base).ok()?.with_timezone(&Utc);
    let local = dt + Duration::minutes(tz_off_min as i64);
    Some(local.format("%Y-%m-%d").to_string())
}

fn add_days(date: &str, days: i64) -> Option<String> {
    let d = NaiveDate::parse_from_str(date, "%Y-%m-%d").ok()?;
    Some((d + Duration::days(days)).format("%Y-%m-%d").to_string())
}

fn eval_due(op: &DueOp, task: &Task, today: &str, tz_off_min: i32) -> bool {
    let eff = eff_local_date(task, tz_off_min);
    match op {
        DueOp::None => eff.is_none(),
        DueOp::Overdue => eff.is_some_and(|e| e.as_str() < today),
        DueOp::Today => eff.as_deref() == Some(today),
        DueOp::Tomorrow => match add_days(today, 1) {
            Some(t) => eff.as_deref() == Some(t.as_str()),
            None => false,
        },
        DueOp::Next7 => match add_days(today, 6) {
            Some(limit) => eff.is_some_and(|e| e.as_str() <= limit.as_str()),
            None => false,
        },
        DueOp::Range { from, to } => match eff {
            None => false,
            Some(e) => {
                from.as_deref().is_none_or(|f| e.as_str() >= f)
                    && to.as_deref().is_none_or(|t| e.as_str() <= t)
            }
        },
    }
}

fn eval_condition(cond: &Condition, task: &Task, today: &str, tz_off_min: i32) -> bool {
    match cond {
        Condition::List { ids } => ids.iter().any(|id| id == &task.project_id),
        Condition::Tag { ids } => ids.iter().any(|id| task.tag_ids.contains(id)),
        Condition::Priority { values } => values.contains(&task.priority),
        Condition::Due { op } => eval_due(op, task, today, tz_off_min),
        Condition::Keyword { text } => {
            let needle = text.to_lowercase();
            if needle.is_empty() {
                return true;
            }
            task.title.to_lowercase().contains(&needle)
                || task
                    .content_plain
                    .as_deref()
                    .is_some_and(|c| c.to_lowercase().contains(&needle))
        }
        Condition::Kind { values } => values.iter().any(|v| v == &task.kind),
        Condition::Status { values } => values.iter().any(|v| v == &task.status),
    }
}

/// Does `task` satisfy `rule`? An empty rule matches every task (no constraint).
pub fn evaluate(rule: &Rule, task: &Task, today: &str, tz_off_min: i32) -> bool {
    if rule.conditions.is_empty() {
        return true;
    }
    let mut results = rule
        .conditions
        .iter()
        .map(|c| eval_condition(c, task, today, tz_off_min));
    match rule.match_ {
        Match::All => results.all(|r| r),
        Match::Any => results.any(|r| r),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const TODAY: &str = "2026-07-15";

    /// Minimal ACTIVE task; override fields per test.
    fn task() -> Task {
        Task {
            id: "t1".into(),
            project_id: "inbox".into(),
            section_id: None,
            parent_id: None,
            title: "Buy oat milk".into(),
            content_rich: None,
            content_plain: Some("from the corner store".into()),
            kind: "TASK".into(),
            status: "ACTIVE".into(),
            priority: 0,
            start_at: None,
            due_at: None,
            is_all_day: true,
            duration_min: None,
            time_zone: None,
            rrule: None,
            repeat_from: None,
            pinned: false,
            est_pomos: None,
            est_duration_min: None,
            sort_order: None,
            completed_at: None,
            created_at: "2026-07-01T00:00:00.000Z".into(),
            updated_at: "2026-07-01T00:00:00.000Z".into(),
            tag_ids: vec![],
        }
    }

    fn ev(rule: &Rule, task: &Task) -> bool {
        evaluate(rule, task, TODAY, 0)
    }

    #[test]
    fn empty_rule_matches_everything() {
        assert!(ev(&Rule::all(vec![]), &task()));
        assert!(ev(&Rule { match_: Match::Any, conditions: vec![] }, &task()));
    }

    #[test]
    fn all_requires_every_condition_any_requires_one() {
        let mut t = task();
        t.priority = 5;
        t.project_id = "work".into();
        let conds = vec![
            Condition::Priority { values: vec![5] },
            Condition::List { ids: vec!["home".into()] }, // false
        ];
        assert!(!ev(&Rule::all(conds.clone()), &t));
        assert!(ev(&Rule { match_: Match::Any, conditions: conds }, &t));
    }

    #[test]
    fn priority_and_list_membership() {
        let mut t = task();
        t.priority = 3;
        t.project_id = "work".into();
        assert!(ev(&Rule::all(vec![Condition::Priority { values: vec![1, 3] }]), &t));
        assert!(!ev(&Rule::all(vec![Condition::Priority { values: vec![5] }]), &t));
        assert!(ev(&Rule::all(vec![Condition::List { ids: vec!["work".into()] }]), &t));
    }

    #[test]
    fn tag_matches_any_of() {
        let mut t = task();
        t.tag_ids = vec!["a".into(), "b".into()];
        assert!(ev(&Rule::all(vec![Condition::Tag { ids: vec!["b".into(), "z".into()] }]), &t));
        assert!(!ev(&Rule::all(vec![Condition::Tag { ids: vec!["z".into()] }]), &t));
    }

    #[test]
    fn keyword_is_case_insensitive_over_title_and_notes() {
        let t = task();
        assert!(ev(&Rule::all(vec![Condition::Keyword { text: "OAT".into() }]), &t));
        assert!(ev(&Rule::all(vec![Condition::Keyword { text: "corner".into() }]), &t));
        assert!(!ev(&Rule::all(vec![Condition::Keyword { text: "almond".into() }]), &t));
    }

    #[test]
    fn due_ops_overdue_today_tomorrow_next7_none() {
        let none = task(); // no dates
        assert!(ev(&Rule::all(vec![Condition::Due { op: DueOp::None }]), &none));

        let mut overdue = task();
        overdue.due_at = Some("2026-07-10T00:00:00.000Z".into());
        assert!(ev(&Rule::all(vec![Condition::Due { op: DueOp::Overdue }]), &overdue));
        assert!(ev(&Rule::all(vec![Condition::Due { op: DueOp::Next7 }]), &overdue));

        let mut today = task();
        today.due_at = Some("2026-07-15T00:00:00.000Z".into());
        assert!(ev(&Rule::all(vec![Condition::Due { op: DueOp::Today }]), &today));

        let mut tomorrow = task();
        tomorrow.due_at = Some("2026-07-16T00:00:00.000Z".into());
        assert!(ev(&Rule::all(vec![Condition::Due { op: DueOp::Tomorrow }]), &tomorrow));

        let mut far = task();
        far.due_at = Some("2026-07-30T00:00:00.000Z".into());
        assert!(!ev(&Rule::all(vec![Condition::Due { op: DueOp::Next7 }]), &far));
    }

    #[test]
    fn due_range_inclusive_bounds() {
        let mut t = task();
        t.due_at = Some("2026-07-20T00:00:00.000Z".into());
        let range = |from, to| {
            Condition::Due {
                op: DueOp::Range {
                    from: Some(String::from(from)),
                    to: Some(String::from(to)),
                },
            }
        };
        assert!(ev(&Rule::all(vec![range("2026-07-01", "2026-07-31")]), &t));
        assert!(!ev(&Rule::all(vec![range("2026-07-21", "2026-07-31")]), &t));
    }

    #[test]
    fn timed_due_uses_observer_timezone() {
        // 23:30Z on the 15th is 01:30 on the 16th at UTC+2 → Tomorrow there.
        let mut t = task();
        t.is_all_day = false;
        t.due_at = Some("2026-07-15T23:30:00.000Z".into());
        assert!(evaluate(&Rule::all(vec![Condition::Due { op: DueOp::Today }]), &t, TODAY, 0));
        assert!(evaluate(
            &Rule::all(vec![Condition::Due { op: DueOp::Tomorrow }]),
            &t,
            TODAY,
            120
        ));
    }

    #[test]
    fn kind_and_status_membership() {
        let mut note = task();
        note.kind = "NOTE".into();
        note.status = "WONT_DO".into();
        assert!(ev(&Rule::all(vec![Condition::Kind { values: vec!["NOTE".into()] }]), &note));
        assert!(!ev(&Rule::all(vec![Condition::Kind { values: vec!["TASK".into()] }]), &note));
        assert!(ev(
            &Rule::all(vec![Condition::Status { values: vec!["WONT_DO".into(), "ACTIVE".into()] }]),
            &note
        ));
    }

    #[test]
    fn round_trips_through_json() {
        let rule = Rule {
            match_: Match::Any,
            conditions: vec![
                Condition::Priority { values: vec![5] },
                Condition::Due { op: DueOp::Range { from: Some("2026-01-01".into()), to: None } },
                Condition::Tag { ids: vec!["x".into()] },
            ],
        };
        let json = serde_json::to_string(&rule).unwrap();
        assert_eq!(serde_json::from_str::<Rule>(&json).unwrap(), rule);
        // Spot-check the wire shape the TS side must also produce.
        assert!(json.contains("\"match\":\"any\""));
        assert!(json.contains("\"field\":\"priority\""));
        assert!(json.contains("\"kind\":\"range\""));
    }
}
