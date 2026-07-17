-- Idempotency guard for task completion (adversarial-review finding 2):
-- at most one live COMPLETED ledger row per (task, occurrence).
--
-- Databases affected by the pre-fix bug may already hold duplicates from
-- retried completions; soft-delete all but the earliest of each group first so
-- the unique index can be created.
UPDATE task_completions
SET deleted_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
    updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
WHERE status = 'COMPLETED'
  AND occurrence_at IS NOT NULL
  AND deleted_at IS NULL
  AND id NOT IN (
    SELECT MIN(id)
    FROM task_completions
    WHERE status = 'COMPLETED' AND occurrence_at IS NOT NULL AND deleted_at IS NULL
    GROUP BY task_id, occurrence_at
  );

CREATE UNIQUE INDEX IF NOT EXISTS ux_task_completions_occurrence
ON task_completions (task_id, occurrence_at)
WHERE occurrence_at IS NOT NULL AND deleted_at IS NULL AND status = 'COMPLETED';
