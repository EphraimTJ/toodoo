-- 0004_filter_color: give saved filters a color, matching lists/tags so the
-- sidebar can show a color dot (Phase 3). Append-only; never edit 0001-0003.
--
-- Everything else Phase 3 needs already exists in 0001: the `sections` table
-- (Kanban columns), `tasks.section_id`, `filters(rule_json)`,
-- `matrix_config(quadrant, rule_json)`, and `projects.view_mode`.
ALTER TABLE filters ADD COLUMN color TEXT;
