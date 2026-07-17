//! CSV importers for TickTick backups, Todoist exports, and generic CSV. The
//! parsers are pure and unit-tested — column mapping, priority/date/status
//! normalization, quoting and embedded newlines are the tricky parts. Parsed
//! rows are inserted through the repo layer by `import_tasks`.

use std::collections::HashMap;

use csv::{ReaderBuilder, StringRecord};
use serde::Serialize;
use sqlx::SqlitePool;

use crate::error::Result;
use crate::events::{DomainEvent, EventBus};

use super::projects::{create_project_core, NewProject};
use super::tags::{assign_tag_core, create_tag_core};
use super::tasks::{complete_imported_core, create_task_core, NewTask};

/// A source-agnostic imported task, ready to be inserted.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportTask {
    /// List/project name; empty means Inbox.
    pub list: String,
    pub title: String,
    pub content: Option<String>,
    /// Toodoo/TickTick priority (0/1/3/5).
    pub priority: Option<i64>,
    pub due_at: Option<String>,
    pub start_at: Option<String>,
    pub completed: bool,
    pub tags: Vec<String>,
}

/// Which importer to run.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ImportKind {
    TickTick,
    Todoist,
    Generic,
}

impl ImportKind {
    pub fn parse(s: &str) -> Option<Self> {
        match s.to_ascii_lowercase().as_str() {
            "ticktick" => Some(Self::TickTick),
            "todoist" => Some(Self::Todoist),
            "generic" | "csv" => Some(Self::Generic),
            _ => None,
        }
    }
}

pub fn parse_csv(kind: ImportKind, text: &str) -> Vec<ImportTask> {
    match kind {
        ImportKind::TickTick => parse_ticktick_csv(text),
        ImportKind::Todoist => parse_todoist_csv(text),
        ImportKind::Generic => parse_generic_csv(text),
    }
}

// ---- shared helpers ---------------------------------------------------------

/// Every record in the file, tolerating ragged rows (TickTick prepends metadata
/// lines with a different column count) and skipping malformed ones.
fn records(text: &str) -> Vec<StringRecord> {
    ReaderBuilder::new()
        .flexible(true)
        .has_headers(false)
        .from_reader(text.as_bytes())
        .records()
        .filter_map(|r| r.ok())
        .collect()
}

/// Index of the first record that contains all `must_have` field names (used to
/// skip TickTick's metadata preamble and find the real header).
fn header_index(recs: &[StringRecord], must_have: &[&str]) -> Option<usize> {
    recs.iter().position(|rec| {
        let fields: Vec<String> = rec.iter().map(|f| f.trim().to_lowercase()).collect();
        must_have.iter().all(|m| fields.iter().any(|f| f == m))
    })
}

fn col_map(header: &StringRecord) -> HashMap<String, usize> {
    header.iter().enumerate().map(|(i, h)| (h.trim().to_lowercase(), i)).collect()
}

/// First non-empty value among `keys` (already lowercased column names).
fn field<'a>(rec: &'a StringRecord, map: &HashMap<String, usize>, keys: &[&str]) -> Option<&'a str> {
    for k in keys {
        if let Some(&i) = map.get(*k) {
            if let Some(v) = rec.get(i) {
                let v = v.trim();
                if !v.is_empty() {
                    return Some(v);
                }
            }
        }
    }
    None
}

/// Normalize a date string: date-only `YYYY-MM-DD` gains a midnight UTC time;
/// anything already carrying a time (`T`) passes through untouched.
fn norm_date(s: &str) -> Option<String> {
    let s = s.trim();
    if s.is_empty() {
        return None;
    }
    if s.len() == 10 && s.as_bytes().get(4) == Some(&b'-') {
        return Some(format!("{s}T00:00:00.000Z"));
    }
    Some(s.to_string())
}

fn split_tags(s: &str) -> Vec<String> {
    s.split(',').map(|t| t.trim().to_string()).filter(|t| !t.is_empty()).collect()
}

// ---- TickTick ---------------------------------------------------------------

