//! Advanced text-syntax parser for filters, e.g.
//! `list:Work #urgent priority:high due:today`. Parsing is pure (tokenize +
//! classify → `RawQuery`, referencing lists/tags by name); a thin async
//! `resolve` turns names into ids against the DB, yielding a `filter_rule::Rule`.
//!
//! Grammar (space-separated; `"…"` groups a phrase and suppresses splitting):
//!   list:NAME  ~NAME            → list by name
//!   tag:NAME   #NAME            → tag by name
//!   priority:high|medium|low|none   !high   → priority
//!   due:today|tomorrow|next7|overdue|none   → due predicate
//!   is:active|completed|wontdo  → status
//!   type:task|note              → kind
//!   anything else               → keyword (title/notes contains)
//! A bare top-level `OR` switches the combinator to Any (default All).

use sqlx::SqlitePool;

use crate::error::Result;

use super::filter_rule::{Condition, DueOp, Match, Rule};

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum RawCondition {
    ListName(String),
    TagName(String),
    Priority(i64),
    Due(DueOp),
    Keyword(String),
    Kind(String),
    Status(String),
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct RawQuery {
    pub match_: Match,
    pub conditions: Vec<RawCondition>,
}

/// Whitespace-split, but keep `"quoted phrases"` intact (quotes removed).
fn tokenize(text: &str) -> Vec<String> {
    let mut out = Vec::new();
    let mut buf = String::new();
    let mut in_quotes = false;
    for c in text.chars() {
        match c {
            '"' => in_quotes = !in_quotes,
            c if c.is_whitespace() && !in_quotes => {
                if !buf.is_empty() {
                    out.push(std::mem::take(&mut buf));
                }
            }
            c => buf.push(c),
        }
    }
    if !buf.is_empty() {
        out.push(buf);
    }
    out
}

fn priority_value(word: &str) -> Option<i64> {
    match word.to_lowercase().as_str() {
        "high" => Some(5),
        "medium" | "med" => Some(3),
        "low" => Some(1),
        "none" => Some(0),
        _ => None,
    }
}

fn due_op(word: &str) -> Option<DueOp> {
    match word.to_lowercase().as_str() {
        "today" => Some(DueOp::Today),
        "tomorrow" => Some(DueOp::Tomorrow),
        "next7" | "week" => Some(DueOp::Next7),
        "overdue" => Some(DueOp::Overdue),
        "none" => Some(DueOp::None),
        _ => None,
    }
}

fn status_value(word: &str) -> Option<&'static str> {
    match word.to_lowercase().as_str() {
        "active" => Some("ACTIVE"),
        "completed" | "done" => Some("COMPLETED"),
        "wontdo" | "wont" => Some("WONT_DO"),
        _ => None,
    }
}

fn kind_value(word: &str) -> Option<&'static str> {
    match word.to_lowercase().as_str() {
        "task" => Some("TASK"),
        "note" => Some("NOTE"),
        _ => None,
    }
}

/// Parse free text into a name-referencing query. Unrecognized `prefix:value`
/// tokens fall back to a keyword so nothing is silently dropped.
pub fn parse(text: &str) -> RawQuery {
    let mut match_ = Match::All;
    let mut conditions = Vec::new();

    for tok in tokenize(text) {
        if tok == "OR" {
            match_ = Match::Any;
            continue;
        }
        if tok == "AND" {
            continue;
        }
        let kw = |c: &mut Vec<RawCondition>, s: &str| c.push(RawCondition::Keyword(s.to_string()));

        if let Some(rest) = tok.strip_prefix('#') {
            conditions.push(RawCondition::TagName(rest.to_string()));
        } else if let Some(rest) = tok.strip_prefix('~') {
            conditions.push(RawCondition::ListName(rest.to_string()));
        } else if let Some(rest) = tok.strip_prefix('!') {
            match priority_value(rest) {
                Some(p) => conditions.push(RawCondition::Priority(p)),
                None => kw(&mut conditions, &tok),
            }
        } else if let Some(rest) = tok.strip_prefix("list:") {
            conditions.push(RawCondition::ListName(rest.to_string()));
        } else if let Some(rest) = tok.strip_prefix("tag:") {
            conditions.push(RawCondition::TagName(rest.to_string()));
        } else if let Some(rest) = tok.strip_prefix("priority:") {
            match priority_value(rest) {
                Some(p) => conditions.push(RawCondition::Priority(p)),
                None => kw(&mut conditions, &tok),
            }
        } else if let Some(rest) = tok.strip_prefix("due:") {
            match due_op(rest) {
                Some(op) => conditions.push(RawCondition::Due(op)),
                None => kw(&mut conditions, &tok),
            }
        } else if let Some(rest) = tok.strip_prefix("is:") {
            match status_value(rest) {
                Some(s) => conditions.push(RawCondition::Status(s.to_string())),
                None => kw(&mut conditions, &tok),
            }
        } else if let Some(rest) = tok.strip_prefix("type:") {
            match kind_value(rest) {
                Some(k) => conditions.push(RawCondition::Kind(k.to_string())),
                None => kw(&mut conditions, &tok),
            }
        } else {
            kw(&mut conditions, &tok);
        }
    }

    RawQuery { match_, conditions }
}

