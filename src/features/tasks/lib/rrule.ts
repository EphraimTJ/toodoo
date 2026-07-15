/**
 * Friendly RRULE composition/parsing for the recurrence picker. Covers the
 * common TickTick cases (daily/weekly/monthly/yearly + interval + weekday +
 * end condition); an "Advanced" raw field in the UI carries anything exotic.
 * The Rust `recurrence` engine remains the source of truth for evaluation — this
 * only builds and reads the stored string.
 */

export type Freq = "DAILY" | "WEEKLY" | "MONTHLY" | "YEARLY";

export const WEEKDAYS = ["MO", "TU", "WE", "TH", "FR", "SA", "SU"] as const;
export type Weekday = (typeof WEEKDAYS)[number];

const WEEKDAY_LABEL: Record<Weekday, string> = {
  MO: "Mon",
  TU: "Tue",
  WE: "Wed",
  TH: "Thu",
  FR: "Fri",
  SA: "Sat",
  SU: "Sun",
};

const FREQ_NOUN: Record<Freq, string> = {
  DAILY: "day",
  WEEKLY: "week",
  MONTHLY: "month",
  YEARLY: "year",
};

const FREQ_ADVERB: Record<Freq, string> = {
  DAILY: "Daily",
  WEEKLY: "Weekly",
  MONTHLY: "Monthly",
  YEARLY: "Yearly",
};

export type RecurrenceEnd =
  | { kind: "never" }
  | { kind: "count"; count: number }
  | { kind: "until"; date: string }; // date is YYYY-MM-DD

export interface RecurrenceParts {
  freq: Freq;
  interval: number; // >= 1
  byDay: Weekday[]; // WEEKLY only
  end: RecurrenceEnd;
}

export const DEFAULT_PARTS: RecurrenceParts = {
  freq: "WEEKLY",
  interval: 1,
  byDay: [],
  end: { kind: "never" },
};

/** Build an RRULE body string (no `RRULE:` prefix) from picker state. */
export function composeRrule(parts: RecurrenceParts): string {
  const bits = [`FREQ=${parts.freq}`];
  if (parts.interval > 1) bits.push(`INTERVAL=${parts.interval}`);
  if (parts.freq === "WEEKLY" && parts.byDay.length > 0) {
    // Preserve canonical weekday order regardless of click order.
    const ordered = WEEKDAYS.filter((d) => parts.byDay.includes(d));
    bits.push(`BYDAY=${ordered.join(",")}`);
  }
  if (parts.end.kind === "count") bits.push(`COUNT=${Math.max(1, parts.end.count)}`);
  if (parts.end.kind === "until") bits.push(`UNTIL=${parts.end.date.replace(/-/g, "")}T235959Z`);
  return bits.join(";");
}

function fields(rrule: string): Map<string, string> {
  const line =
    rrule
      .split(/\r?\n/)
      .find((l) => l.toUpperCase().startsWith("RRULE:"))
      ?.slice(6) ?? rrule;
  const map = new Map<string, string>();
  for (const part of line.split(";")) {
    const [k, v] = part.split("=");
    if (k && v) map.set(k.trim().toUpperCase(), v.trim());
  }
  return map;
}

/** Parse a stored RRULE into picker state, or null if it has no FREQ. */
export function parseRrule(rrule: string | null | undefined): RecurrenceParts | null {
  if (!rrule || !rrule.trim()) return null;
  const f = fields(rrule);
  const freq = f.get("FREQ") as Freq | undefined;
  if (!freq || !(freq in FREQ_NOUN)) return null;

  const interval = Math.max(1, Number(f.get("INTERVAL") ?? "1") || 1);
  const present = new Set(
    (f.get("BYDAY") ?? "").split(",").map((d) => d.trim().toUpperCase()),
  );
  // Canonicalize to calendar order so the value is stable across round-trips.
  const byDay = WEEKDAYS.filter((d) => present.has(d));

  let end: RecurrenceEnd = { kind: "never" };
  const count = f.get("COUNT");
  const until = f.get("UNTIL");
  if (count) {
    end = { kind: "count", count: Math.max(1, Number(count) || 1) };
  } else if (until) {
    const digits = until.replace(/[^0-9]/g, "").slice(0, 8);
    if (digits.length === 8) {
      end = {
        kind: "until",
        date: `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6, 8)}`,
      };
    }
  }
  return { freq, interval, byDay, end };
}

/** Human summary for a row/label, e.g. "Every 2 weeks on Mon, Wed". */
export function describeRrule(rrule: string | null | undefined): string | null {
  const parts = parseRrule(rrule);
  if (!parts) return null;

  let base: string;
  if (parts.interval === 1) {
    base = FREQ_ADVERB[parts.freq];
  } else {
    base = `Every ${parts.interval} ${FREQ_NOUN[parts.freq]}s`;
  }
  if (parts.freq === "WEEKLY" && parts.byDay.length > 0) {
    const ordered = WEEKDAYS.filter((d) => parts.byDay.includes(d)).map((d) => WEEKDAY_LABEL[d]);
    base += ` on ${ordered.join(", ")}`;
  }
  if (parts.end.kind === "count") base += ` · ${parts.end.count}×`;
  if (parts.end.kind === "until") base += ` · until ${parts.end.date}`;
  return base;
}

export const weekdayLabel = (d: Weekday): string => WEEKDAY_LABEL[d];
