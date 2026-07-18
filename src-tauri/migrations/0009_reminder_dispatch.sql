-- Reminder dispatch claim/ack state (adversarial-review finding 5): a claim is
-- persisted before a delivery attempt and acknowledged (last_fired_at) only on
-- success, with a bounded per-reminder attempt count for retry/backoff.
ALTER TABLE reminders ADD COLUMN fire_attempts INTEGER NOT NULL DEFAULT 0;
ALTER TABLE reminders ADD COLUMN fire_claimed_at TEXT;
