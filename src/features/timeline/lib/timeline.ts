/**
 * Pure geometry for the Gantt timeline: mapping dates to horizontal pixels and
 * back at each zoom, and computing a task's bar span. Kept free of React/DOM so
 * it can be unit-tested; the components layer drag interactions on top.
 */

export type Zoom = "day" | "week" | "month";

/** Horizontal pixels per calendar day at each zoom level. */
export const ZOOM_PX_PER_DAY: Record<Zoom, number> = { day: 44, week: 16, month: 5 };
export const ZOOMS: Zoom[] = ["day", "week", "month"];

const DAY_MS = 86_400_000;

function dayNumber(date: string): number {
  return Math.round(Date.parse(`${date.slice(0, 10)}T00:00:00Z`) / DAY_MS);
}

/** Add `n` days to a YYYY-MM-DD (or RFC3339) date, returning YYYY-MM-DD. */
export function addDays(date: string, n: number): string {
  return new Date(dayNumber(date) * DAY_MS + n * DAY_MS).toISOString().slice(0, 10);
}

/** Whole days from `origin` to `date` (can be negative). */
export function dayIndex(date: string, origin: string): number {
  return dayNumber(date) - dayNumber(origin);
}

export function dateToX(date: string, origin: string, pxPerDay: number): number {
  return dayIndex(date, origin) * pxPerDay;
}

/** Pixel → nearest day boundary, as YYYY-MM-DD. */
export function xToDate(x: number, origin: string, pxPerDay: number): string {
  return addDays(origin, Math.round(x / pxPerDay));
}

/** The day a point falls within (floor), as YYYY-MM-DD. */
export function xToDay(x: number, origin: string, pxPerDay: number): string {
  return addDays(origin, Math.floor(x / pxPerDay));
}

export interface BarSpan {
  start: string; // YYYY-MM-DD
  days: number; // inclusive span, ≥ 1
}

/** A task's bar span. A single-date task (only start or only due) is one day. */
export function barGeometry(startAt: string | null, dueAt: string | null): BarSpan | null {
  const s = startAt ? startAt.slice(0, 10) : null;
  const d = dueAt ? dueAt.slice(0, 10) : null;
  if (s && d) {
    return { start: s <= d ? s : d, days: Math.max(1, Math.abs(dayIndex(d, s)) + 1) };
  }
  const one = s ?? d;
  return one ? { start: one, days: 1 } : null;
}

/** All-day ISO instant (midnight-Z) for a date, matching how tasks store dates. */
export function toAllDayIso(date: string): string {
  return `${date.slice(0, 10)}T00:00:00.000Z`;
}
