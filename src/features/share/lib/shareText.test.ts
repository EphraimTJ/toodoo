import { describe, expect, it } from "vitest";
import type { Task } from "../../../lib/api";
import { listToMarkdown, listToText, taskToMarkdown, taskToText } from "./shareText";

function task(over: Partial<Task>): Task {
  return {
    id: "t1",
    projectId: "inbox",
    sectionId: null,
    parentId: null,
    title: "Write report",
    contentRich: null,
    contentPlain: null,
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
    createdAt: "2026-03-01T00:00:00.000Z",
    updatedAt: "2026-03-01T00:00:00.000Z",
    tagIds: [],
    ...over,
  };
}

describe("shareText — task", () => {
  it("renders text with priority and due meta", () => {
    const t = task({ priority: 5, dueAt: "2026-03-10T00:00:00.000Z", contentPlain: "with charts" });
    const text = taskToText(t);
    expect(text).toContain("Write report");
    expect(text).toContain("Priority: High");
    expect(text).toContain("Due: 2026-03-10");
    expect(text).toContain("with charts");
  });

  it("renders a markdown checkbox that reflects completion", () => {
    expect(taskToMarkdown(task({}))).toBe("- [ ] Write report");
    expect(taskToMarkdown(task({ status: "COMPLETED" }))).toBe("- [x] Write report");
    expect(taskToMarkdown(task({ priority: 1 }))).toContain("  - Priority: Low");
  });
});

describe("shareText — list", () => {
  const tasks = [task({ id: "a", title: "One" }), task({ id: "b", title: "Two", status: "COMPLETED" })];

  it("renders plain text with a header and checkbox lines", () => {
    const text = listToText("Groceries", tasks);
    expect(text.split("\n")[0]).toBe("Groceries");
    expect(text).toContain("[ ] One");
    expect(text).toContain("[x] Two");
  });

  it("renders markdown grouped under the list name", () => {
    const md = listToMarkdown("Groceries", tasks);
    expect(md).toContain("# Groceries");
    expect(md).toContain("- [ ] One");
    expect(md).toContain("- [x] Two");
    expect(listToMarkdown("Empty", [])).toContain("_(empty)_");
  });
});
