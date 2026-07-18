-- 0005_cal_events_extra: fields the calendar needs on top of the 0001 tables.
-- `cal_events` and `cal_subscriptions` already exist (0001). Append-only; never
-- edit 0001-0004.
--
-- color: per local event (subscription events take their subscription's color).
-- rrule/exdates_json: a recurring event is stored once as a master and expanded
-- to occurrences at query time (repo::calendar), the same model tasks use.
ALTER TABLE cal_events ADD COLUMN color        TEXT;
ALTER TABLE cal_events ADD COLUMN rrule        TEXT;
ALTER TABLE cal_events ADD COLUMN exdates_json TEXT;
