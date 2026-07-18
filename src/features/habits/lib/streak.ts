/**
 * TypeScript mirror of the Rust `habits` streak/scheduling math, for the browser
 * stub (vite dev + Vitest). Pinned to the same unit tests as Rust so the two
 * can't drift. The Rust repository layer remains the source of truth.
 */

export type Freq =
  | { kind: "daily" }
  | { kind: "weekdays"; days: number[] } // ISO 1=Mon..7=Sun
  | { kind: "weekly"; times: number }
  | { kind: "monthly"; times: number };

export interface Streak {
  current: number;
  best: number;
}

/** Days since 0001-01-01 (proleptic Gregorian), matching chrono's num_days_from_ce - 1. */
function dayNumber(date: string): number {
  return Math.floor(Date.parse(`${date}T00:00:00Z`) / 86_400_000);
}
function isoWeekday(date: string): number {
  const dow = new Date(`${date}T00:00:00Z`).getUTCDay(); // 0=Sun..6=Sat
  return dow === 0 ? 7 : dow;
}
function addDays(date: string, n: number): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
}

export function isScheduled(freq: Freq, date: string): boolean {
  if (freq.kind === "weekdays") return freq.days.includes(isoWeekday(date));
  return true;
}

function periodIndex(freq: Freq, date: string): number {
  if (freq.kind === "monthly") {
    const [y, m] = date.split("-").map(Number);
    return y * 12 + (m - 1);
  }
  // ISO week: index by the Monday's day-number / 7.
  const monday = addDays(date, -(isoWeekday(date) - 1));
  return Math.floor(dayNumber(monday) / 7);
}

type Sat = true | false | null; // done / miss / neutral

export function streak(freq: Freq, marks: [string, string][], today: string): Streak {
  const byDate = new Map(marks.map(([d, s]) => [d, s]));
  if (byDate.size === 0) return { current: 0, best: 0 };
  const start = [...byDate.keys()].sort()[0];

  if (freq.kind === "weekly" || freq.kind === "monthly") {
    return streakPeriodic(freq, byDate, start, today, freq.times);
  }
  return streakDaily(freq, byDate, start, today);
}

function satisfied(status: string | undefined): Sat {
  if (status === "DONE") return true;
  if (status === "SKIP") return null;
  return false;
}

function streakDaily(freq: Freq, byDate: Map<string, string>, start: string, today: string): Streak {
  const seq: { date: string; sat: Sat }[] = [];
  for (let d = start; d <= today; d = addDays(d, 1)) {
    if (isScheduled(freq, d)) seq.push({ date: d, sat: satisfied(byDate.get(d)) });
  }
  const last = seq[seq.length - 1];
  if (last && last.date === today && last.sat === false) last.sat = null;

  let best = 0;
  let run = 0;
  for (const { sat } of seq) {
    if (sat === true) best = Math.max(best, ++run);
    else if (sat === false) run = 0;
  }
  let current = 0;
  for (let i = seq.length - 1; i >= 0; i--) {
    if (seq[i].sat === true) current++;
    else if (seq[i].sat === false) break;
  }
  return { current, best };
}

/** Completion rate over [from, to] in 0..1. */
export function completionRate(freq: Freq, marks: [string, string][], from: string, to: string): number {
  const done = new Set(marks.filter(([, s]) => s === "DONE").map(([d]) => d));
  if (freq.kind === "weekly" || freq.kind === "monthly") {
    const perPeriod = new Map<number, number>();
    for (const d of done) {
      if (d >= from && d <= to) {
        const idx = periodIndex(freq, d);
        perPeriod.set(idx, (perPeriod.get(idx) ?? 0) + 1);
      }
    }
    const total = periodIndex(freq, to) - periodIndex(freq, from) + 1;
    if (total <= 0) return 0;
    let met = 0;
    for (let idx = periodIndex(freq, from); idx <= periodIndex(freq, to); idx++) {
      if ((perPeriod.get(idx) ?? 0) >= freq.times) met++;
    }
    return met / total;
  }
  let scheduled = 0;
  let hit = 0;
  for (let d = from; d <= to; d = addDays(d, 1)) {
    if (isScheduled(freq, d)) {
      scheduled++;
      if (done.has(d)) hit++;
    }
  }
  return scheduled === 0 ? 0 : hit / scheduled;
}

function streakPeriodic(
  freq: Freq,
  byDate: Map<string, string>,
  start: string,
  today: string,
  times: number,
): Streak {
  const done = new Map<number, number>();
  for (const [d, s] of byDate) {
    if (s === "DONE") {
      const idx = periodIndex(freq, d);
      done.set(idx, (done.get(idx) ?? 0) + 1);
    }
  }
  const startIdx = periodIndex(freq, start);
  const curIdx = periodIndex(freq, today);
  const met = (idx: number) => (done.get(idx) ?? 0) >= times;

  let best = 0;
  let run = 0;
  for (let idx = startIdx; idx <= curIdx; idx++) {
    if (met(idx)) best = Math.max(best, ++run);
    else run = 0;
  }
  let current = 0;
  let idx = curIdx;
  if (!met(curIdx)) idx--;
  for (; idx >= startIdx; idx--) {
    if (met(idx)) current++;
    else break;
  }
  return { current, best };
}
