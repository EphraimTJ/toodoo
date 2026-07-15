/**
 * TypeScript mirror of the Rust `filter_rule` evaluator and `query` parser. The
 * real app calls the Rust commands; this powers the browser stub (vite dev +
 * Vitest) and is unit-tested against the same cases as the Rust side so the two
 * cannot drift. The Rust repository layer remains the source of truth.
 */
import type { Condition, DueOp, Project, Rule, RuleMatch, Tag, Task } from "../../../lib/api";

function addDays(today: string, n: number): string {
  const d = new Date(`${today}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** Effective local date (YYYY-MM-DD) of a task, or null if it has no date. */
function effLocalDate(task: Task, tzOffMin: number): string | null {
  const base = task.dueAt ?? task.startAt;
  if (!base) return null;
  if (task.isAllDay) return base.slice(0, 10);
  return new Date(new Date(base).getTime() + tzOffMin * 60_000).toISOString().slice(0, 10);
}

function evalDue(op: DueOp, task: Task, today: string, tzOffMin: number): boolean {
  const eff = effLocalDate(task, tzOffMin);
  switch (op.kind) {
    case "none":
      return eff === null;
    case "overdue":
      return eff !== null && eff < today;
    case "today":
      return eff === today;
    case "tomorrow":
      return eff === addDays(today, 1);
    case "next7":
      return eff !== null && eff <= addDays(today, 6);
    case "range":
      if (eff === null) return false;
      return (!op.from || eff >= op.from) && (!op.to || eff <= op.to);
  }
}

function evalCondition(cond: Condition, task: Task, today: string, tzOffMin: number): boolean {
  switch (cond.field) {
    case "list":
      return cond.ids.includes(task.projectId);
    case "tag":
      return cond.ids.some((id) => task.tagIds.includes(id));
    case "priority":
      return cond.values.includes(task.priority);
    case "due":
      return evalDue(cond.op, task, today, tzOffMin);
    case "keyword": {
      const needle = cond.text.toLowerCase();
      if (!needle) return true;
      return (
        task.title.toLowerCase().includes(needle) ||
        (task.contentPlain ?? "").toLowerCase().includes(needle)
      );
    }
    case "kind":
      return cond.values.includes(task.kind);
    case "status":
      return cond.values.includes(task.status);
  }
}

/** Does `task` satisfy `rule`? An empty rule matches every task. */
export function evaluateRule(rule: Rule, task: Task, today: string, tzOffMin: number): boolean {
  if (rule.conditions.length === 0) return true;
  const results = rule.conditions.map((c) => evalCondition(c, task, today, tzOffMin));
  return rule.match === "all" ? results.every(Boolean) : results.some(Boolean);
}

// ---- text-syntax parser (mirror of repo/query.rs) --------------------------

type RawCondition =
  | { t: "listName"; name: string }
  | { t: "tagName"; name: string }
  | { t: "priority"; value: number }
  | { t: "due"; op: DueOp }
  | { t: "keyword"; text: string }
  | { t: "kind"; value: string }
  | { t: "status"; value: string };

interface RawQuery {
  match: RuleMatch;
  conditions: RawCondition[];
}

function tokenize(text: string): string[] {
  const out: string[] = [];
  let buf = "";
  let inQuotes = false;
  for (const c of text) {
    if (c === '"') inQuotes = !inQuotes;
    else if (/\s/.test(c) && !inQuotes) {
      if (buf) out.push(buf);
      buf = "";
    } else buf += c;
  }
  if (buf) out.push(buf);
  return out;
}

const priorityValue = (w: string): number | null =>
  ({ high: 5, medium: 3, med: 3, low: 1, none: 0 })[w.toLowerCase()] ?? null;

const dueKind = (w: string): DueOp | null => {
  const k = { today: "today", tomorrow: "tomorrow", next7: "next7", week: "next7", overdue: "overdue", none: "none" }[
    w.toLowerCase()
  ];
  return k ? ({ kind: k } as DueOp) : null;
};

const statusValue = (w: string): string | null =>
  ({ active: "ACTIVE", completed: "COMPLETED", done: "COMPLETED", wontdo: "WONT_DO", wont: "WONT_DO" })[
    w.toLowerCase()
  ] ?? null;

const kindValue = (w: string): string | null =>
  ({ task: "TASK", note: "NOTE" })[w.toLowerCase()] ?? null;

export function parseQuery(text: string): RawQuery {
  let match: RuleMatch = "all";
  const conditions: RawCondition[] = [];
  const kw = (s: string) => conditions.push({ t: "keyword", text: s });

  for (const tok of tokenize(text)) {
    if (tok === "OR") {
      match = "any";
      continue;
    }
    if (tok === "AND") continue;

    if (tok.startsWith("#")) {
      conditions.push({ t: "tagName", name: tok.slice(1) });
    } else if (tok.startsWith("~")) {
      conditions.push({ t: "listName", name: tok.slice(1) });
    } else if (tok.startsWith("!")) {
      const p = priorityValue(tok.slice(1));
      if (p === null) kw(tok);
      else conditions.push({ t: "priority", value: p });
    } else if (tok.startsWith("list:")) {
      conditions.push({ t: "listName", name: tok.slice(5) });
    } else if (tok.startsWith("tag:")) {
      conditions.push({ t: "tagName", name: tok.slice(4) });
    } else if (tok.startsWith("priority:")) {
      const p = priorityValue(tok.slice(9));
      if (p === null) kw(tok);
      else conditions.push({ t: "priority", value: p });
    } else if (tok.startsWith("due:")) {
      const op = dueKind(tok.slice(4));
      if (op === null) kw(tok);
      else conditions.push({ t: "due", op });
    } else if (tok.startsWith("is:")) {
      const s = statusValue(tok.slice(3));
      if (s === null) kw(tok);
      else conditions.push({ t: "status", value: s });
    } else if (tok.startsWith("type:")) {
      const k = kindValue(tok.slice(5));
      if (k === null) kw(tok);
      else conditions.push({ t: "kind", value: k });
    } else {
      kw(tok);
    }
  }
  return { match, conditions };
}

/** Resolve list/tag names to ids against the given lists/tags. */
export function resolveQuery(raw: RawQuery, projects: Project[], tags: Tag[]): Rule {
  const conditions: Condition[] = raw.conditions.map((rc) => {
    switch (rc.t) {
      case "listName":
        return { field: "list", ids: projects.filter((p) => p.name === rc.name).map((p) => p.id) };
      case "tagName":
        return { field: "tag", ids: tags.filter((t) => t.name === rc.name).map((t) => t.id) };
      case "priority":
        return { field: "priority", values: [rc.value] };
      case "due":
        return { field: "due", op: rc.op };
      case "keyword":
        return { field: "keyword", text: rc.text };
      case "kind":
        return { field: "kind", values: [rc.value] };
      case "status":
        return { field: "status", values: [rc.value] };
    }
  });
  return { match: raw.match, conditions };
}
