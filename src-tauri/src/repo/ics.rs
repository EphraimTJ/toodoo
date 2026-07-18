//! Minimal iCalendar (RFC 5545) reader/writer for the calendar's import,
//! export, and ICS-subscription overlay. Pure (no DB, no network) so it is
//! exhaustively unit-testable; the network fetch is a thin layer in
//! `cal_subscriptions`.
//!
//! Scope: VEVENT with UID/SUMMARY/DTSTART/DTEND/LOCATION/DESCRIPTION/RRULE/
//! EXDATE, line unfolding, TEXT (un)escaping, all-day (`VALUE=DATE`) vs timed,
//! and `TZID=`/`Z`/floating → UTC. RECURRENCE-ID overrides and full VTIMEZONE
//! parsing are out of scope (docs/decisions.md).

use chrono::{DateTime, NaiveDate, NaiveDateTime, SecondsFormat, TimeZone, Utc};

#[derive(Debug, Clone, PartialEq, Eq, Default)]
pub struct IcsEvent {
    pub uid: Option<String>,
    pub summary: String,
    pub start_at: String, // RFC3339 UTC (all-day = midnight-Z)
    pub end_at: Option<String>,
    pub all_day: bool,
    pub location: Option<String>,
    pub description: Option<String>,
    pub rrule: Option<String>, // bare body, e.g. "FREQ=WEEKLY;BYDAY=MO"
    pub exdates: Vec<String>,  // RFC3339 UTC instants
}

// ---- parsing ---------------------------------------------------------------

/// Unfold per RFC 5545 §3.1: a line starting with a space or tab continues the
/// previous line (the leading whitespace is dropped).
fn unfold(text: &str) -> Vec<String> {
    let mut out: Vec<String> = Vec::new();
    for raw in text.split('\n') {
        let line = raw.strip_suffix('\r').unwrap_or(raw);
        if (line.starts_with(' ') || line.starts_with('\t')) && !out.is_empty() {
            out.last_mut().unwrap().push_str(&line[1..]);
        } else {
            out.push(line.to_string());
        }
    }
    out
}

fn unescape(value: &str) -> String {
    let mut out = String::with_capacity(value.len());
    let mut chars = value.chars();
    while let Some(c) = chars.next() {
        if c == '\\' {
            match chars.next() {
                Some('n') | Some('N') => out.push('\n'),
                Some('\\') => out.push('\\'),
                Some(',') => out.push(','),
                Some(';') => out.push(';'),
                Some(other) => out.push(other),
                None => out.push('\\'),
            }
        } else {
            out.push(c);
        }
    }
    out
}

/// Split "NAME;PARM=x;PARM2=y" into the name and a params list.
fn split_params(name_and_params: &str) -> (String, Vec<(String, String)>) {
    let mut parts = name_and_params.split(';');
    let name = parts.next().unwrap_or("").to_uppercase();
    let params = parts
        .filter_map(|p| p.split_once('='))
        .map(|(k, v)| (k.to_uppercase(), v.to_string()))
        .collect();
    (name, params)
}

fn fmt_utc(dt: DateTime<Utc>) -> String {
    dt.to_rfc3339_opts(SecondsFormat::Millis, true)
}

/// Parse one date/date-time value (given its params) to (rfc3339_utc, all_day).
fn parse_dt(value: &str, params: &[(String, String)]) -> Option<(String, bool)> {
    let is_date = params.iter().any(|(k, v)| k == "VALUE" && v.eq_ignore_ascii_case("DATE"))
        || (value.len() == 8 && !value.contains('T'));
    if is_date {
        let date = NaiveDate::parse_from_str(value, "%Y%m%d").ok()?;
        let naive = date.and_hms_opt(0, 0, 0)?;
        return Some((fmt_utc(Utc.from_utc_datetime(&naive)), true));
    }
    // Date-time: with trailing Z (UTC), a TZID param, or floating (assume UTC).
    if let Some(body) = value.strip_suffix('Z') {
        let naive = NaiveDateTime::parse_from_str(body, "%Y%m%dT%H%M%S").ok()?;
        return Some((fmt_utc(Utc.from_utc_datetime(&naive)), false));
    }
    let naive = NaiveDateTime::parse_from_str(value, "%Y%m%dT%H%M%S").ok()?;
    if let Some((_, tzid)) = params.iter().find(|(k, _)| k == "TZID") {
        if let Ok(tz) = tzid.parse::<chrono_tz::Tz>() {
            let dt = tz.from_local_datetime(&naive).single()?;
            return Some((fmt_utc(dt.with_timezone(&Utc)), false));
        }
    }
    Some((fmt_utc(Utc.from_utc_datetime(&naive)), false))
}

/// Parse an ICS document into its VEVENTs. Malformed events are skipped.
/// Whether `text` is structurally an iCalendar document (has a
/// `BEGIN:VCALENDAR` line after unfolding). Gate for the subscription-refresh
/// path: an HTML error page or truncated response parses to zero events, which
/// must not be mistaken for a legitimately empty calendar.
pub fn is_calendar(text: &str) -> bool {
    unfold(text).iter().any(|l| l.trim().eq_ignore_ascii_case("BEGIN:VCALENDAR"))
}

