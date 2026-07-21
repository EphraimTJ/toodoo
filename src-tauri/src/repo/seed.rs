//! Fixture data: the dev-only 10k perf fixture (`seed_demo_data`) and the
//! user-facing, feature-complete sample workspace (`seed_sample_data`).

use chrono::{Duration, SecondsFormat, Utc};
use sqlx::SqlitePool;

use crate::error::{RepoError, Result};
use crate::events::{DomainEvent, EventBus};

use super::filter_rule::{Condition, DueOp, Rule};
use super::habits::{Freq, HabitInput};
use super::projects::{NewProject, ProjectPatch};
use super::tasks::NewTask;
use super::templates::TemplatePayload;
use super::{append_changelog, new_id, now, ChangeOp};

/// Insert `projects_n` projects with `tasks_n` tasks spread across them.
/// Everything goes through one transaction with changelog rows (batched
/// payloads), then a single `seed.completed` event.
pub async fn seed_demo_data(
    pool: &SqlitePool,
    bus: &EventBus,
    projects_n: usize,
    tasks_n: usize,
) -> Result<()> {
    let ts = now();
    let mut tx = pool.begin().await?;

    let mut project_ids = Vec::with_capacity(projects_n);
    for i in 0..projects_n {
        let id = new_id();
        sqlx::query(
            "INSERT INTO projects (id, name, kind, view_mode, muted, sort_order, closed,
                                   created_at, updated_at)
             VALUES (?, ?, 'TASK', 'LIST', 0, ?, 0, ?, ?)",
        )
        .bind(&id)
        .bind(format!("Seed project {i}"))
        .bind((i as i64) + 100)
        .bind(&ts)
        .bind(&ts)
        .execute(&mut *tx)
        .await?;
        project_ids.push(id);
    }

    for i in 0..tasks_n {
        let id = new_id();
        let project = &project_ids[i % project_ids.len()];
        // Spread due dates over ±30 days around today; every 5th task undated.
        let due = if i % 5 == 0 {
            None
        } else {
            let offset_days = (i as i64 % 61) - 30;
            Some(format!("date('now', '{offset_days} day')"))
        };
        let due_sql = match &due {
            Some(expr) => format!("{expr} || 'T00:00:00.000Z'"),
            None => "NULL".to_string(),
        };
        sqlx::query(&format!(
            "INSERT INTO tasks (id, project_id, title, kind, status, priority, due_at,
                                is_all_day, pinned, sort_orders_json, created_at, updated_at)
             VALUES (?, ?, ?, 'TASK', 'ACTIVE', ?, {due_sql}, 1, 0,
                     json_object('project', ?), ?, ?)"
        ))
        .bind(&id)
        .bind(project)
        .bind(format!("Seed task {i} — lorem ipsum dolor"))
        .bind([0i64, 1, 3, 5][i % 4])
        .bind(((i as i64) + 1) * 1024)
        .bind(&ts)
        .bind(&ts)
        .execute(&mut *tx)
        .await?;
    }

    append_changelog(
        &mut tx,
        "seed",
        "seed",
        ChangeOp::Insert,
        &serde_json::json!({ "projects": projects_n, "tasks": tasks_n }),
    )
    .await?;
    tx.commit().await?;
    bus.emit(DomainEvent::SeedCompleted);
    Ok(())
}

/// A minimal `NewTask` for the sample seed.
fn t(project_id: &str, title: &str) -> NewTask {
    NewTask {
        project_id: project_id.to_string(),
        parent_id: None,
        title: title.to_string(),
        priority: None,
        start_at: None,
        due_at: None,
        is_all_day: None,
        duration_min: None,
        time_zone: None,
        rrule: None,
        repeat_from: None,
        kind: None,
    }
}

