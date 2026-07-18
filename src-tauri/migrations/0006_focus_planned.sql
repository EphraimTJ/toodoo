-- 0006_focus_planned: record a pomo's target length so a "completed pomo" and
-- planned-vs-actual are explicit. `focus_sessions` already exists (0001). Pomo
-- config and the daily goal live in `settings` (JSON), not the schema.
-- Append-only; never edit 0001-0005.
ALTER TABLE focus_sessions ADD COLUMN planned_min INTEGER;
