-- 0011_attachments: extend the 0001 attachments table for the local file store.
-- Existing columns: id, task_id, path (relative), mime, size, timestamps.
-- Adds the original file name and a render kind (IMAGE | AUDIO | FILE).

ALTER TABLE attachments ADD COLUMN file_name TEXT NOT NULL DEFAULT '';
ALTER TABLE attachments ADD COLUMN kind TEXT NOT NULL DEFAULT 'FILE';

CREATE INDEX IF NOT EXISTS idx_attachments_task_created ON attachments (task_id, created_at);
