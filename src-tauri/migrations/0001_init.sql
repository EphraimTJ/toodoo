-- 0001_init: full Toodoo schema (build plan §4.3) + sync future-proofing (§4.4).
-- Conventions (CLAUDE.md): TEXT UUID primary keys, created_at/updated_at on every
-- table, soft delete via deleted_at, all timestamps RFC 3339 TEXT (UTC).
-- Migrations are append-only: never edit this file after it ships.

------------------------------------------------------------------------------
-- Organization
------------------------------------------------------------------------------

CREATE TABLE folders (
    id          TEXT PRIMARY KEY,
    name        TEXT NOT NULL,
    color       TEXT,
    sort_order  INTEGER NOT NULL DEFAULT 0,
    created_at  TEXT NOT NULL,
    updated_at  TEXT NOT NULL,
    deleted_at  TEXT
);

CREATE TABLE projects (
    id          TEXT PRIMARY KEY,
    folder_id   TEXT REFERENCES folders(id),
    name        TEXT NOT NULL,
    color       TEXT,
    icon        TEXT,
    kind        TEXT NOT NULL DEFAULT 'TASK' CHECK (kind IN ('TASK', 'NOTE')),
    view_mode   TEXT NOT NULL DEFAULT 'LIST' CHECK (view_mode IN ('LIST', 'KANBAN', 'TIMELINE')),
    muted       INTEGER NOT NULL DEFAULT 0,
    sort_order  INTEGER NOT NULL DEFAULT 0,
    closed      INTEGER NOT NULL DEFAULT 0,
    created_at  TEXT NOT NULL,
    updated_at  TEXT NOT NULL,
    deleted_at  TEXT
);
CREATE INDEX idx_projects_folder ON projects(folder_id);

-- Kanban columns
CREATE TABLE sections (
    id          TEXT PRIMARY KEY,
    project_id  TEXT NOT NULL REFERENCES projects(id),
    name        TEXT NOT NULL,
    sort_order  INTEGER NOT NULL DEFAULT 0,
    created_at  TEXT NOT NULL,
    updated_at  TEXT NOT NULL,
    deleted_at  TEXT
);
CREATE INDEX idx_sections_project ON sections(project_id);

------------------------------------------------------------------------------
-- Tasks
------------------------------------------------------------------------------

CREATE TABLE tasks (
    id                TEXT PRIMARY KEY,
    project_id        TEXT NOT NULL REFERENCES projects(id),
    section_id        TEXT REFERENCES sections(id),
    parent_id         TEXT REFERENCES tasks(id),
    title             TEXT NOT NULL,
    content_rich      TEXT,
    kind              TEXT NOT NULL DEFAULT 'TASK' CHECK (kind IN ('TASK', 'CHECKLIST', 'NOTE')),
    status            TEXT NOT NULL DEFAULT 'ACTIVE'
                      CHECK (status IN ('ACTIVE', 'COMPLETED', 'WONT_DO', 'TRASHED')),
    -- Priority values mirror the TickTick Open API: 0 none, 1 low, 3 medium, 5 high.
    priority          INTEGER NOT NULL DEFAULT 0 CHECK (priority IN (0, 1, 3, 5)),
    start_at          TEXT,
    due_at            TEXT,
    is_all_day        INTEGER NOT NULL DEFAULT 1,
    duration_min      INTEGER,
    time_zone         TEXT,
    rrule             TEXT,
    repeat_from       TEXT CHECK (repeat_from IN ('COMPLETION', 'DUE')),
    pinned            INTEGER NOT NULL DEFAULT 0,
    est_pomos         INTEGER,
    est_duration_min  INTEGER,
    completed_at      TEXT,
    -- Per-context manual sort orders, e.g. {"project": 3, "today": 1}
    sort_orders_json  TEXT,
    created_at        TEXT NOT NULL,
    updated_at        TEXT NOT NULL,
    deleted_at        TEXT
);
CREATE INDEX idx_tasks_project ON tasks(project_id);
CREATE INDEX idx_tasks_section ON tasks(section_id);
CREATE INDEX idx_tasks_parent ON tasks(parent_id);
CREATE INDEX idx_tasks_status ON tasks(status);
CREATE INDEX idx_tasks_due ON tasks(due_at);
CREATE INDEX idx_tasks_start ON tasks(start_at);

CREATE TABLE check_items (
    id          TEXT PRIMARY KEY,
    task_id     TEXT NOT NULL REFERENCES tasks(id),
    title       TEXT NOT NULL,
    done        INTEGER NOT NULL DEFAULT 0,
    sort_order  INTEGER NOT NULL DEFAULT 0,
    start_at    TEXT,
    created_at  TEXT NOT NULL,
    updated_at  TEXT NOT NULL,
    deleted_at  TEXT
);
CREATE INDEX idx_check_items_task ON check_items(task_id);

CREATE TABLE tags (
    id          TEXT PRIMARY KEY,
    name        TEXT NOT NULL,
    color       TEXT,
    parent_id   TEXT REFERENCES tags(id),
    sort_order  INTEGER NOT NULL DEFAULT 0,
    created_at  TEXT NOT NULL,
    updated_at  TEXT NOT NULL,
    deleted_at  TEXT
);
CREATE UNIQUE INDEX idx_tags_name_live ON tags(name) WHERE deleted_at IS NULL;
CREATE INDEX idx_tags_parent ON tags(parent_id);

