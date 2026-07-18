-- 0007_search_habits_tags: extend full-text search to habits and tags (Phase 12A).
--
-- Mirrors the tasks/check-items external-content FTS5 pattern from 0002. Unlike
-- Phase-1 FTS (created before any data), habits and tags may already exist when
-- this migration runs, so each index is BACKFILLED from live rows after creation.
-- Soft-deleted rows are kept out of the index by the trigger guards.

------------------------------------------------------------------------------
-- Habit search index (by name).
------------------------------------------------------------------------------

CREATE VIRTUAL TABLE habits_fts USING fts5(
    name,
    content='habits',
    content_rowid='rowid',
    tokenize='porter unicode61'
);

CREATE TRIGGER habits_fts_ai AFTER INSERT ON habits
WHEN new.deleted_at IS NULL
BEGIN
    INSERT INTO habits_fts(rowid, name) VALUES (new.rowid, new.name);
END;

CREATE TRIGGER habits_fts_ad AFTER DELETE ON habits
WHEN old.deleted_at IS NULL
BEGIN
    INSERT INTO habits_fts(habits_fts, rowid, name)
    VALUES ('delete', old.rowid, old.name);
END;

CREATE TRIGGER habits_fts_au AFTER UPDATE ON habits
BEGIN
    INSERT INTO habits_fts(habits_fts, rowid, name)
    SELECT 'delete', old.rowid, old.name
    WHERE old.deleted_at IS NULL;
    INSERT INTO habits_fts(rowid, name)
    SELECT new.rowid, new.name
    WHERE new.deleted_at IS NULL;
END;

INSERT INTO habits_fts(rowid, name)
SELECT rowid, name FROM habits WHERE deleted_at IS NULL;

------------------------------------------------------------------------------
-- Tag search index (by name).
------------------------------------------------------------------------------

CREATE VIRTUAL TABLE tags_fts USING fts5(
    name,
    content='tags',
    content_rowid='rowid',
    tokenize='porter unicode61'
);

CREATE TRIGGER tags_fts_ai AFTER INSERT ON tags
WHEN new.deleted_at IS NULL
BEGIN
    INSERT INTO tags_fts(rowid, name) VALUES (new.rowid, new.name);
END;

CREATE TRIGGER tags_fts_ad AFTER DELETE ON tags
WHEN old.deleted_at IS NULL
BEGIN
    INSERT INTO tags_fts(tags_fts, rowid, name)
    VALUES ('delete', old.rowid, old.name);
END;

CREATE TRIGGER tags_fts_au AFTER UPDATE ON tags
BEGIN
    INSERT INTO tags_fts(tags_fts, rowid, name)
    SELECT 'delete', old.rowid, old.name
    WHERE old.deleted_at IS NULL;
    INSERT INTO tags_fts(rowid, name)
    SELECT new.rowid, new.name
    WHERE new.deleted_at IS NULL;
END;

INSERT INTO tags_fts(rowid, name)
SELECT rowid, name FROM tags WHERE deleted_at IS NULL;
