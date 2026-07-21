-- 0010_habit_goal_days: habit goal-days (target duration in days; NULL = run
-- forever) and auto pop-up of the check-in log. Append-only; never edit an
-- already-applied migration.
ALTER TABLE habits ADD COLUMN goal_days INTEGER;
ALTER TABLE habits ADD COLUMN auto_log_popup INTEGER NOT NULL DEFAULT 0;
