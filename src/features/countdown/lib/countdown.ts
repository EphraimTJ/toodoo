/**
 * TypeScript mirror of the Rust `countdowns::countdown_view` date math, for the
 * UI and the browser stub. Pinned to the same unit tests as Rust.
 */

export interface CountdownView {
  kind: "until" | "since";
  days: number;
  refDate: string;
}

function toUTC(date: string): number {
  return Date.parse(`${date}T00:00:00Z`);
}
const DAY = 86_400_000;

function onYear(target: string, year: number): string {
  const [, m, d] = target.split("-").map(Number);
  // Clamp Feb 29 → Feb 28 in non-leap years.
  const candidate = new Date(Date.UTC(year, m - 1, d));
  if (candidate.getUTCMonth() !== m - 1) return `${year}-02-28`;
  return candidate.toISOString().slice(0, 10);
}

export function countdownView(
  targetDate: string,
  repeatAnnual: boolean,
  countUp: boolean,
  today: string,
): CountdownView {
  const t = toUTC(today);

  if (repeatAnnual) {
    const year = new Date(t).getUTCFullYear();
    let next = onYear(targetDate, year);
    if (toUTC(next) < t) next = onYear(targetDate, year + 1);
    return { kind: "until", days: Math.round((toUTC(next) - t) / DAY), refDate: next };
  }
  const target = toUTC(targetDate);
  if (countUp) {
    return { kind: "since", days: Math.round((t - target) / DAY), refDate: targetDate };
  }
  if (target >= t) {
    return { kind: "until", days: Math.round((target - t) / DAY), refDate: targetDate };
  }
  return { kind: "since", days: Math.round((t - target) / DAY), refDate: targetDate };
}
