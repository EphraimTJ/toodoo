import { describe, expect, it } from "vitest";
import { addDays, barGeometry, dateToX, dayIndex, xToDate, xToDay, ZOOM_PX_PER_DAY } from "./timeline";

describe("timeline geometry", () => {
  it("spans a bar inclusively from start to due", () => {
    expect(barGeometry("2026-03-01T00:00:00.000Z", "2026-03-05T00:00:00.000Z")).toEqual({
      start: "2026-03-01",
      days: 5,
    });
  });

  it("renders a single-date task as one day", () => {
    expect(barGeometry(null, "2026-03-10T00:00:00.000Z")).toEqual({ start: "2026-03-10", days: 1 });
    expect(barGeometry("2026-03-10T00:00:00.000Z", null)).toEqual({ start: "2026-03-10", days: 1 });
    expect(barGeometry(null, null)).toBeNull();
  });

  it("normalizes an inverted start/due range", () => {
    expect(barGeometry("2026-03-05", "2026-03-01")).toEqual({ start: "2026-03-01", days: 5 });
  });

  it("maps dates to x and back with day snapping at day zoom", () => {
    const ppd = ZOOM_PX_PER_DAY.day;
    const origin = "2026-03-01";
    expect(dayIndex("2026-03-04", origin)).toBe(3);
    expect(dateToX("2026-03-04", origin, ppd)).toBe(3 * ppd);
    // 3.1 days of pixels rounds to the 3rd day.
    expect(xToDate(3.1 * ppd, origin, ppd)).toBe("2026-03-04");
    // A point 3.9 days in still falls within day index 3.
    expect(xToDay(3.9 * ppd, origin, ppd)).toBe("2026-03-04");
  });

  it("adds days across a month boundary", () => {
    expect(addDays("2026-03-30", 3)).toBe("2026-04-02");
    expect(addDays("2026-03-02", -5)).toBe("2026-02-25");
  });
});