pub fn parse_ticktick_csv(text: &str) -> Vec<ImportTask> {
    let recs = records(text);
    let Some(h) = header_index(&recs, &["title"]) else { return Vec::new() };
    let map = col_map(&recs[h]);
    recs[h + 1..]
        .iter()
        .filter_map(|rec| {
            let title = field(rec, &map, &["title"])?.to_string();
            Some(ImportTask {
                list: field(rec, &map, &["list name", "list"]).unwrap_or("").to_string(),
                title,
                content: field(rec, &map, &["content", "notes"]).map(str::to_string),
                priority: field(rec, &map, &["priority"]).and_then(|s| s.parse().ok()),
                due_at: field(rec, &map, &["due date", "duedate", "due"]).and_then(norm_date),
                start_at: field(rec, &map, &["start date", "startdate", "start"]).and_then(norm_date),
                completed: field(rec, &map, &["status"]) == Some("2"),
                tags: field(rec, &map, &["tags"]).map(split_tags).unwrap_or_default(),
            })
        })
        .collect()
}

// ---- Todoist ----------------------------------------------------------------

/// Todoist CSV priority (1..4, 4 = highest) → Toodoo 0/1/3/5.
fn todoist_priority(n: i64) -> i64 {
    match n {
        4 => 5,
        3 => 3,
        2 => 1,
        _ => 0,
    }
}

pub fn parse_todoist_csv(text: &str) -> Vec<ImportTask> {
    let recs = records(text);
    let Some(h) = header_index(&recs, &["type", "content"]) else { return Vec::new() };
    let map = col_map(&recs[h]);
    recs[h + 1..]
        .iter()
        .filter_map(|rec| {
            // Only "task" rows are tasks (skip "section"/blank separators).
            if field(rec, &map, &["type"]) != Some("task") {
                return None;
            }
            let title = field(rec, &map, &["content"])?.to_string();
            Some(ImportTask {
                list: String::new(), // Todoist exports one project per file; land in Inbox.
                title,
                content: field(rec, &map, &["description"]).map(str::to_string),
                priority: field(rec, &map, &["priority"]).and_then(|s| s.parse().ok()).map(todoist_priority),
                due_at: field(rec, &map, &["date", "due"]).and_then(norm_date),
                start_at: None,
                completed: false,
                tags: Vec::new(),
            })
        })
        .collect()
}

// ---- Generic ----------------------------------------------------------------

fn generic_priority(s: &str) -> Option<i64> {
    if let Ok(n) = s.parse::<i64>() {
        return matches!(n, 0 | 1 | 3 | 5).then_some(n);
    }
    match s.to_ascii_lowercase().as_str() {
        "high" => Some(5),
        "medium" | "med" => Some(3),
        "low" => Some(1),
        "none" => Some(0),
        _ => None,
    }
}

fn truthy(s: &str) -> bool {
    matches!(s.to_ascii_lowercase().as_str(), "1" | "true" | "yes" | "x" | "done" | "completed")
}

pub fn parse_generic_csv(text: &str) -> Vec<ImportTask> {
    let recs = records(text);
    if recs.is_empty() {
        return Vec::new();
    }
    let map = col_map(&recs[0]); // the first row is the header
    recs[1..]
        .iter()
        .filter_map(|rec| {
            let title = field(rec, &map, &["title", "name", "task"])?.to_string();
            Some(ImportTask {
                list: field(rec, &map, &["list", "project"]).unwrap_or("").to_string(),
                title,
                content: field(rec, &map, &["content", "notes", "description"]).map(str::to_string),
                priority: field(rec, &map, &["priority"]).and_then(generic_priority),
                due_at: field(rec, &map, &["due", "due date", "duedate"]).and_then(norm_date),
                start_at: field(rec, &map, &["start", "start date", "startdate"]).and_then(norm_date),
                completed: field(rec, &map, &["completed", "done", "status"]).is_some_and(truthy),
                tags: field(rec, &map, &["tags"]).map(split_tags).unwrap_or_default(),
            })
        })
        .collect()
}

// ---- insertion --------------------------------------------------------------

