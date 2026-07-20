import { describe, expect, it } from "vitest";
import type { Task } from "../../../lib/api";
import { dueChip } from "./sortGroup";

function task(over: Partial<Task>): Task {
  return {
    id: "t1", projectId: "inbox", sectionId: null, parentId: null, title: "t",
    contentRich: null, contentPlain: null, kind: "TASK", status: "ACTIVE", priority: 0,
    startAt: null, dueAt: null, isAllDay: true, durationMin: null, timeZone: null,
    rrule: null, repeatFrom: null, pinned: false, estPomos: null, estDurationMin: null,
    sortOrder: 0, completedAt: null, createdAt: "", updatedAt: "", tagIds: [],
    ...over,
  };
}

function at(hoursFromNow: number): string {
  return new Date(Date.now() + hoursFromNow * 3_600_000).toISOString();
}

// All-day values are stored as UTC midnight of the calendar date; this builds
// one for today's local date (the shape the app actually persists).
function allDayToday(): string {
  const n = new Date();
  const p = (x: number) => String(x).padStart(2, "0");
  return `${n.getFullYear()}-${p(n.getMonth() + 1)}-${p(n.getDate())}T00:00:00.000Z`;
}

describe("dueChip", () => {
  it("shows only the date for an all-day task due today", () => {
    const chip = dueChip(task({ dueAt: allDayToday(), isAllDay: true }));
    expect(chip?.text).toBe("Today");
  });

  it("appends the time for a timed task due today", () => {
    const chip = dueChip(task({ dueAt: at(2), isAllDay: false }));
    // e.g. "Today 3:45 PM" — starts with Today and carries a clock time.
    expect(chip?.text).toMatch(/^Today \d{1,2}:\d{2} (AM|PM)$/);
  });

  it("marks a timed task past its instant today as overdue", () => {
    const chip = dueChip(task({ dueAt: at(-1), isAllDay: false }));
    expect(chip?.overdue).toBe(true);
    // An all-day task 'due today' is never overdue mid-day.
    expect(dueChip(task({ dueAt: allDayToday(), isAllDay: true }))?.overdue).toBe(false);
  });

  it("returns null when there is no date", () => {
    expect(dueChip(task({}))).toBeNull();
  });
});
