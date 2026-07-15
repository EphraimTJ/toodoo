-- 0003_recurrence_reminders: completion history for recurring tasks, task
-- templates, and reminder fire-tracking (Phase 2). Append-only; never edit
-- 0001/0002.

-- One row per completed (or won't-done) occurrence of a task. For a recurring
-- task the row advances in place, so this table is the durable record of each
-- instance: it powers "repeat after N times" end-counting and seeds the
-- Phase 9 statistics engine.
CREATE TABLE task_completions (
    id            TEXT PRIMARY KEY,
    task_id       TEXT NOT NULL REFERENCES tasks(id),
    occurrence_at TEXT,            -- the due/start instant of the occurrence that was closed
    completed_at  TEXT NOT NULL,   -- when the user actually closed it
    status        TEXT NOT NULL DEFAULT 'COMPLETED'
                  CHECK (status IN ('COMPLETED', 'WONT_DO')),
    created_at    TEXT NOT NULL,
    updated_at    TEXT NOT NULL,
    deleted_at    TEXT
);
CREATE INDEX idx_task_completions_task ON task_completions(task_id);
CREATE INDEX idx_task_completions_completed ON task_completions(completed_at);

-- Reusable task templates. payload_json is a NewTask-shaped body (title,
-- content, priority, rrule, reminders, check items) applied by
-- repo::templates::instantiate_template.
CREATE TABLE task_templates (
    id           TEXT PRIMARY KEY,
    name         TEXT NOT NULL,
    payload_json TEXT NOT NULL,
    sort_order   INTEGER NOT NULL DEFAULT 0,
    created_at   TEXT NOT NULL,
    updated_at   TEXT NOT NULL,
    deleted_at   TEXT
);

-- When a reminder last fired a notification. Lets the scheduler avoid
-- double-firing and drives "missed while the app was closed" catch-up.
ALTER TABLE reminders ADD COLUMN last_fired_at TEXT;
