import { describe, expect, it } from "vitest";
import { countdownView } from "./countdown";

describe("countdownView (mirrors countdowns.rs)", () => {
  it("future target counts down", () => {
    expect(countdownView("2026-06-10", false, false, "2026-06-01")).toEqual({
      kind: "until",
      days: 9,
      refDate: "2026-06-10",
    });
  });

  it("past target counts since", () => {
    expect(countdownView("2026-05-01", false, false, "2026-06-01").days).toBe(31);
    expect(countdownView("2026-05-01", false, false, "2026-06-01").kind).toBe("since");
  });

  it("today is zero", () => {
    expect(countdownView("2026-06-01", false, false, "2026-06-01")).toEqual({
      kind: "until",
      days: 0,
      refDate: "2026-06-01",
    });
  });

  it("annual targets the next anniversary", () => {
    expect(countdownView("2020-12-25", true, false, "2026-06-01").refDate).toBe("2026-12-25");
    expect(countdownView("2020-12-25", true, false, "2026-12-26").refDate).toBe("2027-12-25");
  });

  it("count-up forces since", () => {
    const v = countdownView("2020-01-01", false, true, "2026-01-01");
    expect(v.kind).toBe("since");
    expect(v.days).toBe(2192); // 6 years incl. two leap days
  });
});
