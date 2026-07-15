-- 0002_tasks_fts_inbox: full-text search + Inbox seed (Phase 1).
-- Append-only; never edit 0001.

-- Plain-text mirror of the TipTap rich-text document. The repository layer
-- writes it alongside content_rich on every content change; FTS indexes it.
ALTER TABLE tasks ADD COLUMN content_plain TEXT;

------------------------------------------------------------------------------
-- Task search index. External-content FTS5 over tasks(title, content_plain).
-- Soft-deleted and TRASHED tasks are kept OUT of the index by the trigger
-- guards below; completed tasks remain searchable.
------------------------------------------------------------------------------

CREATE VIRTUAL TABLE tasks_fts USING fts5(
    title,
    content_plain,
    content='tasks',
    content_rowid='rowid',
    tokenize='porter unicode61'
);

CREATE TRIGGER tasks_fts_ai AFTER INSERT ON tasks
WHEN new.deleted_at IS NULL AND new.status <> 'TRASHED'
BEGIN
    INSERT INTO tasks_fts(rowid, title, content_plain)
    VALUES (new.rowid, new.title, new.content_plain);
END;

CREATE TRIGGER tasks_fts_ad AFTER DELETE ON tasks
WHEN old.deleted_at IS NULL AND old.status <> 'TRASHED'
BEGIN
    INSERT INTO tasks_fts(tasks_fts, rowid, title, content_plain)
    VALUES ('delete', old.rowid, old.title, old.content_plain);
END;

-- Update = remove the old indexed row (if it was indexed), then add the new
-- one (if it should be indexed). Handles edits, trash/restore, soft deletes.
-- MUST be one trigger: SQLite does not guarantee firing order between
-- triggers, and the delete has to run before the insert.
CREATE TRIGGER tasks_fts_au AFTER UPDATE ON tasks
BEGIN
    INSERT INTO tasks_fts(tasks_fts, rowid, title, content_plain)
    SELECT 'delete', old.rowid, old.title, old.content_plain
    WHERE old.deleted_at IS NULL AND old.status <> 'TRASHED';
    INSERT INTO tasks_fts(rowid, title, content_plain)
    SELECT new.rowid, new.title, new.content_plain
    WHERE new.deleted_at IS NULL AND new.status <> 'TRASHED';
END;

------------------------------------------------------------------------------
-- Check-item search index; hits are mapped back to the parent task in
-- repo::search.
------------------------------------------------------------------------------

CREATE VIRTUAL TABLE check_items_fts USING fts5(
    title,
    content='check_items',
    content_rowid='rowid',
    tokenize='porter unicode61'
);

CREATE TRIGGER check_items_fts_ai AFTER INSERT ON check_items
WHEN new.deleted_at IS NULL
BEGIN
    INSERT INTO check_items_fts(rowid, title) VALUES (new.rowid, new.title);
END;

CREATE TRIGGER check_items_fts_ad AFTER DELETE ON check_items
WHEN old.deleted_at IS NULL
BEGIN
    INSERT INTO check_items_fts(check_items_fts, rowid, title)
    VALUES ('delete', old.rowid, old.title);
END;

CREATE TRIGGER check_items_fts_au AFTER UPDATE ON check_items
BEGIN
    INSERT INTO check_items_fts(check_items_fts, rowid, title)
    SELECT 'delete', old.rowid, old.title
    WHERE old.deleted_at IS NULL;
    INSERT INTO check_items_fts(rowid, title)
    SELECT new.rowid, new.title
    WHERE new.deleted_at IS NULL;
END;

------------------------------------------------------------------------------
-- The Inbox: a fixed, well-known project. The repository layer refuses to
-- delete, rename, or move it into a folder.
------------------------------------------------------------------------------

INSERT INTO projects (id, folder_id, name, color, icon, kind, view_mode, muted,
                      sort_order, closed, created_at, updated_at, deleted_at)
VALUES ('inbox', NULL, 'Inbox', NULL, NULL, 'TASK', 'LIST', 0, 0, 0,
        strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
        strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
        NULL);