/// Resolve a list name to a project id, creating the list if missing. Empty or
/// "inbox" (any case) maps to the seeded Inbox.
/// Resolve a list name to a project id inside the import transaction, creating
/// the project (and queuing its event) if missing. Empty / "inbox" → Inbox.
async fn resolve_project_tx(
    conn: &mut sqlx::SqliteConnection,
    name: &str,
    events: &mut Vec<DomainEvent>,
) -> Result<String> {
    let name = name.trim();
    if name.is_empty() || name.eq_ignore_ascii_case("inbox") {
        return Ok("inbox".to_string());
    }
    let existing: Option<String> = sqlx::query_scalar(
        "SELECT id FROM projects WHERE name = ? COLLATE NOCASE AND deleted_at IS NULL LIMIT 1",
    )
    .bind(name)
    .fetch_optional(&mut *conn)
    .await?;
    if let Some(id) = existing {
        return Ok(id);
    }
    let id = create_project_core(
        conn,
        &NewProject { name: name.to_string(), color: None, icon: None, kind: None },
    )
    .await?;
    events.push(DomainEvent::ProjectCreated { id: id.clone() });
    Ok(id)
}

/// Resolve a tag name to a tag id inside the import transaction, creating the
/// tag (and queuing its event) if missing. Empty names resolve to `None`.
async fn resolve_tag_tx(
    conn: &mut sqlx::SqliteConnection,
    name: &str,
    events: &mut Vec<DomainEvent>,
) -> Result<Option<String>> {
    let name = name.trim();
    if name.is_empty() {
        return Ok(None);
    }
    let existing: Option<String> = sqlx::query_scalar(
        "SELECT id FROM tags WHERE lower(name) = lower(?) AND deleted_at IS NULL LIMIT 1",
    )
    .bind(name)
    .fetch_optional(&mut *conn)
    .await?;
    if let Some(id) = existing {
        return Ok(Some(id));
    }
    let (id, _) = create_tag_core(conn, name, None).await?;
    events.push(DomainEvent::TagCreated { id: id.clone() });
    Ok(Some(id))
}