pub fn parse(text: &str) -> Vec<IcsEvent> {
    let mut events = Vec::new();
    let mut current: Option<IcsEvent> = None;

    for line in unfold(text) {
        if line == "BEGIN:VEVENT" {
            current = Some(IcsEvent::default());
            continue;
        }
        if line == "END:VEVENT" {
            if let Some(ev) = current.take() {
                if !ev.start_at.is_empty() {
                    events.push(ev);
                }
            }
            continue;
        }
        let Some(ev) = current.as_mut() else { continue };
        let Some((lhs, value)) = line.split_once(':') else { continue };
        let (name, params) = split_params(lhs);
        match name.as_str() {
            "UID" => ev.uid = Some(value.to_string()),
            "SUMMARY" => ev.summary = unescape(value),
            "LOCATION" => ev.location = Some(unescape(value)),
            "DESCRIPTION" => ev.description = Some(unescape(value)),
            "RRULE" => ev.rrule = Some(value.to_string()),
            "DTSTART" => {
                if let Some((iso, all_day)) = parse_dt(value, &params) {
                    ev.start_at = iso;
                    ev.all_day = all_day;
                }
            }
            "DTEND" => {
                if let Some((iso, _)) = parse_dt(value, &params) {
                    ev.end_at = Some(iso);
                }
            }
            "EXDATE" => {
                for part in value.split(',') {
                    if let Some((iso, _)) = parse_dt(part, &params) {
                        ev.exdates.push(iso);
                    }
                }
            }
            _ => {}
        }
    }
    events
}

// ---- generation ------------------------------------------------------------

fn escape(text: &str) -> String {
    text.replace('\\', "\\\\")
        .replace('\n', "\\n")
        .replace(',', "\\,")
        .replace(';', "\\;")
}

/// Fold a content line at 75 octets with CRLF + space (RFC 5545 §3.1).
fn fold(line: &str) -> String {
    let bytes = line.as_bytes();
    if bytes.len() <= 75 {
        return line.to_string();
    }
    let mut out = String::new();
    let mut count = 0;
    for ch in line.chars() {
        let w = ch.len_utf8();
        // 75 on the first line, 74 on continuations (the leading space counts).
        let limit = if out.contains("\r\n") { 74 } else { 75 };
        if count + w > limit {
            out.push_str("\r\n ");
            count = 1;
        }
        out.push(ch);
        count += w;
    }
    out
}

fn to_ics_dt(rfc3339: &str, all_day: bool) -> Option<String> {
    let dt = DateTime::parse_from_rfc3339(rfc3339).ok()?.with_timezone(&Utc);
    Some(if all_day {
        dt.format("%Y%m%d").to_string()
    } else {
        dt.format("%Y%m%dT%H%M%SZ").to_string()
    })
}

fn push(out: &mut String, line: String) {
    out.push_str(&fold(&line));
    out.push_str("\r\n");
}