/// Resolve list/tag names to ids, producing a stored `Rule`. An unknown name
/// yields an empty id set (matches nothing) rather than an error.
pub async fn resolve(raw: RawQuery, pool: &SqlitePool) -> Result<Rule> {
    let mut conditions = Vec::with_capacity(raw.conditions.len());
    for rc in raw.conditions {
        let cond = match rc {
            RawCondition::ListName(name) => {
                let ids = sqlx::query_scalar(
                    "SELECT id FROM projects WHERE name = ? AND deleted_at IS NULL",
                )
                .bind(&name)
                .fetch_all(pool)
                .await?;
                Condition::List { ids }
            }
            RawCondition::TagName(name) => {
                let ids = sqlx::query_scalar(
                    "SELECT id FROM tags WHERE name = ? AND deleted_at IS NULL",
                )
                .bind(&name)
                .fetch_all(pool)
                .await?;
                Condition::Tag { ids }
            }
            RawCondition::Priority(p) => Condition::Priority { values: vec![p] },
            RawCondition::Due(op) => Condition::Due { op },
            RawCondition::Keyword(text) => Condition::Keyword { text },
            RawCondition::Kind(k) => Condition::Kind { values: vec![k] },
            RawCondition::Status(s) => Condition::Status { values: vec![s] },
        };
        conditions.push(cond);
    }
    Ok(Rule { match_: raw.match_, conditions })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn parsed(text: &str) -> RawQuery {
        parse(text)
    }

    #[test]
    fn combines_tag_priority_and_due_with_and() {
        assert_eq!(
            parsed("#work priority:high due:today"),
            RawQuery {
                match_: Match::All,
                conditions: vec![
                    RawCondition::TagName("work".into()),
                    RawCondition::Priority(5),
                    RawCondition::Due(DueOp::Today),
                ],
            }
        );
    }

    #[test]
    fn or_switches_the_combinator() {
        assert_eq!(
            parsed("list:Home OR list:Errands"),
            RawQuery {
                match_: Match::Any,
                conditions: vec![
                    RawCondition::ListName("Home".into()),
                    RawCondition::ListName("Errands".into()),
                ],
            }
        );
    }

    #[test]
    fn quoted_phrase_is_one_keyword() {
        assert_eq!(
            parsed("\"buy milk\" #groceries"),
            RawQuery {
                match_: Match::All,
                conditions: vec![
                    RawCondition::Keyword("buy milk".into()),
                    RawCondition::TagName("groceries".into()),
                ],
            }
        );
    }

    #[test]
    fn shorthand_bang_and_tilde() {
        assert_eq!(
            parsed("!high ~Work"),
            RawQuery {
                match_: Match::All,
                conditions: vec![RawCondition::Priority(5), RawCondition::ListName("Work".into())],
            }
        );
    }

    #[test]
    fn quoted_list_value_keeps_spaces() {
        assert_eq!(
            parsed("list:\"My List\""),
            RawQuery {
                match_: Match::All,
                conditions: vec![RawCondition::ListName("My List".into())],
            }
        );
    }

    #[test]
    fn unknown_prefix_becomes_keyword() {
        assert_eq!(
            parsed("foo:bar priority:banana"),
            RawQuery {
                match_: Match::All,
                conditions: vec![
                    RawCondition::Keyword("foo:bar".into()),
                    RawCondition::Keyword("priority:banana".into()),
                ],
            }
        );
    }
}
