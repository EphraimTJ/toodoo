//! Recurrence engine — the authority for advancing a recurring task to its next
//! occurrence. Pure (no DB) so it is exhaustively unit-testable.
//!
//! Model (docs/decisions.md): a recurring task advances in place. Completing it
//! computes the next occurrence from its stored `RRULE` and either the current
//! due date (`repeat_from = DUE`, fixed schedule) or the completion instant
//! (`repeat_from = COMPLETION`). End conditions live inside the RRULE
//! (`UNTIL=` / `COUNT=`); `COUNT` progress is counted from `task_completions`,
//! so we strip both from the rule we hand the iterator and enforce them here.

use chrono::{DateTime, NaiveDate, SecondsFormat, TimeZone, Utc};
use rrule::{RRuleSet, Tz as RruleTz};

use crate::error::{RepoError, Result};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum RepeatFrom {
    Due,
    Completion,
}

impl RepeatFrom {
    pub fn parse(s: Option<&str>) -> Self {
        match s {
            Some("COMPLETION") => RepeatFrom::Completion,
            _ => RepeatFrom::Due,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct NextOccurrence {
    pub start_at: Option<String>,
    pub due_at: Option<String>,
}

#[derive(Debug, Clone)]
pub struct NextInput<'a> {
    /// The RRULE, with or without a leading `RRULE:` and with or without a
    /// `DTSTART` line (DTSTART is ignored — the task's dates are the basis).
    pub rrule: &'a str,
    pub start_at: Option<&'a str>,
    pub due_at: Option<&'a str>,
    pub is_all_day: bool,
    pub repeat_from: RepeatFrom,
    /// RFC3339 instant the user completed the occurrence.
    pub completed_at: &'a str,
    /// IANA name (e.g. "America/New_York"); UTC when None.
    pub tz_name: Option<&'a str>,
    /// Occurrences already closed for this task INCLUDING the one just
    /// completed — used to enforce `COUNT=`.
    pub completed_so_far: u32,
}

fn parse_utc(s: &str) -> Result<DateTime<Utc>> {
    DateTime::parse_from_rfc3339(s)
        .map(|dt| dt.with_timezone(&Utc))
        .map_err(|e| RepoError::Invalid(format!("bad datetime {s:?}: {e}")))
}

fn fmt(dt: DateTime<Utc>) -> String {
    dt.to_rfc3339_opts(SecondsFormat::Millis, true)
}

/// Pull the `RRULE:` body out of whatever the caller stored (may be a bare
/// body, or include `DTSTART` / `RRULE:` prefixes), and split off COUNT/UNTIL.
struct ParsedRule {
    body: String,
    count: Option<u32>,
    until: Option<DateTime<Utc>>,
}

fn parse_rule(rrule: &str) -> Result<ParsedRule> {
    // Take the RRULE line if a full iCal block was stored.
    let line = rrule
        .lines()
        .find(|l| l.to_uppercase().starts_with("RRULE:"))
        .map(|l| &l[l.find(':').map(|i| i + 1).unwrap_or(0)..])
        .unwrap_or(rrule)
        .trim();

    let mut kept = Vec::new();
    let mut count = None;
    let mut until = None;
    for part in line.split(';').filter(|p| !p.is_empty()) {
        let upper = part.to_uppercase();
        if let Some(v) = upper.strip_prefix("COUNT=") {
            count = Some(
                v.trim()
                    .parse()
                    .map_err(|_| RepoError::Invalid(format!("bad COUNT in {part:?}")))?,
            );
        } else if let Some(v) = upper.strip_prefix("UNTIL=") {
            until = Some(parse_until(v.trim())?);
        } else {
            kept.push(part.to_string());
        }
    }
    if kept.is_empty() {
        return Err(RepoError::Invalid("empty RRULE".into()));
    }
    Ok(ParsedRule { body: kept.join(";"), count, until })
}

/// UNTIL is `YYYYMMDD` or `YYYYMMDDTHHMMSSZ` per RFC 5545.
fn parse_until(v: &str) -> Result<DateTime<Utc>> {
    let bad = || RepoError::Invalid(format!("bad UNTIL {v:?}"));
    if let Some(date_part) = v.strip_suffix('Z') {
        let naive = chrono::NaiveDateTime::parse_from_str(date_part, "%Y%m%dT%H%M%S")
            .map_err(|_| bad())?;
        Ok(Utc.from_utc_datetime(&naive))
    } else if v.len() == 8 {
        let date = NaiveDate::parse_from_str(v, "%Y%m%d").map_err(|_| bad())?;
        Ok(Utc.from_utc_datetime(&date.and_hms_opt(23, 59, 59).unwrap()))
    } else {
        Err(bad())
    }
}

fn resolve_tz(tz_name: Option<&str>) -> RruleTz {
    tz_name
        .and_then(|n| n.parse::<chrono_tz::Tz>().ok())
        .map(RruleTz::Tz)
        .unwrap_or(RruleTz::UTC)
}

/// Extract the bare RRULE body from a stored value that may carry a leading
/// `RRULE:` (or a full iCal block).
fn rrule_body(rrule: &str) -> &str {
    rrule
        .lines()
        .find(|l| l.to_uppercase().starts_with("RRULE:"))
        .map(|l| &l[l.find(':').map(|i| i + 1).unwrap_or(0)..])
        .unwrap_or(rrule)
        .trim()
}

/// Every occurrence of `rrule` (anchored at `dtstart`) that falls within
/// `[from, to]`, excluding `exdates`. Honors COUNT/UNTIL natively (they stay in
/// the rule). Used to expand recurring calendar events across the visible
/// window. Bounded iteration so an exotic rule can never hang.
pub fn occurrences_between(
    rrule: &str,
    dtstart: &str,
    from: &str,
    to: &str,
    tz_name: Option<&str>,
    exdates: &[String],
) -> Result<Vec<String>> {
    let body = rrule_body(rrule);
    if body.is_empty() {
        return Err(RepoError::Invalid("empty RRULE".into()));
    }
    let tz = resolve_tz(tz_name);
    let start = parse_utc(dtstart)?;
    let from_dt = parse_utc(from)?;
    let to_dt = parse_utc(to)?;

    let dtstart_local = start.with_timezone(&tz);
    let ical = format!(
        "DTSTART;TZID={}:{}\nRRULE:{}",
        tz.name(),
        dtstart_local.format("%Y%m%dT%H%M%S"),
        body
    );
    let set: RRuleSet = ical
        .parse()
        .map_err(|e| RepoError::Invalid(format!("invalid RRULE {body:?}: {e}")))?;

    let excluded: std::collections::HashSet<i64> = exdates
        .iter()
        .filter_map(|e| parse_utc(e).ok())
        .map(|d| d.timestamp_millis())
        .collect();

    let mut out = Vec::new();
    for occ in set.into_iter().take(3660) {
        let occ_utc = occ.with_timezone(&Utc);
        if occ_utc > to_dt {
            break;
        }
        if occ_utc < from_dt || excluded.contains(&occ_utc.timestamp_millis()) {
            continue;
        }
        out.push(fmt(occ_utc));
    }
    Ok(out)
}

/// First rule occurrence strictly after `basis` (interpreting the rule in `tz`,
/// starting it at `basis`). Bounded iteration so an exotic rule can never hang.
fn first_after(body: &str, basis: DateTime<Utc>, tz: RruleTz) -> Result<Option<DateTime<Utc>>> {
    let dtstart = basis.with_timezone(&tz);
    let ical = format!(
        "DTSTART;TZID={}:{}\nRRULE:{}",
        tz.name(),
        dtstart.format("%Y%m%dT%H%M%S"),
        body
    );
    let set: RRuleSet = ical
        .parse()
        .map_err(|e| RepoError::Invalid(format!("invalid RRULE {body:?}: {e}")))?;

    for occ in set.into_iter().take(3660) {
        let occ_utc = occ.with_timezone(&Utc);
        if occ_utc > basis {
            return Ok(Some(occ_utc));
        }
    }
    Ok(None)
}

/// Compute the next occurrence, or `None` when the series has ended.
pub fn next_occurrence(input: NextInput) -> Result<Option<NextOccurrence>> {
    let rule = parse_rule(input.rrule)?;

    // COUNT is a hard cap on total occurrences.
    if let Some(count) = rule.count {
        if input.completed_so_far >= count {
            return Ok(None);
        }
    }

    let tz = resolve_tz(input.tz_name);

    // The occurrence we just closed: due if present, else start.
    let current = input
        .due_at
        .or(input.start_at)
        .ok_or_else(|| RepoError::Invalid("recurring task needs a start or due date".into()))?;
    let current = parse_utc(current)?;

    // Basis to advance from.
    let basis = match input.repeat_from {
        RepeatFrom::Due => current,
        RepeatFrom::Completion => {
            // Keep the occurrence's wall time-of-day, move to the completion day
            // (both taken in the task's timezone so "9am daily" stays 9am).
            let completed = parse_utc(input.completed_at)?;
            if input.is_all_day {
                let day = completed.with_timezone(&tz).date_naive();
                let naive = day.and_hms_opt(0, 0, 0).unwrap();
                Utc.from_utc_datetime(&naive)
            } else {
                let comp_day = completed.with_timezone(&tz).date_naive();
                let cur_local = current.with_timezone(&tz);
                tz.from_local_datetime(&comp_day.and_time(cur_local.time()))
                    .single()
                    .map(|dt| dt.with_timezone(&Utc))
                    .unwrap_or(completed)
            }
        }
    };

    let Some(candidate) = first_after(&rule.body, basis, tz)? else {
        return Ok(None);
    };

    // UNTIL bound.
    if let Some(until) = rule.until {
        if candidate > until {
            return Ok(None);
        }
    }

    // Advance both endpoints, preserving the start->due gap.
    let (new_start, new_due) = match (input.start_at, input.due_at) {
        (Some(start), Some(_due)) => {
            let gap = current - parse_utc(start)?; // due - start
            (Some(candidate - gap), Some(candidate))
        }
        (Some(_start), None) => (Some(candidate), None),
        (None, Some(_due)) => (None, Some(candidate)),
        (None, None) => (None, None),
    };

    let render = |dt: DateTime<Utc>| {
        if input.is_all_day {
            // Store all-day as midnight-Z, matching Phase 1's date columns.
            let day = dt.date_naive();
            fmt(Utc.from_utc_datetime(&day.and_hms_opt(0, 0, 0).unwrap()))
        } else {
            fmt(dt)
        }
    };

    Ok(Some(NextOccurrence {
        start_at: new_start.map(render),
        due_at: new_due.map(render),
    }))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn base(rrule: &str, due: &str) -> NextInput<'static> {
        // Leak small test strings for 'static convenience.
        NextInput {
            rrule: Box::leak(rrule.to_string().into_boxed_str()),
            start_at: None,
            due_at: Some(Box::leak(due.to_string().into_boxed_str())),
            is_all_day: true,
            repeat_from: RepeatFrom::Due,
            completed_at: "2026-01-01T00:00:00.000Z",
            tz_name: None,
            completed_so_far: 1,
        }
    }

    fn due_of(n: Option<NextOccurrence>) -> String {
        n.unwrap().due_at.unwrap()
    }

    #[test]
    fn daily_from_due_advances_one_day_regardless_of_completion() {
        // Completed a week late; fixed schedule still advances a single day.
        let mut input = base("FREQ=DAILY", "2026-03-10T00:00:00.000Z");
        input.completed_at = "2026-03-17T12:00:00.000Z";
        assert_eq!(due_of(next_occurrence(input).unwrap()), "2026-03-11T00:00:00.000Z");
    }

    #[test]
    fn daily_from_completion_anchors_on_completion_date() {
        let mut input = base("FREQ=DAILY", "2026-03-10T00:00:00.000Z");
        input.repeat_from = RepeatFrom::Completion;
        input.completed_at = "2026-03-17T12:00:00.000Z"; // finished the 17th
        assert_eq!(due_of(next_occurrence(input).unwrap()), "2026-03-18T00:00:00.000Z");
    }

    #[test]
    fn every_three_days_from_completion() {
        let mut input = base("FREQ=DAILY;INTERVAL=3", "2026-03-10T00:00:00.000Z");
        input.repeat_from = RepeatFrom::Completion;
        input.completed_at = "2026-03-10T09:00:00.000Z";
        assert_eq!(due_of(next_occurrence(input).unwrap()), "2026-03-13T00:00:00.000Z");
    }

    #[test]
    fn weekly_byday_friday() {
        // Due on Friday 2026-03-13; next Friday is the 20th.
        let input = base("FREQ=WEEKLY;BYDAY=FR", "2026-03-13T00:00:00.000Z");
        assert_eq!(due_of(next_occurrence(input).unwrap()), "2026-03-20T00:00:00.000Z");
    }

    #[test]
    fn monthly_bymonthday_31_skips_short_months() {
        // Jan 31 -> Mar 31 (February has no 31st).
        let input = base("FREQ=MONTHLY;BYMONTHDAY=31", "2026-01-31T00:00:00.000Z");
        assert_eq!(due_of(next_occurrence(input).unwrap()), "2026-03-31T00:00:00.000Z");
    }

    #[test]
    fn monthly_last_friday() {
        // Last Friday of March 2026 is the 27th; of April, the 24th.
        let input = base("FREQ=MONTHLY;BYDAY=-1FR", "2026-03-27T00:00:00.000Z");
        assert_eq!(due_of(next_occurrence(input).unwrap()), "2026-04-24T00:00:00.000Z");
    }

    #[test]
    fn yearly_leap_day_skips_to_next_leap_year() {
        let input = base("FREQ=YEARLY", "2024-02-29T00:00:00.000Z");
        assert_eq!(due_of(next_occurrence(input).unwrap()), "2028-02-29T00:00:00.000Z");
    }

    #[test]
    fn timed_task_preserves_wall_clock_across_dst_spring_forward() {
        // US DST 2026 begins Sun Mar 8. A 09:00 America/New_York daily task
        // due Sat Mar 7 should stay 09:00 local on Mar 8 — i.e. 13:00Z, not
        // 14:00Z (the naive +24h answer).
        let mut input = base("FREQ=DAILY", "2026-03-07T14:00:00.000Z"); // 09:00 EST
        input.is_all_day = false;
        input.tz_name = Some("America/New_York");
        assert_eq!(due_of(next_occurrence(input).unwrap()), "2026-03-08T13:00:00.000Z"); // 09:00 EDT
    }

    #[test]
    fn count_end_condition_stops_after_n() {
        // COUNT=3, and 3 occurrences already completed -> series ends.
        let mut input = base("FREQ=DAILY;COUNT=3", "2026-03-10T00:00:00.000Z");
        input.completed_so_far = 3;
        assert_eq!(next_occurrence(input).unwrap(), None);

        let mut input = base("FREQ=DAILY;COUNT=3", "2026-03-10T00:00:00.000Z");
        input.completed_so_far = 2;
        assert!(next_occurrence(input).unwrap().is_some());
    }

    #[test]
    fn until_end_condition_stops_past_the_boundary() {
        // Next would be 2026-03-11 but UNTIL is 2026-03-10.
        let input = base("FREQ=DAILY;UNTIL=20260310T235959Z", "2026-03-10T00:00:00.000Z");
        assert_eq!(next_occurrence(input).unwrap(), None);
    }

    #[test]
    fn preserves_start_to_due_gap() {
        let input = NextInput {
            rrule: "FREQ=WEEKLY",
            start_at: Some("2026-03-10T00:00:00.000Z"),
            due_at: Some("2026-03-12T00:00:00.000Z"), // 2-day span
            is_all_day: true,
            repeat_from: RepeatFrom::Due,
            completed_at: "2026-03-12T00:00:00.000Z",
            tz_name: None,
            completed_so_far: 1,
        };
        let next = next_occurrence(input).unwrap().unwrap();
        assert_eq!(next.due_at.unwrap(), "2026-03-19T00:00:00.000Z");
        assert_eq!(next.start_at.unwrap(), "2026-03-17T00:00:00.000Z"); // gap kept
    }

    #[test]
    fn occurrences_between_weekly_within_window() {
        // Weekly Mondays from 2026-03-02; March has Mondays 2,9,16,23,30.
        let occ = occurrences_between(
            "FREQ=WEEKLY;BYDAY=MO",
            "2026-03-02T09:00:00.000Z",
            "2026-03-01T00:00:00.000Z",
            "2026-03-31T23:59:59.000Z",
            None,
            &[],
        )
        .unwrap();
        assert_eq!(occ.len(), 5);
        assert_eq!(occ[0], "2026-03-02T09:00:00.000Z");
        assert_eq!(occ[4], "2026-03-30T09:00:00.000Z");
    }

    #[test]
    fn occurrences_between_honors_count_and_exdate() {
        // COUNT caps at 3 even though the window is wide.
        let occ = occurrences_between(
            "FREQ=DAILY;COUNT=3",
            "2026-03-02T09:00:00.000Z",
            "2026-01-01T00:00:00.000Z",
            "2026-12-31T00:00:00.000Z",
            None,
            &[],
        )
        .unwrap();
        assert_eq!(occ, [
            "2026-03-02T09:00:00.000Z",
            "2026-03-03T09:00:00.000Z",
            "2026-03-04T09:00:00.000Z",
        ]);

        // EXDATE removes the middle occurrence.
        let occ = occurrences_between(
            "FREQ=DAILY;COUNT=3",
            "2026-03-02T09:00:00.000Z",
            "2026-01-01T00:00:00.000Z",
            "2026-12-31T00:00:00.000Z",
            None,
            &["2026-03-03T09:00:00.000Z".to_string()],
        )
        .unwrap();
        assert_eq!(occ.len(), 2);
        assert!(!occ.contains(&"2026-03-03T09:00:00.000Z".to_string()));
    }

    #[test]
    fn occurrences_between_clips_to_window() {
        // Only the occurrences inside the tight window are returned.
        let occ = occurrences_between(
            "FREQ=DAILY",
            "2026-03-01T00:00:00.000Z",
            "2026-03-10T00:00:00.000Z",
            "2026-03-12T00:00:00.000Z",
            None,
            &[],
        )
        .unwrap();
        assert_eq!(occ, [
            "2026-03-10T00:00:00.000Z",
            "2026-03-11T00:00:00.000Z",
            "2026-03-12T00:00:00.000Z",
        ]);
    }

    #[test]
    fn accepts_full_ical_block_with_dtstart_and_rrule_prefix() {
        let input = base(
            "DTSTART:20260310T000000Z\nRRULE:FREQ=DAILY",
            "2026-03-10T00:00:00.000Z",
        );
        assert_eq!(due_of(next_occurrence(input).unwrap()), "2026-03-11T00:00:00.000Z");
    }
}