/// Serialize events into a complete VCALENDAR document.
pub fn generate(events: &[IcsEvent]) -> String {
    let mut out = String::new();
    out.push_str("BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//Toodoo//Toodoo//EN\r\nCALSCALE:GREGORIAN\r\n");
    for ev in events {
        out.push_str("BEGIN:VEVENT\r\n");
        if let Some(uid) = &ev.uid {
            push(&mut out, format!("UID:{uid}"));
        }
        push(&mut out, format!("SUMMARY:{}", escape(&ev.summary)));
        if let Some(start) = to_ics_dt(&ev.start_at, ev.all_day) {
            if ev.all_day {
                push(&mut out, format!("DTSTART;VALUE=DATE:{start}"));
            } else {
                push(&mut out, format!("DTSTART:{start}"));
            }
        }
        if let Some(end_raw) = &ev.end_at {
            if let Some(end) = to_ics_dt(end_raw, ev.all_day) {
                if ev.all_day {
                    push(&mut out, format!("DTEND;VALUE=DATE:{end}"));
                } else {
                    push(&mut out, format!("DTEND:{end}"));
                }
            }
        }
        if let Some(loc) = &ev.location {
            push(&mut out, format!("LOCATION:{}", escape(loc)));
        }
        if let Some(desc) = &ev.description {
            push(&mut out, format!("DESCRIPTION:{}", escape(desc)));
        }
        if let Some(rrule) = &ev.rrule {
            push(&mut out, format!("RRULE:{rrule}"));
        }
        out.push_str("END:VEVENT\r\n");
    }
    out.push_str("END:VCALENDAR\r\n");
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn is_calendar_accepts_ics_and_rejects_non_ics() {
        assert!(is_calendar("BEGIN:VCALENDAR\r\nEND:VCALENDAR\r\n")); // empty but valid
        assert!(is_calendar("begin:vcalendar\nend:vcalendar\n")); // case-insensitive
        assert!(!is_calendar("<html><body><h1>404 Not Found</h1></body></html>"));
        assert!(!is_calendar(""));
        assert!(!is_calendar("BEGIN:VEVENT\r\nSUMMARY:orphan\r\nEND:VEVENT\r\n")); // truncated fragment
    }

    #[test]
    fn parses_a_timed_event_with_uid_and_fields() {
        let ics = "BEGIN:VCALENDAR\r\nBEGIN:VEVENT\r\nUID:abc-1\r\nSUMMARY:Standup\r\n\
                   DTSTART:20260316T140000Z\r\nDTEND:20260316T143000Z\r\nLOCATION:Zoom\r\n\
                   END:VEVENT\r\nEND:VCALENDAR\r\n";
        let events = parse(ics);
        assert_eq!(events.len(), 1);
        let e = &events[0];
        assert_eq!(e.uid.as_deref(), Some("abc-1"));
        assert_eq!(e.summary, "Standup");
        assert_eq!(e.start_at, "2026-03-16T14:00:00.000Z");
        assert_eq!(e.end_at.as_deref(), Some("2026-03-16T14:30:00.000Z"));
        assert_eq!(e.location.as_deref(), Some("Zoom"));
        assert!(!e.all_day);
    }

    #[test]
    fn all_day_via_value_date_and_bare_date() {
        let ics = "BEGIN:VEVENT\r\nSUMMARY:Holiday\r\nDTSTART;VALUE=DATE:20260704\r\nEND:VEVENT\r\n";
        let e = &parse(ics)[0];
        assert!(e.all_day);
        assert_eq!(e.start_at, "2026-07-04T00:00:00.000Z");
    }

    #[test]
    fn tzid_is_converted_to_utc() {
        // 09:00 America/New_York on 2026-03-16 (EDT, UTC-4) = 13:00Z.
        let ics = "BEGIN:VEVENT\r\nSUMMARY:Call\r\n\
                   DTSTART;TZID=America/New_York:20260316T090000\r\nEND:VEVENT\r\n";
        assert_eq!(parse(ics)[0].start_at, "2026-03-16T13:00:00.000Z");
    }

    #[test]
    fn unfolds_wrapped_lines_and_unescapes_text() {
        let ics = "BEGIN:VEVENT\r\nSUMMARY:Long tit\r\n le\r\n\
                   DESCRIPTION:line one\\nline two\\, still\r\nDTSTART:20260101T000000Z\r\nEND:VEVENT\r\n";
        let e = &parse(ics)[0];
        assert_eq!(e.summary, "Long title");
        assert_eq!(e.description.as_deref(), Some("line one\nline two, still"));
    }

    #[test]
    fn captures_rrule_and_exdates() {
        let ics = "BEGIN:VEVENT\r\nSUMMARY:Weekly\r\nDTSTART:20260302T090000Z\r\n\
                   RRULE:FREQ=WEEKLY;BYDAY=MO\r\nEXDATE:20260309T090000Z,20260316T090000Z\r\nEND:VEVENT\r\n";
        let e = &parse(ics)[0];
        assert_eq!(e.rrule.as_deref(), Some("FREQ=WEEKLY;BYDAY=MO"));
        assert_eq!(e.exdates, ["2026-03-09T09:00:00.000Z", "2026-03-16T09:00:00.000Z"]);
    }

    #[test]
    fn parses_multiple_events() {
        let ics = "BEGIN:VEVENT\r\nSUMMARY:A\r\nDTSTART:20260101T000000Z\r\nEND:VEVENT\r\n\
                   BEGIN:VEVENT\r\nSUMMARY:B\r\nDTSTART:20260102T000000Z\r\nEND:VEVENT\r\n";
        assert_eq!(parse(ics).len(), 2);
    }

    #[test]
    fn generate_then_parse_round_trips() {
        let original = IcsEvent {
            uid: Some("evt-42".into()),
            summary: "Design review; part 2".into(),
            start_at: "2026-05-01T15:00:00.000Z".into(),
            end_at: Some("2026-05-01T16:00:00.000Z".into()),
            all_day: false,
            location: Some("Room 3".into()),
            description: Some("bring notes".into()),
            rrule: None,
            exdates: vec![],
        };
        let text = generate(std::slice::from_ref(&original));
        let parsed = parse(&text);
        assert_eq!(parsed.len(), 1);
        let e = &parsed[0];
        assert_eq!(e.uid, original.uid);
        assert_eq!(e.summary, original.summary); // ';' escaped and recovered
        assert_eq!(e.start_at, original.start_at);
        assert_eq!(e.end_at, original.end_at);
        assert_eq!(e.location, original.location);
    }

    #[test]
    fn generate_folds_long_lines_to_75_octets() {
        let ev = IcsEvent {
            summary: "x".repeat(200),
            start_at: "2026-01-01T00:00:00.000Z".into(),
            ..Default::default()
        };
        let text = generate(&[ev]);
        for line in text.split("\r\n") {
            assert!(line.len() <= 75, "line too long: {}", line.len());
        }
    }
}