CREATE TABLE task_tags (
    task_id     TEXT NOT NULL REFERENCES tasks(id),
    tag_id      TEXT NOT NULL REFERENCES tags(id),
    created_at  TEXT NOT NULL,
    updated_at  TEXT NOT NULL,
    deleted_at  TEXT,
    PRIMARY KEY (task_id, tag_id)
);
CREATE INDEX idx_task_tags_tag ON task_tags(tag_id);

CREATE TABLE reminders (
    id             TEXT PRIMARY KEY,
    task_id        TEXT NOT NULL REFERENCES tasks(id),
    trigger_kind   TEXT NOT NULL CHECK (trigger_kind IN ('ABS', 'REL')),
    at             TEXT,          -- absolute trigger time
    offset_min     INTEGER,       -- relative offset from start/due, minutes before
    snoozed_until  TEXT,
    created_at     TEXT NOT NULL,
    updated_at     TEXT NOT NULL,
    deleted_at     TEXT
);
CREATE INDEX idx_reminders_task ON reminders(task_id);

CREATE TABLE attachments (
    id          TEXT PRIMARY KEY,
    task_id     TEXT NOT NULL REFERENCES tasks(id),
    path        TEXT NOT NULL,
    mime        TEXT,
    size        INTEGER,
    created_at  TEXT NOT NULL,
    updated_at  TEXT NOT NULL,
    deleted_at  TEXT
);
CREATE INDEX idx_attachments_task ON attachments(task_id);

CREATE TABLE comments (
    id          TEXT PRIMARY KEY,
    task_id     TEXT NOT NULL REFERENCES tasks(id),
    body        TEXT NOT NULL,
    created_at  TEXT NOT NULL,
    updated_at  TEXT NOT NULL,
    deleted_at  TEXT
);
CREATE INDEX idx_comments_task ON comments(task_id);

-- Activity log (task history etc.)
CREATE TABLE activity (
    id           TEXT PRIMARY KEY,
    entity_kind  TEXT NOT NULL,
    entity_id    TEXT NOT NULL,
    action       TEXT NOT NULL,
    payload_json TEXT,
    at           TEXT NOT NULL,
    created_at   TEXT NOT NULL,
    updated_at   TEXT NOT NULL,
    deleted_at   TEXT
);
CREATE INDEX idx_activity_entity ON activity(entity_kind, entity_id);

------------------------------------------------------------------------------
-- Smart lists / filters
------------------------------------------------------------------------------

CREATE TABLE filters (
    id          TEXT PRIMARY KEY,
    name        TEXT NOT NULL,
    rule_json   TEXT NOT NULL,
    sort_order  INTEGER NOT NULL DEFAULT 0,
    created_at  TEXT NOT NULL,
    updated_at  TEXT NOT NULL,
    deleted_at  TEXT
);

-- Editable Eisenhower quadrant rules (quadrants 0-3)
CREATE TABLE matrix_config (
    quadrant    INTEGER PRIMARY KEY CHECK (quadrant IN (0, 1, 2, 3)),
    rule_json   TEXT NOT NULL,
    created_at  TEXT NOT NULL,
    updated_at  TEXT NOT NULL,
    deleted_at  TEXT
);

------------------------------------------------------------------------------
-- Habits
------------------------------------------------------------------------------

CREATE TABLE habits (
    id             TEXT PRIMARY KEY,
    name           TEXT NOT NULL,
    icon           TEXT,
    color          TEXT,
    quote          TEXT,
    goal_kind      TEXT NOT NULL DEFAULT 'CHECK' CHECK (goal_kind IN ('CHECK', 'AMOUNT')),
    goal_amount    REAL,
    unit           TEXT,
    freq_json      TEXT NOT NULL,
    section        TEXT,
    reminders_json TEXT,
    start_date     TEXT,
    archived       INTEGER NOT NULL DEFAULT 0,
    sort_order     INTEGER NOT NULL DEFAULT 0,
    created_at     TEXT NOT NULL,
    updated_at     TEXT NOT NULL,
    deleted_at     TEXT
);

CREATE TABLE habit_checkins (
    id          TEXT PRIMARY KEY,
    habit_id    TEXT NOT NULL REFERENCES habits(id),
    date        TEXT NOT NULL,   -- YYYY-MM-DD
    value       REAL,
    status      TEXT NOT NULL DEFAULT 'DONE' CHECK (status IN ('DONE', 'PARTIAL', 'SKIP')),
    note        TEXT,
    created_at  TEXT NOT NULL,
    updated_at  TEXT NOT NULL,
    deleted_at  TEXT
);
CREATE UNIQUE INDEX idx_habit_checkins_habit_date_live
    ON habit_checkins(habit_id, date) WHERE deleted_at IS NULL;

------------------------------------------------------------------------------
-- Focus / Pomodoro
------------------------------------------------------------------------------

