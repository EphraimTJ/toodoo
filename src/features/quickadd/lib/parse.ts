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

  let rest = input;
  let remind = false;
  const consume = (kind: TokenKind, label: string, text: string) => {
    tokens.push({ kind, label, text });
    rest = rest.replace(text, " ");
  };

  // "remind me [to] …" — TickTick treats this as a reminder request. Strip the
  // phrase and flag it; the linking "to" before the task text is removed after
  // the date is parsed out (e.g. "remind me in 2 days to ship" → "ship").
  const remindMatch = input.match(/\bremind me\b/i);
  if (remindMatch) {
    remind = true;
    consume("remind", "Reminder", remindMatch[0]);
  }

  // #tag (may repeat)
  for (const m of input.matchAll(/(?:^|\s)(#[\p{L}\p{N}_-]+)/gu)) {
    const name = m[1].slice(1);
    tags.push(name);
    consume("tag", `Tag: ${name}`, m[1]);
  }
  // ~list (last one wins if repeated)
  for (const m of input.matchAll(/(?:^|\s)(~[\p{L}\p{N}_-]+)/gu)) {
    listName = m[1].slice(1);
    consume("list", `List: ${listName}`, m[1]);
  }
  // !priority
  const pm = input.match(/(?:^|\s)(![a-z]+)/i);
  if (pm) {
    const word = pm[1].slice(1).toLowerCase();
    if (word in PRIORITY) {
      priority = PRIORITY[word];
      consume("priority", `Priority: ${PRIORITY_LABEL[priority]}`, pm[1]);
    }
  }

  // Recurrence must run before chrono so "every friday" isn't eaten as a date.
  const rec = matchRecurrence(rest);
  if (rec) {
    rrule = rec.rrule;
    consume("repeat", "Repeat", rec.text.trim());
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

    const matched = pre ? pre[0] + r.text : r.text;
    consume("date", `Due: ${matched.trim()}`, matched);
  }

  // Strip a leading connective "to"/"that" left behind by "remind me … to <task>".
  let title = rest.replace(/\s+/g, " ").trim();
  if (remind) title = title.replace(/^(?:to|that)\s+/i, "");
  return { title, tags, listName, priority, dueAt, isAllDay, rrule, remind, tokens };
}
