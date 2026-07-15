import { describe, expect, it } from "vitest";
import { composeRrule, describeRrule, parseRrule, type RecurrenceParts } from "./rrule";

describe("rrule helpers", () => {
  it("composes and round-trips a weekly rule with weekdays and a count", () => {
    const parts: RecurrenceParts = {
      freq: "WEEKLY",
      interval: 2,
      byDay: ["WE", "MO"], // out of order on purpose
      end: { kind: "count", count: 10 },
    };
    const rrule = composeRrule(parts);
    // Weekdays are canonicalized to calendar order on both compose and parse.
    expect(rrule).toBe("FREQ=WEEKLY;INTERVAL=2;BYDAY=MO,WE;COUNT=10");
    expect(parseRrule(rrule)).toEqual({ ...parts, byDay: ["MO", "WE"] });
  });

  it("omits interval when 1 and byday for non-weekly", () => {
    expect(composeRrule({ freq: "DAILY", interval: 1, byDay: ["MO"], end: { kind: "never" } })).toBe(
      "FREQ=DAILY",
    );
  });

  it("composes and parses an until bound", () => {
    const rrule = composeRrule({
      freq: "MONTHLY",
      interval: 1,
      byDay: [],
      end: { kind: "until", date: "2026-07-20" },
    });
    expect(rrule).toBe("FREQ=MONTHLY;UNTIL=20260720T235959Z");
    expect(parseRrule(rrule)?.end).toEqual({ kind: "until", date: "2026-07-20" });
  });

  it("accepts a full RRULE: prefixed line and ignores unknown parts", () => {
    const parts = parseRrule("RRULE:FREQ=WEEKLY;BYDAY=FR;WKST=MO");
    expect(parts).toEqual({
      freq: "WEEKLY",
      interval: 1,
      byDay: ["FR"],
      end: { kind: "never" },
    });
  });

  it("returns null for empty or freq-less input", () => {
    expect(parseRrule(null)).toBeNull();
    expect(parseRrule("")).toBeNull();
    expect(parseRrule("INTERVAL=2")).toBeNull();
  });

  it("describes rules in human terms", () => {
    expect(describeRrule("FREQ=DAILY")).toBe("Daily");
    expect(describeRrule("FREQ=WEEKLY;INTERVAL=2;BYDAY=MO,WE")).toBe("Every 2 weeks on Mon, Wed");
    expect(describeRrule("FREQ=MONTHLY;COUNT=3")).toBe("Monthly · 3×");
    expect(describeRrule(null)).toBeNull();
  });
});
