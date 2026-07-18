import { describe, expect, it } from "vitest";
import { isScheduled, streak, type Freq } from "./streak";

const marks = (pairs: [string, string][]): [string, string][] => pairs;

describe("habit streak (mirrors habits.rs)", () => {
  const daily: Freq = { kind: "daily" };

  it("counts done and breaks on a past miss", () => {
    const m = marks([
      ["2026-03-02", "DONE"],
      ["2026-03-03", "DONE"],
      ["2026-03-04", "DONE"],
      ["2026-03-05", "DONE"],
    ]);
    const s = streak(daily, m, "2026-03-08");
    expect(s.best).toBe(4);
    expect(s.current).toBe(0);
  });

  it("today-missing is grace", () => {
    const m = marks([
      ["2026-03-06", "DONE"],
      ["2026-03-07", "DONE"],
      ["2026-03-08", "DONE"],
    ]);
    expect(streak(daily, m, "2026-03-09")).toEqual({ current: 3, best: 3 });
  });

  it("skip is neutral", () => {
    const m = marks([
      ["2026-03-06", "DONE"],
      ["2026-03-07", "SKIP"],
      ["2026-03-08", "DONE"],
    ]);
    expect(streak(daily, m, "2026-03-08")).toEqual({ current: 2, best: 2 });
  });

  it("weekday habit ignores off days", () => {
    const freq: Freq = { kind: "weekdays", days: [1, 3, 5] };
    const m = marks([
      ["2026-03-02", "DONE"],
      ["2026-03-04", "DONE"],
      ["2026-03-06", "DONE"],
    ]);
    expect(streak(freq, m, "2026-03-07")).toEqual({ current: 3, best: 3 });
    expect(isScheduled(freq, "2026-03-07")).toBe(false); // Saturday
  });

  it("weekly counts consecutive periods meeting the target", () => {
    const freq: Freq = { kind: "weekly", times: 3 };
    const m = marks([
      ["2026-03-02", "DONE"],
      ["2026-03-03", "DONE"],
      ["2026-03-05", "DONE"],
      ["2026-03-09", "DONE"],
      ["2026-03-10", "DONE"],
      ["2026-03-11", "DONE"],
    ]);
    expect(streak(freq, m, "2026-03-10")).toEqual({ current: 2, best: 2 });
  });
});
