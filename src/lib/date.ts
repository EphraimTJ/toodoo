import { parseISO } from "date-fns";

/**
 * All-day dates are stored as UTC midnight of the calendar date
 * (`YYYY-MM-DDT00:00:00.000Z`). Rendering that instant with local-time helpers
 * (date-fns `format`/`isToday`/…) slips it a day earlier in any negative-offset
 * timezone (e.g. UTC-midnight Wed shows as Tue evening in America/Phoenix).
 *
 * This returns a local Date on the *same calendar day* as the stored UTC date,
 * so downstream local-time rendering shows the intended day everywhere.
 */
export function allDayToLocal(iso: string): Date {
  const d = new Date(iso);
  return new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

/** Local Date for a due/start value, honoring the all-day calendar-date rule. */
export function taskDate(iso: string, isAllDay: boolean): Date {
  return isAllDay ? allDayToLocal(iso) : parseISO(iso);
}