CREATE TABLE focus_sessions (
    id          TEXT PRIMARY KEY,
    task_id     TEXT REFERENCES tasks(id),
    habit_id    TEXT REFERENCES habits(id),
    kind        TEXT NOT NULL CHECK (kind IN ('POMO', 'STOPWATCH')),
    started_at  TEXT NOT NULL,
    ended_at    TEXT,
    pause_ms    INTEGER NOT NULL DEFAULT 0,
    note        TEXT,
    status      TEXT NOT NULL DEFAULT 'RUNNING'
                CHECK (status IN ('RUNNING', 'PAUSED', 'DONE', 'ABANDONED')),
    created_at  TEXT NOT NULL,
    updated_at  TEXT NOT NULL,
    deleted_at  TEXT
);
CREATE INDEX idx_focus_sessions_task ON focus_sessions(task_id);
CREATE INDEX idx_focus_sessions_habit ON focus_sessions(habit_id);

------------------------------------------------------------------------------
-- Countdown
------------------------------------------------------------------------------

CREATE TABLE countdowns (
    id             TEXT PRIMARY KEY,
    title          TEXT NOT NULL,
    target_date    TEXT NOT NULL,
    repeat_annual  INTEGER NOT NULL DEFAULT 0,
    style_json     TEXT,
    pinned         INTEGER NOT NULL DEFAULT 0,
    created_at     TEXT NOT NULL,
    updated_at     TEXT NOT NULL,
    deleted_at     TEXT
);

------------------------------------------------------------------------------
-- Calendar
------------------------------------------------------------------------------

CREATE TABLE cal_subscriptions (
    id           TEXT PRIMARY KEY,
    url          TEXT NOT NULL,
    name         TEXT NOT NULL,
    color        TEXT,
    visible      INTEGER NOT NULL DEFAULT 1,
    refresh_min  INTEGER NOT NULL DEFAULT 60,
    last_fetch   TEXT,
    created_at   TEXT NOT NULL,
    updated_at   TEXT NOT NULL,
    deleted_at   TEXT
);

CREATE TABLE cal_events (
    id               TEXT PRIMARY KEY,
    subscription_id  TEXT REFERENCES cal_subscriptions(id),  -- NULL = local event
    uid              TEXT,                                   -- iCalendar UID
    title            TEXT NOT NULL,
    start_at         TEXT NOT NULL,
    end_at           TEXT,
    all_day          INTEGER NOT NULL DEFAULT 0,
    location         TEXT,
    notes            TEXT,
    created_at       TEXT NOT NULL,
    updated_at       TEXT NOT NULL,
    deleted_at       TEXT
);
CREATE INDEX idx_cal_events_subscription ON cal_events(subscription_id);
CREATE INDEX idx_cal_events_start ON cal_events(start_at);

------------------------------------------------------------------------------
-- Misc
------------------------------------------------------------------------------

CREATE TABLE settings (
    key         TEXT PRIMARY KEY,
    value_json  TEXT NOT NULL,
    created_at  TEXT NOT NULL,
    updated_at  TEXT NOT NULL,
    deleted_at  TEXT
);

CREATE TABLE sticky_notes (
    id          TEXT PRIMARY KEY,
    task_id     TEXT REFERENCES tasks(id),
    note_id     TEXT REFERENCES tasks(id),  -- note-kind task
    x           INTEGER NOT NULL DEFAULT 100,
    y           INTEGER NOT NULL DEFAULT 100,
    w           INTEGER NOT NULL DEFAULT 300,
    h           INTEGER NOT NULL DEFAULT 300,
    color       TEXT,
    open        INTEGER NOT NULL DEFAULT 1,
    created_at  TEXT NOT NULL,
    updated_at  TEXT NOT NULL,
    deleted_at  TEXT
);

-- Achievement score history; multiple score events per day are expected.
CREATE TABLE achievements (
    id           TEXT PRIMARY KEY,
    date         TEXT NOT NULL,   -- YYYY-MM-DD
    score_delta  INTEGER NOT NULL,
    reason       TEXT NOT NULL,
    created_at   TEXT NOT NULL,
    updated_at   TEXT NOT NULL,
    deleted_at   TEXT
);
CREATE INDEX idx_achievements_date ON achievements(date);

CREATE TABLE saved_searches (
    id            TEXT PRIMARY KEY,
    query         TEXT NOT NULL,
    filters_json  TEXT,
    created_at    TEXT NOT NULL,
    updated_at    TEXT NOT NULL,
    deleted_at    TEXT
);

------------------------------------------------------------------------------
-- Changelog (§4.4): every repository mutation appends one row so a future
-- sync layer (or CRDT) can replay history.
------------------------------------------------------------------------------

CREATE TABLE changelog (
    id           TEXT PRIMARY KEY,
    entity_kind  TEXT NOT NULL,
    entity_id    TEXT NOT NULL,
    op           TEXT NOT NULL CHECK (op IN ('INSERT', 'UPDATE', 'DELETE')),
    payload_json TEXT,
    at           TEXT NOT NULL
);
CREATE INDEX idx_changelog_entity ON changelog(entity_kind, entity_id);
CREATE INDEX idx_changelog_at ON changelog(at);
