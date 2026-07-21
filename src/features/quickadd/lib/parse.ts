/**
 * Natural-language quick-add parser (pure, frontend-only). Extracts the
 * filter-grammar tokens (`#tag`, `~list`, `!priority`), an "every …" recurrence
 * phrase (→ RRULE the Phase-2 engine accepts), and a date/time via chrono-node.
 * Each consumed token is reported so the UI can render a removable chip and,
 * on dismiss, strip that exact substring from the input. No Rust mirror — the
 * parsed result goes through the normal create path.
 */
import * as chrono from "chrono-node";
import { composeRrule, DEFAULT_PARTS, type Freq, type Weekday } from "../../tasks/lib/rrule";

const PRIORITY: Record<string, number> = { high: 5, medium: 3, med: 3, low: 1, none: 0 };
const PRIORITY_LABEL: Record<number, string> = { 5: "High", 3: "Medium", 1: "Low", 0: "None" };

const WEEKDAY: Record<string, Weekday> = {
  mon: "MO",
  tue: "TU",
  wed: "WE",
  thu: "TH",
  fri: "FR",
  sat: "SA",
  sun: "SU",
};

const UNIT_FREQ: Record<string, Freq> = {
  day: "DAILY",
  week: "WEEKLY",
  month: "MONTHLY",
  year: "YEARLY",
};

export type TokenKind = "tag" | "list" | "priority" | "date" | "repeat" | "remind";

export interface ParsedToken {
  kind: TokenKind;
  label: string; // chip text, e.g. "Tag: finance"
  text: string; // exact matched substring of the input (for dismissal)
  start: number; // index of `text` in the original input …
  end: number; // … and one past its last char (for inline highlighting)
}

export interface ParsedQuickAdd {
  title: string;
  tags: string[];
  listName: string | null;
  priority: number | null;
  dueAt: string | null;
  isAllDay: boolean;
  rrule: string | null;
  /** "remind me …" was used — add a reminder at the due time. */
  remind: boolean;
  tokens: ParsedToken[];
}

function weekdayOf(word: string): Weekday | null {
  return WEEKDAY[word.slice(0, 3).toLowerCase()] ?? null;
}

