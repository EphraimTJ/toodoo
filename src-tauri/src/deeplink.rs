//! `toodoo://` deep-link parsing. Pure and unit-tested; the Tauri layer feeds
//! received URLs through `parse_deep_link` and forwards the action to the webview.

/// What a `toodoo://` URL asks the app to do. Serialized to the webview as
/// `{ "kind": "openTask", "id": "…" }` etc.
#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum DeepLinkAction {
    /// `toodoo://task/<id>` — open a task in the detail pane.
    OpenTask { id: String },
    /// `toodoo://project/<id>` — select a list/project.
    OpenProject { id: String },
    /// `toodoo://add?title=..&list=..&priority=..&due=..` — prefill quick-add.
    QuickAdd {
        title: Option<String>,
        list: Option<String>,
        priority: Option<String>,
        due: Option<String>,
    },
}

/// Percent-decode a query-component (`+` is a space, `%XX` is a byte). Lossy on
/// invalid UTF-8, which is fine for the titles/ids we accept.
fn decode(s: &str) -> String {
    let bytes = s.as_bytes();
    let mut out = Vec::with_capacity(bytes.len());
    let mut i = 0;
    while i < bytes.len() {
        match bytes[i] {
            b'+' => {
                out.push(b' ');
                i += 1;
            }
            b'%' if i + 2 < bytes.len() => {
                let hi = (bytes[i + 1] as char).to_digit(16);
                let lo = (bytes[i + 2] as char).to_digit(16);
                match (hi, lo) {
                    (Some(h), Some(l)) => {
                        out.push((h * 16 + l) as u8);
                        i += 3;
                    }
                    _ => {
                        out.push(bytes[i]);
                        i += 1;
                    }
                }
            }
            b => {
                out.push(b);
                i += 1;
            }
        }
    }
    String::from_utf8_lossy(&out).into_owned()
}

/// Parse `key=value&key=value` into pairs (values percent-decoded).
fn query_pairs(query: &str) -> Vec<(String, String)> {
    query
        .split('&')
        .filter(|p| !p.is_empty())
        .map(|pair| match pair.split_once('=') {
            Some((k, v)) => (k.to_string(), decode(v)),
            None => (pair.to_string(), String::new()),
        })
        .collect()
}

/// Parse a `toodoo://…` URL into an action, or `None` if it isn't one we handle.
pub fn parse_deep_link(url: &str) -> Option<DeepLinkAction> {
    let rest = url.strip_prefix("toodoo://")?;
    // Split off the query string first.
    let (path, query) = match rest.split_once('?') {
        Some((p, q)) => (p, Some(q)),
        None => (rest, None),
    };
    let path = path.trim_end_matches('/');
    let mut segments = path.splitn(2, '/');
    let host = segments.next()?;
    let tail = segments.next().map(decode);

    match host {
        "task" => tail.filter(|s| !s.is_empty()).map(|id| DeepLinkAction::OpenTask { id }),
        "project" | "list" => {
            tail.filter(|s| !s.is_empty()).map(|id| DeepLinkAction::OpenProject { id })
        }
        "add" => {
            let pairs = query.map(query_pairs).unwrap_or_default();
            let get = |key: &str| {
                pairs.iter().find(|(k, _)| k == key).map(|(_, v)| v.clone()).filter(|v| !v.is_empty())
            };
            Some(DeepLinkAction::QuickAdd {
                title: get("title"),
                list: get("list"),
                priority: get("priority"),
                due: get("due"),
            })
        }
        _ => None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_open_task() {
        assert_eq!(
            parse_deep_link("toodoo://task/abc-123"),
            Some(DeepLinkAction::OpenTask { id: "abc-123".into() })
        );
    }

    #[test]
    fn parses_open_project_and_list_alias() {
        assert_eq!(
            parse_deep_link("toodoo://project/inbox"),
            Some(DeepLinkAction::OpenProject { id: "inbox".into() })
        );
        assert_eq!(
            parse_deep_link("toodoo://list/inbox/"),
            Some(DeepLinkAction::OpenProject { id: "inbox".into() })
        );
    }

    #[test]
    fn parses_quick_add_with_and_without_query() {
        assert_eq!(
            parse_deep_link("toodoo://add"),
            Some(DeepLinkAction::QuickAdd { title: None, list: None, priority: None, due: None })
        );
        assert_eq!(
            parse_deep_link("toodoo://add?title=Buy%20milk&list=Inbox&priority=high"),
            Some(DeepLinkAction::QuickAdd {
                title: Some("Buy milk".into()),
                list: Some("Inbox".into()),
                priority: Some("high".into()),
                due: None,
            })
        );
    }

    #[test]
    fn plus_is_decoded_as_space() {
        assert_eq!(
            parse_deep_link("toodoo://add?title=Call+Sam"),
            Some(DeepLinkAction::QuickAdd {
                title: Some("Call Sam".into()),
                list: None,
                priority: None,
                due: None,
            })
        );
    }

    #[test]
    fn unknown_or_malformed_is_none() {
        assert_eq!(parse_deep_link("toodoo://bogus/1"), None);
        assert_eq!(parse_deep_link("https://example.com"), None);
        assert_eq!(parse_deep_link("toodoo://task/"), None);
        assert_eq!(parse_deep_link("toodoo://task"), None);
    }
}