/// Insert imported rows (append-only; lists created by name). Tasks marked
/// completed are created then completed; parsed tags are resolved or created
/// (case-insensitive by name) and assigned. Returns the number of tasks
/// inserted.
///
/// The whole import runs in **one transaction**: if any row fails, nothing is
/// persisted — no orphaned tasks, projects, or tags from a partial import
/// (docs/decisions.md). Domain events are queued and emitted only after the
/// commit.
pub async fn import_tasks(pool: &SqlitePool, bus: &EventBus, rows: Vec<ImportTask>) -> Result<usize> {
    let mut tx = pool.begin().await?;
    let mut events: Vec<DomainEvent> = Vec::new();
    // Cache resolved list/tag names so each is looked up / created once.
    let mut project_ids: HashMap<String, String> = HashMap::new();
    let mut tag_ids: HashMap<String, Option<String>> = HashMap::new();
    let mut count = 0;
    for row in rows {
        let key = row.list.trim().to_lowercase();
        let project_id = match project_ids.get(&key) {
            Some(id) => id.clone(),
            None => {
                let id = resolve_project_tx(&mut tx, &row.list, &mut events).await?;
                project_ids.insert(key, id.clone());
                id
            }
        };
        let task_id = create_task_core(
            &mut tx,
            &NewTask {
                project_id,
                parent_id: None,
                title: row.title,
                priority: row.priority,
                start_at: row.start_at.clone(),
                due_at: row.due_at.clone(),
                is_all_day: None,
                duration_min: None,
                time_zone: None,
                rrule: None,
                repeat_from: None,
                kind: None,
            },
            row.content.as_deref(),
        )
        .await?;
        events.push(DomainEvent::TaskCreated { id: task_id.clone() });
        let mut assigned_any = false;
        for tag_name in &row.tags {
            let tag_key = tag_name.trim().to_lowercase();
            let tag_id = match tag_ids.get(&tag_key) {
                Some(cached) => cached.clone(),
                None => {
                    let id = resolve_tag_tx(&mut tx, tag_name, &mut events).await?;
                    tag_ids.insert(tag_key, id.clone());
                    id
                }
            };
            if let Some(tag_id) = tag_id {
                assign_tag_core(&mut tx, &task_id, &tag_id).await?;
                assigned_any = true;
            }
        }
        if assigned_any {
            events.push(DomainEvent::TaskTagsChanged { task_id: task_id.clone() });
        }
        if row.completed {
            complete_imported_core(&mut tx, &task_id, row.due_at.as_deref(), row.start_at.as_deref())
                .await?;
            events.push(DomainEvent::TaskCompleted { ids: vec![task_id] });
        }
        count += 1;
    }
    tx.commit().await?;

    for event in events {
        bus.emit(event);
    }
    Ok(count)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::repo::db::connect_in_memory;
    use crate::repo::projects::list_projects;

    #[test]
    fn ticktick_row_with_quoted_comma_dates_and_completed() {
        let csv = "\"Date: 2024-01-01\"\n\"Version: 7.1\"\n\n\
\"Folder Name\",\"List Name\",\"Title\",\"Tags\",\"Content\",\"Priority\",\"Status\",\"Due Date\",\"Start Date\"\n\
\"\",\"Work\",\"Ship v1, then celebrate\",\"urgent,release\",\"Notes here\",\"5\",\"0\",\"2024-03-10T09:00:00+0000\",\"\"\n\
\"\",\"Personal\",\"Buy milk\",\"\",\"\",\"0\",\"2\",\"2024-03-11\",\"\"\n";
        let rows = parse_ticktick_csv(csv);
        assert_eq!(rows.len(), 2);
        assert_eq!(rows[0].list, "Work");
        assert_eq!(rows[0].title, "Ship v1, then celebrate");
        assert_eq!(rows[0].content.as_deref(), Some("Notes here"));
        assert_eq!(rows[0].priority, Some(5));
        assert_eq!(rows[0].due_at.as_deref(), Some("2024-03-10T09:00:00+0000"));
        assert!(!rows[0].completed);
        assert_eq!(rows[0].tags, vec!["urgent", "release"]);

        assert_eq!(rows[1].title, "Buy milk");
        assert_eq!(rows[1].priority, Some(0));
        assert_eq!(rows[1].due_at.as_deref(), Some("2024-03-11T00:00:00.000Z")); // date-only normalized
        assert!(rows[1].completed); // status 2
    }

    #[test]
    fn todoist_maps_priority_and_skips_sections() {
        let csv = "TYPE,CONTENT,DESCRIPTION,PRIORITY,DATE\n\
task,Write report,Some notes,4,2024-03-10\n\
section,My Section,,,\n\
task,Low prio thing,,2,\n";
        let rows = parse_todoist_csv(csv);
        assert_eq!(rows.len(), 2);
        assert_eq!(rows[0].title, "Write report");
        assert_eq!(rows[0].content.as_deref(), Some("Some notes"));
        assert_eq!(rows[0].priority, Some(5)); // Todoist 4 → 5
        assert_eq!(rows[0].due_at.as_deref(), Some("2024-03-10T00:00:00.000Z"));
        assert_eq!(rows[1].priority, Some(1)); // Todoist 2 → 1
        assert_eq!(rows[1].list, ""); // Inbox
    }

    #[test]
    fn generic_header_priorities_and_completed() {
        let csv = "title,list,priority,due,notes,completed\n\
\"Task A\",\"Groceries\",\"high\",\"2024-03-12\",\"Milk\",\"false\"\n\
\"Task B\",\"\",\"low\",\"\",\"\",\"true\"\n";
        let rows = parse_generic_csv(csv);
        assert_eq!(rows.len(), 2);
        assert_eq!(rows[0].list, "Groceries");
        assert_eq!(rows[0].priority, Some(5));
        assert_eq!(rows[0].content.as_deref(), Some("Milk"));
        assert!(!rows[0].completed);
        assert_eq!(rows[1].list, "");
        assert_eq!(rows[1].priority, Some(1));
        assert!(rows[1].completed);
    }

    #[test]
    fn quoted_embedded_newline_is_one_field() {
        let csv = "title,list\n\"Line one\nline two\",Work\n";
        let rows = parse_generic_csv(csv);
        assert_eq!(rows.len(), 1);
        assert_eq!(rows[0].title, "Line one\nline two");
        assert_eq!(rows[0].list, "Work");
    }

    #[test]
    fn blank_and_titleless_rows_are_skipped() {
        let csv = "title,list\n,Work\n\"Real\",Home\n";
        let rows = parse_generic_csv(csv);
        assert_eq!(rows.len(), 1);
        assert_eq!(rows[0].title, "Real");
    }

    #[tokio::test]
    async fn import_tasks_creates_lists_and_counts() {
        let pool = connect_in_memory().await.unwrap();
        let bus = EventBus::new();
        let rows = vec![
            ImportTask {
                list: "Work".into(),
                title: "A".into(),
                content: Some("notes".into()),
                priority: Some(3),
                due_at: None,
                start_at: None,
                completed: false,
                tags: vec![],
            },
            ImportTask {
                list: "Home".into(),
                title: "B".into(),
                content: None,
                priority: None,
                due_at: None,
                start_at: None,
                completed: true,
                tags: vec![],
            },
        ];
        let n = import_tasks(&pool, &bus, rows).await.unwrap();
        assert_eq!(n, 2);

        let names: Vec<String> = list_projects(&pool).await.unwrap().into_iter().map(|p| p.name).collect();
        assert!(names.contains(&"Work".to_string()));
        assert!(names.contains(&"Home".to_string()));

        // The completed row is COMPLETED.
        let done: i64 = sqlx::query_scalar(
            "SELECT COUNT(*) FROM tasks WHERE title = 'B' AND status = 'COMPLETED'",
        )
        .fetch_one(&pool)
        .await
        .unwrap();
        assert_eq!(done, 1);
    }

    /// docs/adversarial-review-findings.md finding 3 (non-atomic portion):
    /// the import runs in one transaction, so a failing row rolls back every
    /// earlier row and project — all-or-nothing.
    #[tokio::test]
    async fn import_tasks_partial_failure_leaves_earlier_rows_persisted() {
        let pool = connect_in_memory().await.unwrap();
        let bus = EventBus::new();
        let rows = vec![
            ImportTask {
                list: "Work".into(),
                title: "Persisted before failure".into(),
                content: None,
                priority: None,
                due_at: None,
                start_at: None,
                completed: false,
                tags: vec![],
            },
            ImportTask {
                list: "Work".into(),
                title: "Bad row".into(),
                content: None,
                // 2 is not a valid Toodoo priority (0/1/3/5) — create_task
                // rejects it, aborting the import partway through.
                priority: Some(2),
                due_at: None,
                start_at: None,
                completed: false,
                tags: vec![],
            },
        ];

        let result = import_tasks(&pool, &bus, rows).await;
        assert!(result.is_err(), "the malformed row should fail create_task");

        let n: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM tasks WHERE title = 'Persisted before failure'")
            .fetch_one(&pool)
            .await
            .unwrap();
        assert_eq!(n, 0, "import left a partially-inserted row after failing");
        // The project created for the first row must roll back too.
        let p: i64 = sqlx::query_scalar(
            "SELECT COUNT(*) FROM projects WHERE name = 'Work' AND deleted_at IS NULL",
        )
        .fetch_one(&pool)
        .await
        .unwrap();
        assert_eq!(p, 0, "import left an orphaned project after failing");
    }

    /// docs/adversarial-review-findings.md finding 4 (user-approved scope
    /// upgrade): parsed tags are attached on import — resolved or created by
    /// name, case-insensitively, each created at most once.
    #[tokio::test]
    async fn import_attaches_parsed_tags_creating_each_once() {
        let pool = connect_in_memory().await.unwrap();
        let bus = EventBus::new();
        let base = ImportTask {
            list: "Work".into(),
            title: String::new(),
            content: None,
            priority: None,
            due_at: None,
            start_at: None,
            completed: false,
            tags: vec![],
        };
        let rows = vec![
            ImportTask { title: "A".into(), tags: vec!["urgent".into(), "release".into()], ..base.clone() },
            // "Urgent" must reuse the tag created for the first row.
            ImportTask { title: "B".into(), tags: vec!["Urgent".into()], ..base },
        ];
        assert_eq!(import_tasks(&pool, &bus, rows).await.unwrap(), 2);

        let tags: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM tags WHERE deleted_at IS NULL")
            .fetch_one(&pool)
            .await
            .unwrap();
        assert_eq!(tags, 2, "case-insensitive reuse should create each tag once");
        let assigns: i64 =
            sqlx::query_scalar("SELECT COUNT(*) FROM task_tags WHERE deleted_at IS NULL")
                .fetch_one(&pool)
                .await
                .unwrap();
        assert_eq!(assigns, 3);
        let urgent_on_b: i64 = sqlx::query_scalar(
            "SELECT COUNT(*) FROM task_tags tt
             JOIN tasks t ON t.id = tt.task_id
             JOIN tags g ON g.id = tt.tag_id
             WHERE t.title = 'B' AND g.name = 'urgent' AND tt.deleted_at IS NULL",
        )
        .fetch_one(&pool)
        .await
        .unwrap();
        assert_eq!(urgent_on_b, 1);
    }
}
