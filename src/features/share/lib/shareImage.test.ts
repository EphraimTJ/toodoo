import { describe, expect, it } from "vitest";
import type { Task } from "../../../lib/api";
import { buildTaskCard } from "./shareImage";

function task(over: Partial<Task>): Task {
  return {
    id: "t1", projectId: "inbox", sectionId: null, parentId: null,
    title: "Write report", contentRich: null, contentPlain: null, kind: "TASK",
    status: "ACTIVE", priority: 0, startAt: null, dueAt: null, isAllDay: true,
    durationMin: null, timeZone: null, rrule: null, repeatFrom: null, pinned: false,
    estPomos: null, estDurationMin: null, sortOrder: 0, completedAt: null,
    createdAt: "2026-03-01T00:00:00.000Z", updatedAt: "2026-03-01T00:00:00.000Z", tagIds: [],
    ...over,
  };
}

describe("buildTaskCard", () => {
  it("builds a card with the title, meta, and brand", () => {
    const card = buildTaskCard(task({ priority: 5, contentPlain: "with charts" }));
    expect(card.getAttribute("data-testid")).toBe("share-card");
    expect(card.textContent).toContain("Write report");
    expect(card.textContent).toContain("Priority: High");
    expect(card.textContent).toContain("with charts");
    expect(card.textContent).toContain("Toodoo");
  });
});
