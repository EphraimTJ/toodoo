import { describe, expect, it } from "vitest";

import { completionPoints, levelFor } from "./score";

describe("completionPoints", () => {
  it("gives 1 when there is no due date", () => {
    expect(completionPoints(null, "2026-03-02T10:00:00.000Z")).toBe(1);
    expect(completionPoints(undefined, "2026-03-02T10:00:00.000Z")).toBe(1);
  });

  it("gives 2 when done on or before the due day", () => {
    expect(completionPoints("2026-03-02T23:59:00.000Z", "2026-03-02T10:00:00.000Z")).toBe(2);
    expect(completionPoints("2026-03-03T00:00:00.000Z", "2026-03-02T10:00:00.000Z")).toBe(2);
  });

  it("gives 1 when late", () => {
    expect(completionPoints("2026-03-01T00:00:00.000Z", "2026-03-02T10:00:00.000Z")).toBe(1);
  });
});

describe("levelFor", () => {
  it("classifies the tier boundaries", () => {
    expect(levelFor(0)).toMatchObject({ level: 1, title: "Novice", base: 0, next: 100 });
    expect(levelFor(99)).toMatchObject({ level: 1, title: "Novice", next: 100 });
    expect(levelFor(100)).toMatchObject({ level: 2, title: "Rising", base: 100, next: 500 });
    expect(levelFor(500)).toMatchObject({ level: 3, title: "Focused", base: 500, next: 2000 });
    expect(levelFor(2000)).toMatchObject({ level: 4, title: "Pro", base: 2000, next: 10000 });
    expect(levelFor(10000)).toMatchObject({ level: 5, title: "Master", base: 10000, next: null });
    expect(levelFor(999999)).toMatchObject({ level: 5, title: "Master", next: null });
  });
});