/** Match an "every …"/adverb recurrence phrase → { rrule, text }, or null. */
function matchRecurrence(text: string): { rrule: string; text: string } | null {
  // "every 2 weeks", "every week"
  let m = text.match(/\bevery\s+(?:(\d+)\s+)?(day|week|month|year)s?\b/i);
  if (m) {
    const interval = m[1] ? Math.max(1, Number(m[1])) : 1;
    return {
      rrule: composeRrule({ ...DEFAULT_PARTS, freq: UNIT_FREQ[m[2].toLowerCase()], interval, byDay: [] }),
      text: m[0],
    };
  }
  // "every mon, wed" / "every friday" / "every mon and fri"
  m = text.match(
    /\bevery\s+((?:mon|tue|wed|thu|fri|sat|sun)[a-z]*(?:(?:\s*,\s*|\s+and\s+|\s+)(?:mon|tue|wed|thu|fri|sat|sun)[a-z]*)*)\b/i,
  );
  if (m) {
    const days = m[1]
      .split(/\s*,\s*|\s+and\s+|\s+/)
      .map(weekdayOf)
      .filter((d): d is Weekday => d !== null);
    if (days.length > 0) {
      return { rrule: composeRrule({ ...DEFAULT_PARTS, freq: "WEEKLY", byDay: days }), text: m[0] };
    }
  }
  // Bare adverbs.
  m = text.match(/\b(daily|weekly|monthly|yearly|annually)\b/i);
  if (m) {
    const freq: Freq =
      { daily: "DAILY", weekly: "WEEKLY", monthly: "MONTHLY", yearly: "YEARLY", annually: "YEARLY" }[
        m[1].toLowerCase()
      ] as Freq;
    return { rrule: composeRrule({ ...DEFAULT_PARTS, freq, byDay: [] }), text: m[0] };
  }
  return null;
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

export function parseQuickAdd(input: string, ref: Date = new Date()): ParsedQuickAdd {
  const tokens: ParsedToken[] = [];
  const tags: string[] = [];
  let listName: string | null = null;
  let priority: number | null = null;
  let dueAt: string | null = null;
  let isAllDay = true;
  let rrule: string | null = null;

  let remind = false;
  // `rest` mirrors `input` but with consumed spans blanked to equal-length
  // spaces, so every match index stays aligned to the original input — which
  // lets the UI highlight each token inline (not as separate chips).
  let rest = input;
  const consume = (kind: TokenKind, label: string, start: number, len: number) => {
    tokens.push({ kind, label, text: input.slice(start, start + len), start, end: start + len });
    rest = rest.slice(0, start) + " ".repeat(len) + rest.slice(start + len);
  };

  // "remind me [to] …" — TickTick treats this as a reminder request. Strip the
  // phrase and flag it; the linking "to" before the task text is removed after
  // the date is parsed out (e.g. "remind me in 2 days to ship" → "ship").
  const remindMatch = rest.match(/\bremind me\b/i);
  if (remindMatch?.index != null) {
    remind = true;
    consume("remind", "Reminder", remindMatch.index, remindMatch[0].length);
  }

  // #tag (may repeat)
  for (const m of rest.matchAll(/(?:^|\s)(#[\p{L}\p{N}_-]+)/gu)) {
    const start = m.index + m[0].indexOf(m[1]);
    tags.push(m[1].slice(1));
    consume("tag", `Tag: ${m[1].slice(1)}`, start, m[1].length);
  }
  // ~list (last one wins if repeated)
  for (const m of rest.matchAll(/(?:^|\s)(~[\p{L}\p{N}_-]+)/gu)) {
    listName = m[1].slice(1);
    consume("list", `List: ${listName}`, m.index + m[0].indexOf(m[1]), m[1].length);
  }
  // !priority
  const pm = rest.match(/(?:^|\s)(![a-z]+)/i);
  if (pm?.index != null) {
    const word = pm[1].slice(1).toLowerCase();
    if (word in PRIORITY) {
      priority = PRIORITY[word];
      consume("priority", `Priority: ${PRIORITY_LABEL[priority]}`, pm.index + pm[0].indexOf(pm[1]), pm[1].length);
    }
  }

  // Recurrence must run before chrono so "every friday" isn't eaten as a date.
  const rec = matchRecurrence(rest);
  if (rec) {
    rrule = rec.rrule;
    const start = rest.indexOf(rec.text);
    if (start >= 0) consume("repeat", "Repeat", start, rec.text.length);
  }

  // Date / time.
  const results = chrono.parse(rest, ref);
  if (results.length > 0) {
    const r = results[0];
    const c = r.start;
    const timed = c.isCertain("hour");

    // Deadline prepositions chrono leaves for us to interpret. "before <date>"
    // means the day *before* (a deadline you must beat); "by"/"on"/"due" just
    // prefix the date and should be stripped from the title, no day shift.
    const pre = rest.slice(0, r.index).match(/\b(before|by|on|due(?:\s+(?:on|by))?)\s+$/i);
    const shift = pre && /before/i.test(pre[1]) ? -1 : 0;

    if (timed) {
      const d = c.date();
      d.setDate(d.getDate() + shift);
      dueAt = d.toISOString();
      isAllDay = false;
    } else {
      // All-day: keep the calendar date in the UTC-midnight convention.
      const d = new Date(Date.UTC(c.get("year") ?? 1970, (c.get("month") ?? 1) - 1, c.get("day") ?? 1));
      d.setUTCDate(d.getUTCDate() + shift);
      dueAt = `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}T00:00:00.000Z`;
      isAllDay = true;
    }

    const start = r.index - (pre ? pre[0].length : 0);
    const len = (pre ? pre[0].length : 0) + r.text.length;
    consume("date", `Due: ${input.slice(start, start + len).trim()}`, start, len);
  }

  // Strip a leading connective "to"/"that" left behind by "remind me … to <task>".
  let title = rest.replace(/\s+/g, " ").trim();
  if (remind) title = title.replace(/^(?:to|that)\s+/i, "");
  return { title, tags, listName, priority, dueAt, isAllDay, rrule, remind, tokens };
}
