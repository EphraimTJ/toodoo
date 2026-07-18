import { describe, expect, it } from "vitest";
import type { Project, Rule, Tag, Task } from "../../../lib/api";
import { evaluateRule, parseQuery, resolveQuery } from "./rule";

const TODAY = "2026-07-15";

function task(overrides: Partial<Task> = {}): Task {
  return {
    id: "t1",
    projectId: "inbox",
    sectionId: null,
    parentId: null,
    title: "Buy oat milk",
    contentRich: null,
    contentPlain: "from the corner store",
    kind: "TASK",
    status: "ACTIVE",
    priority: 0,
    startAt: null,
    dueAt: null,
    isAllDay: true,
    durationMin: null,
    timeZone: null,
    rrule: null,
    repeatFrom: null,
    pinned: false,
    estPomos: null,
    estDurationMin: null,
    sortOrder: 0,
    completedAt: null,
    createdAt: "2026-07-01T00:00:00.000Z",
    updatedAt: "2026-07-01T00:00:00.000Z",
    tagIds: [],
    ...overrides,
  };
}

const all = (conditions: Rule["conditions"]): Rule => ({ match: "all", conditions });

describe("evaluateRule (mirrors filter_rule.rs)", () => {
  it("empty rule matches everything", () => {
    expect(evaluateRule(all([]), task(), TODAY, 0)).toBe(true);
  });

  it("all vs any", () => {
    const t = task({ priority: 5, projectId: "work" });
    const conds: Rule["conditions"] = [
      { field: "priority", values: [5] },
      { field: "list", ids: ["home"] },
    ];
    expect(evaluateRule({ match: "all", conditions: conds }, t, TODAY, 0)).toBe(false);
    expect(evaluateRule({ match: "any", conditions: conds }, t, TODAY, 0)).toBe(true);
  });

  it("keyword is case-insensitive over title and notes", () => {
    expect(evaluateRule(all([{ field: "keyword", text: "OAT" }]), task(), TODAY, 0)).toBe(true);
    expect(evaluateRule(all([{ field: "keyword", text: "corner" }]), task(), TODAY, 0)).toBe(true);
    expect(evaluateRule(all([{ field: "keyword", text: "almond" }]), task(), TODAY, 0)).toBe(false);
  });

  it("due ops and observer timezone", () => {
    const overdue = task({ dueAt: "2026-07-10T00:00:00.000Z" });
    expect(evaluateRule(all([{ field: "due", op: { kind: "overdue" } }]), overdue, TODAY, 0)).toBe(true);

    const timed = task({ isAllDay: false, dueAt: "2026-07-15T23:30:00.000Z" });
    expect(evaluateRule(all([{ field: "due", op: { kind: "today" } }]), timed, TODAY, 0)).toBe(true);
    expect(evaluateRule(all([{ field: "due", op: { kind: "tomorrow" } }]), timed, TODAY, 120)).toBe(
      true,
    );
  });
});

describe("parseQuery + resolveQuery (mirrors query.rs)", () => {
  const projects = [{ id: "work", name: "Work" } as Project];
  const tags = [{ id: "tag-u", name: "urgent" } as Tag];

  it("combines tag/priority/due with AND and OR flips the combinator", () => {
    expect(parseQuery("#urgent priority:high due:today")).toEqual({
      match: "all",
      conditions: [
        { t: "tagName", name: "urgent" },
        { t: "priority", value: 5 },
        { t: "due", op: { kind: "today" } },
      ],
    });
    expect(parseQuery("list:A OR list:B").match).toBe("any");
  });

  it("resolves names to ids", () => {
    const rule = resolveQuery(parseQuery("~Work #urgent"), projects, tags);
    expect(rule.conditions).toEqual([
      { field: "list", ids: ["work"] },
      { field: "tag", ids: ["tag-u"] },
    ]);
  });

  it("quoted phrase is one keyword; unknown prefix falls back to keyword", () => {
    expect(parseQuery('"buy milk" foo:bar').conditions).toEqual([
      { t: "keyword", text: "buy milk" },
      { t: "keyword", text: "foo:bar" },
    ]);
  });
});
