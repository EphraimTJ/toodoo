/**
 * TypeScript mirror of the Rust `repo::importers` CSV parsers, for the browser
 * stub (vite dev + Vitest). Pinned to the same unit tests as Rust so the two
 * can't drift. The Rust repository layer remains the source of truth.
 */

export type ImportKind = "ticktick" | "todoist" | "generic";

export interface ImportTask {
  list: string;
  title: string;
  content: string | null;
  priority: number | null;
  dueAt: string | null;
  startAt: string | null;
  completed: boolean;
  tags: string[];
}

/** Parse CSV text into records, honoring quotes and embedded newlines, and
 *  dropping blank lines (matching the Rust `csv` reader's behavior). */
function records(text: string): string[][] {
  const rows: string[][] = [];
  let field = "";
  let row: string[] = [];
  let quoted = false;
  let i = 0;
  const endField = () => {
    row.push(field);
    field = "";
  };
  const endRow = () => {
    endField();
    rows.push(row);
    row = [];
  };
  while (i < text.length) {
    const c = text[i];
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 2;
        } else {
          quoted = false;
          i += 1;
        }
      } else {
        field += c;
        i += 1;
      }
      continue;
    }
    if (c === '"') {
      quoted = true;
      i += 1;
    } else if (c === ",") {
      endField();
      i += 1;
    } else if (c === "\r") {
      i += 1;
    } else if (c === "\n") {
      endRow();
      i += 1;
    } else {
      field += c;
      i += 1;
    }
  }
  if (field.length > 0 || row.length > 0) endRow();
  // A blank line becomes a single empty field — drop those, like the Rust reader.
  return rows.filter((r) => !(r.length === 1 && r[0] === ""));
}

function colMap(header: string[]): Map<string, number> {
  const m = new Map<string, number>();
  header.forEach((h, i) => m.set(h.trim().toLowerCase(), i));
  return m;
}

function headerIndex(recs: string[][], mustHave: string[]): number {
  return recs.findIndex((rec) => {
    const fields = rec.map((f) => f.trim().toLowerCase());
    return mustHave.every((m) => fields.includes(m));
  });
}

function field(rec: string[], map: Map<string, number>, keys: string[]): string | undefined {
  for (const k of keys) {
    const idx = map.get(k);
    if (idx !== undefined) {
      const v = rec[idx]?.trim();
      if (v) return v;
    }
  }
  return undefined;
}

function normDate(s: string | undefined): string | null {
  if (!s) return null;
  const t = s.trim();
  if (!t) return null;
  if (t.length === 10 && t[4] === "-") return `${t}T00:00:00.000Z`;
  return t;
}

function splitTags(s: string | undefined): string[] {
  if (!s) return [];
  return s
    .split(",")
    .map((t) => t.trim())
    .filter((t) => t.length > 0);
}

export function parseTicktickCsv(text: string): ImportTask[] {
  const recs = records(text);
  const h = headerIndex(recs, ["title"]);
  if (h < 0) return [];
  const map = colMap(recs[h]);
  const out: ImportTask[] = [];
  for (const rec of recs.slice(h + 1)) {
    const title = field(rec, map, ["title"]);
    if (!title) continue;
    out.push({
      list: field(rec, map, ["list name", "list"]) ?? "",
      title,
      content: field(rec, map, ["content", "notes"]) ?? null,
      priority: toInt(field(rec, map, ["priority"])),
      dueAt: normDate(field(rec, map, ["due date", "duedate", "due"])),
      startAt: normDate(field(rec, map, ["start date", "startdate", "start"])),
      completed: field(rec, map, ["status"]) === "2",
      tags: splitTags(field(rec, map, ["tags"])),
    });
  }
  return out;
}

function todoistPriority(n: number): number {
  return n === 4 ? 5 : n === 3 ? 3 : n === 2 ? 1 : 0;
}

export function parseTodoistCsv(text: string): ImportTask[] {
  const recs = records(text);
  const h = headerIndex(recs, ["type", "content"]);
  if (h < 0) return [];
  const map = colMap(recs[h]);
  const out: ImportTask[] = [];
  for (const rec of recs.slice(h + 1)) {
    if (field(rec, map, ["type"]) !== "task") continue;
    const title = field(rec, map, ["content"]);
    if (!title) continue;
    const p = toInt(field(rec, map, ["priority"]));
    out.push({
      list: "",
      title,
      content: field(rec, map, ["description"]) ?? null,
      priority: p === null ? null : todoistPriority(p),
      dueAt: normDate(field(rec, map, ["date", "due"])),
      startAt: null,
      completed: false,
      tags: [],
    });
  }
  return out;
}

function genericPriority(s: string): number | null {
  const n = Number(s);
  if (Number.isInteger(n) && String(n) === s.trim()) {
    return [0, 1, 3, 5].includes(n) ? n : null;
  }
  switch (s.toLowerCase()) {
    case "high":
      return 5;
    case "medium":
    case "med":
      return 3;
    case "low":
      return 1;
    case "none":
      return 0;
    default:
      return null;
  }
}

function truthy(s: string): boolean {
  return ["1", "true", "yes", "x", "done", "completed"].includes(s.toLowerCase());
}

export function parseGenericCsv(text: string): ImportTask[] {
  const recs = records(text);
  if (recs.length === 0) return [];
  const map = colMap(recs[0]);
  const out: ImportTask[] = [];
  for (const rec of recs.slice(1)) {
    const title = field(rec, map, ["title", "name", "task"]);
    if (!title) continue;
    const prioRaw = field(rec, map, ["priority"]);
    const completedRaw = field(rec, map, ["completed", "done", "status"]);
    out.push({
      list: field(rec, map, ["list", "project"]) ?? "",
      title,
      content: field(rec, map, ["content", "notes", "description"]) ?? null,
      priority: prioRaw ? genericPriority(prioRaw) : null,
      dueAt: normDate(field(rec, map, ["due", "due date", "duedate"])),
      startAt: normDate(field(rec, map, ["start", "start date", "startdate"])),
      completed: completedRaw ? truthy(completedRaw) : false,
      tags: splitTags(field(rec, map, ["tags"])),
    });
  }
  return out;
}

function toInt(s: string | undefined): number | null {
  if (s === undefined) return null;
  const n = Number(s);
  return Number.isInteger(n) ? n : null;
}

export function parseCsv(kind: ImportKind, text: string): ImportTask[] {
  if (kind === "ticktick") return parseTicktickCsv(text);
  if (kind === "todoist") return parseTodoistCsv(text);
  return parseGenericCsv(text);
}