/// Seed a deterministic, feature-complete sample workspace through the normal
/// repository functions (every invariant, changelog row, and event holds).
/// Exercises: tasks in every date bucket (overdue/today/tomorrow/next-week/
/// undated), timed + all-day + durations, every priority, subtask nesting,
/// check items, nested tags, recurring daily/weekly/monthly-last-Friday,
/// reminders a few minutes out, templates, comments, a kanban project with
/// sections, a NOTE list, stickies, filters, habits with back-dated streaks,
/// focus history, countdowns, saved/recent searches, and completions that
/// feed stats/achievements. Attachments are N/A (feature deferred — no repo
/// layer exists). Titles/structure are fixed; dates are relative to today.
///
/// Refuses to touch a non-empty workspace unless `force` (the Settings →
/// Advanced action confirms first; the first-run prompt only shows when
/// empty).
pub async fn seed_sample_data(pool: &SqlitePool, bus: &EventBus, force: bool) -> Result<()> {
    let existing: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM tasks WHERE deleted_at IS NULL")
        .fetch_one(pool)
        .await?;
    if existing > 0 && !force {
        return Err(RepoError::Invalid(
            "the workspace already has tasks — sample data must be loaded explicitly (force)".into(),
        ));
    }

    use super::{
        check_items, comments, filters, focus, habits, projects, reminders, saved_searches,
        search, sections, sticky_notes, tags, tasks, templates,
    };

    let now_utc = Utc::now();
    let day = |d: i64| (now_utc + Duration::days(d)).format("%Y-%m-%dT00:00:00.000Z").to_string();
    let at = |d: i64, h: u32, m: u32| {
        format!("{}T{h:02}:{m:02}:00.000Z", (now_utc + Duration::days(d)).format("%Y-%m-%d"))
    };
    let in_min =
        |m: i64| (now_utc + Duration::minutes(m)).to_rfc3339_opts(SecondsFormat::Millis, true);
    let date_only = |d: i64| (now_utc + Duration::days(d)).format("%Y-%m-%d").to_string();

    // ---- Projects ----------------------------------------------------------
    let work = projects::create_project(
        pool,
        bus,
        NewProject { name: "Work".into(), color: Some("#4f9cf9".into()), icon: None, kind: None },
    )
    .await?;
    projects::update_project(
        pool,
        bus,
        &work.id,
        ProjectPatch { view_mode: Some("KANBAN".into()), ..Default::default() },
    )
    .await?;
    let personal = projects::create_project(
        pool,
        bus,
        NewProject { name: "Personal".into(), color: Some("#7ed3b2".into()), icon: None, kind: None },
    )
    .await?;
    let notes_list = projects::create_project(
        pool,
        bus,
        NewProject {
            name: "Reading Notes".into(),
            color: Some("#ffd97d".into()),
            icon: None,
            kind: Some("NOTE".into()),
        },
    )
    .await?;

    // ---- Nested tags (resolve-or-create: tag names are unique, and a forced
    // re-seed must not fail on them) ----------------------------------------
    async fn tag_id(
        pool: &SqlitePool,
        bus: &EventBus,
        name: &str,
        color: Option<&str>,
    ) -> Result<String> {
        let existing: Option<String> = sqlx::query_scalar(
            "SELECT id FROM tags WHERE lower(name) = lower(?) AND deleted_at IS NULL",
        )
        .bind(name)
        .fetch_optional(pool)
        .await?;
        match existing {
            Some(id) => Ok(id),
            None => Ok(super::tags::create_tag(pool, bus, name, color).await?.id),
        }
    }
    let tag_work = tag_id(pool, bus, "work", Some("#4f9cf9")).await?;
    let tag_deep = tag_id(pool, bus, "deep-work", None).await?;
    tags::set_tag_parent(pool, bus, &tag_deep, Some(&tag_work)).await?;
    let tag_home = tag_id(pool, bus, "home", Some("#7ed3b2")).await?;

    // ---- Date-bucket tasks (every priority, timed + all-day + duration) ----
    let overdue = tasks::create_task(
        pool,
        bus,
        NewTask {
            due_at: Some(at(-1, 17, 0)),
            is_all_day: Some(false),
            priority: Some(5),
            ..t(&personal.id, "Pay the electricity bill")
        },
    )
    .await?;
    tags::assign_tag(pool, bus, &overdue.id, &tag_home).await?;
    tasks::create_task(
        pool,
        bus,
        NewTask { due_at: Some(day(0)), priority: Some(3), ..t(&personal.id, "Water the plants") },
    )
    .await?;
    let timed_today = tasks::create_task(
        pool,
        bus,
        NewTask {
            due_at: Some(in_min(120)),
            is_all_day: Some(false),
            duration_min: Some(45),
            priority: Some(1),
            ..t(&work.id, "Review the quarterly report")
        },
    )
    .await?;
    tags::assign_tag(pool, bus, &timed_today.id, &tag_deep).await?;
    tasks::create_task(
        pool,
        bus,
        NewTask { due_at: Some(day(1)), priority: Some(0), ..t(&personal.id, "Return the library books") },
    )
    .await?;
    tasks::create_task(
        pool,
        bus,
        NewTask { due_at: Some(day(5)), priority: Some(3), ..t(&work.id, "Prepare the demo script") },
    )
    .await?;
    tasks::create_task(pool, bus, t(&personal.id, "Research summer trip ideas")).await?;

    // ---- Subtask nesting ---------------------------------------------------
    let offsite = tasks::create_task(
        pool,
        bus,
        NewTask { due_at: Some(day(7)), priority: Some(5), ..t(&work.id, "Plan the team offsite") },
    )
    .await?;
    let venue = tasks::create_task(
        pool,
        bus,
        NewTask { parent_id: Some(offsite.id.clone()), ..t(&work.id, "Book the venue") },
    )
    .await?;
    tasks::create_task(
        pool,
        bus,
        NewTask { parent_id: Some(venue.id.clone()), ..t(&work.id, "Compare three quotes") },
    )
    .await?;
    tasks::create_task(
        pool,
        bus,
        NewTask { parent_id: Some(offsite.id.clone()), ..t(&work.id, "Send the invite list") },
    )
    .await?;

    // ---- Check items -------------------------------------------------------
    let packing = tasks::create_task(
        pool,
        bus,
        NewTask { due_at: Some(day(6)), kind: Some("CHECKLIST".into()), ..t(&personal.id, "Pack for the trip") },
    )
    .await?;
    let passport = check_items::add_check_item(pool, bus, &packing.id, "Passport").await?;
    check_items::add_check_item(pool, bus, &packing.id, "Chargers").await?;
    check_items::add_check_item(pool, bus, &packing.id, "Hiking boots").await?;
    check_items::set_check_item(pool, bus, &passport.id, None, Some(true)).await?;

    // ---- Content + comments ------------------------------------------------
    let spec = tasks::create_task(
        pool,
        bus,
        NewTask { due_at: Some(day(3)), priority: Some(3), ..t(&work.id, "Draft the v2 spec") },
    )
    .await?;
    tasks::update_task(
        pool,
        bus,
        &spec.id,
        super::tasks::TaskPatch {
            content_plain: Some(Some("Cover goals, scope, and open questions.".into())),
            ..Default::default()
        },
    )
    .await?;
    comments::add_comment(pool, bus, &spec.id, "Remember to loop in design early.").await?;
    comments::add_comment(pool, bus, &spec.id, "Deadline moved to Friday.").await?;

    // ---- Recurring: daily / weekly / monthly-last-Friday -------------------
    tasks::create_task(
        pool,
        bus,
        NewTask { due_at: Some(day(0)), rrule: Some("FREQ=DAILY".into()), ..t(&personal.id, "Journal for five minutes") },
    )
    .await?;
    tasks::create_task(
        pool,
        bus,
        NewTask {
            due_at: Some(day(0)),
            rrule: Some("FREQ=WEEKLY;BYDAY=MO".into()),
            repeat_from: Some("DUE".into()),
            ..t(&work.id, "Weekly planning")
        },
    )
    .await?;
    tasks::create_task(
        pool,
        bus,
        NewTask {
            due_at: Some(day(0)),
            rrule: Some("FREQ=MONTHLY;BYDAY=-1FR".into()),
            ..t(&work.id, "Submit the expense report (last Friday)")
        },
    )
    .await?;

    // ---- Reminders a few minutes out --------------------------------------
    let standup = tasks::create_task(
        pool,
        bus,
        NewTask {
            due_at: Some(in_min(5)),
            is_all_day: Some(false),
            priority: Some(5),
            ..t(&work.id, "Stand-up call (fires a reminder in ~5 min)")
        },
    )
    .await?;
    reminders::add_reminder(pool, bus, &standup.id, "REL", None, Some(0)).await?;
    let stretch = tasks::create_task(
        pool,
        bus,
        NewTask { ..t(&personal.id, "Stretch break (reminder in ~3 min)") },
    )
    .await?;
    reminders::add_reminder(pool, bus, &stretch.id, "ABS", Some(&in_min(3)), None).await?;

    // ---- Kanban sections ---------------------------------------------------
    let doing = sections::create_section(pool, bus, &work.id, "In progress").await?;
    let backlog = sections::create_section(pool, bus, &work.id, "Backlog").await?;
    sections::move_task_to_section(pool, bus, &timed_today.id, Some(&doing.id)).await?;
    sections::move_task_to_section(pool, bus, &spec.id, Some(&backlog.id)).await?;

    // ---- Notes + stickies --------------------------------------------------
    tasks::create_task(
        pool,
        bus,
        NewTask { kind: Some("NOTE".into()), ..t(&notes_list.id, "Atomic Habits — key takeaways") },
    )
    .await?;
    tasks::create_task(
        pool,
        bus,
        NewTask { kind: Some("NOTE".into()), ..t(&notes_list.id, "Podcast list for the commute") },
    )
    .await?;
    sticky_notes::new_quick(pool, bus, "Call the dentist about Thursday", None).await?;
    sticky_notes::new_quick(pool, bus, "Wi-Fi guest password: sunflower42", Some("#a8e6cf")).await?;

    // ---- Filters + saved/recent searches -----------------------------------
    filters::create_filter(
        pool,
        bus,
        "High priority",
        &Rule::all(vec![Condition::Priority { values: vec![5] }]),
        Some("#ef6b73"),
    )
    .await?;
    filters::create_filter(
        pool,
        bus,
        "Due this week",
        &Rule::all(vec![Condition::Due { op: DueOp::Next7 }]),
        None,
    )
    .await?;
    saved_searches::create_saved_search(pool, bus, "offsite", None).await?;
    search::add_recent_search(pool, bus, "report").await?;
    search::add_recent_search(pool, bus, "plants").await?;

    // ---- Templates ---------------------------------------------------------
    templates::create_template(
        pool,
        bus,
        "Weekly review",
        &TemplatePayload {
            title: "Weekly review".into(),
            content_rich: None,
            content_plain: Some("Close the week, plan the next.".into()),
            priority: Some(3),
            is_all_day: Some(true),
            duration_min: None,
            time_zone: None,
            rrule: None,
            repeat_from: None,
            check_items: vec!["Clear the inbox".into(), "Review goals".into(), "Plan top 3".into()],
            reminders: vec![],
        },
    )
    .await?;

    // ---- Habits with back-dated streaks ------------------------------------
    let water = habits::create_habit(
        pool,
        bus,
        HabitInput {
            name: "Drink water".into(),
            icon: Some("💧".into()),
            color: Some("#4f9cf9".into()),
            quote: None,
            goal_kind: "CHECK".into(),
            goal_amount: None,
            unit: None,
            freq: Freq::Daily,
            section: None,
            reminders: vec![],
            start_date: Some(date_only(-10)),
            goal_days: None,
            auto_log_popup: false,
        },
    )
    .await?;
    for d in 1..=5 {
        habits::record_checkin(pool, bus, &water.id, &date_only(-d), "DONE", None, None).await?;
    }
    let run = habits::create_habit(
        pool,
        bus,
        HabitInput {
            name: "Run".into(),
            icon: Some("🏃".into()),
            color: Some("#7ed3b2".into()),
            quote: Some("One step at a time.".into()),
            goal_kind: "AMOUNT".into(),
            goal_amount: Some(5.0),
            unit: Some("km".into()),
            freq: Freq::Weekly { times: 3 },
            section: None,
            reminders: vec![],
            start_date: Some(date_only(-14)),
            goal_days: Some(66),
            auto_log_popup: false,
        },
    )
    .await?;
    habits::record_checkin(pool, bus, &run.id, &date_only(-2), "DONE", Some(6.0), None).await?;
    habits::record_checkin(pool, bus, &run.id, &date_only(-4), "DONE", Some(5.5), None).await?;

    // ---- Focus history -----------------------------------------------------
    focus::add_manual_session(pool, bus, Some(&spec.id), "POMO", &at(-1, 9, 0), &at(-1, 9, 25), None)
        .await?;
    focus::add_manual_session(
        pool,
        bus,
        None,
        "STOPWATCH",
        &in_min(-90),
        &in_min(-60),
        Some("Reading"),
    )
    .await?;

    // ---- Countdowns --------------------------------------------------------
    super::countdowns::create_countdown(pool, bus, "Product launch", &date_only(30), false, None)
        .await?;
    super::countdowns::create_countdown(pool, bus, "Wedding anniversary", &date_only(-200), true, None)
        .await?;

    // ---- Completions so stats/achievements are non-empty -------------------
    for (title, due_days) in
        [("Book flights", 1i64), ("Refill the coffee beans", -2), ("Answer the survey", 0)]
    {
        let done = tasks::create_task(
            pool,
            bus,
            NewTask { due_at: Some(day(due_days)), ..t(&personal.id, title) },
        )
        .await?;
        tasks::complete_task(pool, bus, &done.id, 0).await?;
    }

    bus.emit(DomainEvent::SeedCompleted);
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::repo::db::connect_in_memory;

    #[tokio::test]
    async fn seeds_projects_and_tasks() {
        let pool = connect_in_memory().await.unwrap();
        let bus = EventBus::new();
        seed_demo_data(&pool, &bus, 5, 200).await.unwrap();

        let projects: i64 =
            sqlx::query_scalar("SELECT COUNT(*) FROM projects WHERE name LIKE 'Seed project%'")
                .fetch_one(&pool)
                .await
                .unwrap();
        let tasks: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM tasks")
            .fetch_one(&pool)
            .await
            .unwrap();
        assert_eq!(projects, 5);
        assert_eq!(tasks, 200);
    }

    #[tokio::test]
    async fn sample_data_exercises_every_feature_and_guards_non_empty() {
        let pool = connect_in_memory().await.unwrap();
        let bus = EventBus::new();
        seed_sample_data(&pool, &bus, false).await.unwrap();

        let count = |sql: &str| {
            let sql = sql.to_string();
            let pool = pool.clone();
            async move { sqlx::query_scalar::<_, i64>(&sql).fetch_one(&pool).await.unwrap() }
        };

        // Date buckets + shapes.
        assert!(count("SELECT COUNT(*) FROM tasks WHERE due_at < datetime('now') AND status='ACTIVE'").await >= 1, "overdue");
        assert!(count("SELECT COUNT(*) FROM tasks WHERE due_at IS NULL AND status='ACTIVE' AND kind='TASK'").await >= 1, "undated");
        assert!(count("SELECT COUNT(*) FROM tasks WHERE is_all_day = 0").await >= 2, "timed");
        assert!(count("SELECT COUNT(*) FROM tasks WHERE duration_min IS NOT NULL").await >= 1, "duration");
        for p in [0, 1, 3, 5] {
            assert!(count(&format!("SELECT COUNT(*) FROM tasks WHERE priority = {p}")).await >= 1, "priority {p}");
        }
        // Structure.
        assert!(count("SELECT COUNT(*) FROM tasks WHERE parent_id IS NOT NULL").await >= 3, "subtasks");
        assert!(count("SELECT COUNT(*) FROM check_items WHERE deleted_at IS NULL").await >= 3, "check items");
        assert!(count("SELECT COUNT(*) FROM check_items WHERE done = 1").await >= 1, "done check item");
        assert!(count("SELECT COUNT(*) FROM tags WHERE parent_id IS NOT NULL").await >= 1, "nested tag");
        assert!(count("SELECT COUNT(*) FROM task_tags WHERE deleted_at IS NULL").await >= 2, "tag assignments");
        // Recurrence + reminders.
        assert!(count("SELECT COUNT(*) FROM tasks WHERE rrule IS NOT NULL AND rrule != ''").await >= 3, "recurring");
        assert!(count("SELECT COUNT(*) FROM tasks WHERE rrule LIKE '%BYDAY=-1FR%'").await >= 1, "last-friday rule");
        assert!(count("SELECT COUNT(*) FROM reminders WHERE deleted_at IS NULL").await >= 2, "reminders");
        // Surfaces.
        assert!(count("SELECT COUNT(*) FROM sections WHERE deleted_at IS NULL").await >= 2, "sections");
        assert!(count("SELECT COUNT(*) FROM projects WHERE view_mode = 'KANBAN'").await >= 1, "kanban project");
        assert!(count("SELECT COUNT(*) FROM projects WHERE kind = 'NOTE'").await >= 1, "note list");
        assert!(count("SELECT COUNT(*) FROM tasks WHERE kind = 'NOTE'").await >= 2, "notes");
        assert!(count("SELECT COUNT(*) FROM sticky_notes WHERE deleted_at IS NULL").await >= 2, "stickies");
        assert!(count("SELECT COUNT(*) FROM filters WHERE deleted_at IS NULL").await >= 2, "filters");
        assert!(count("SELECT COUNT(*) FROM saved_searches WHERE deleted_at IS NULL").await >= 1, "saved search");
        assert!(count("SELECT COUNT(*) FROM task_templates WHERE deleted_at IS NULL").await >= 1, "template");
        assert!(count("SELECT COUNT(*) FROM comments WHERE deleted_at IS NULL").await >= 2, "comments");
        // Habits / focus / countdowns / stats.
        assert!(count("SELECT COUNT(*) FROM habits WHERE deleted_at IS NULL").await >= 2, "habits");
        assert!(count("SELECT COUNT(*) FROM habit_checkins WHERE deleted_at IS NULL").await >= 6, "checkins");
        assert!(count("SELECT COUNT(*) FROM focus_sessions WHERE deleted_at IS NULL").await >= 2, "focus sessions");
        assert!(count("SELECT COUNT(*) FROM countdowns WHERE deleted_at IS NULL").await >= 2, "countdowns");
        assert!(count("SELECT COUNT(*) FROM task_completions WHERE deleted_at IS NULL").await >= 3, "completions");
        assert!(count("SELECT COUNT(*) FROM achievements").await >= 3, "achievement points");

        // Guard: a non-empty workspace refuses without force, allows with it.
        let err = seed_sample_data(&pool, &bus, false).await;
        assert!(err.is_err(), "must refuse to seed a non-empty workspace");
        seed_sample_data(&pool, &bus, true).await.unwrap();
    }
}
