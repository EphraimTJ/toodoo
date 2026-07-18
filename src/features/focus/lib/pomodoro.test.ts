import { describe, expect, it } from "vitest";
import { advancePhase, DEFAULT_POMO_CONFIG, formatClock, phaseDurationSec } from "./pomodoro";

const cfg = DEFAULT_POMO_CONFIG;

describe("pomodoro cycle", () => {
  it("uses configured durations", () => {
    expect(phaseDurationSec("work", cfg)).toBe(25 * 60);
    expect(phaseDurationSec("short", cfg)).toBe(5 * 60);
    expect(phaseDurationSec("long", cfg)).toBe(15 * 60);
  });

  it("work → short for the first three pomos, long on the fourth", () => {
    expect(advancePhase("work", 0, cfg)).toEqual({ phase: "short", pomoCompleted: true });
    expect(advancePhase("work", 2, cfg)).toEqual({ phase: "short", pomoCompleted: true });
    // Completing the 4th pomo (pomosBefore=3) yields a long break.
    expect(advancePhase("work", 3, cfg)).toEqual({ phase: "long", pomoCompleted: true });
    expect(advancePhase("work", 7, cfg)).toEqual({ phase: "long", pomoCompleted: true });
  });

  it("any break returns to work without completing a pomo", () => {
    expect(advancePhase("short", 3, cfg)).toEqual({ phase: "work", pomoCompleted: false });
    expect(advancePhase("long", 4, cfg)).toEqual({ phase: "work", pomoCompleted: false });
  });

  it("respects a custom long-break interval", () => {
    const custom = { ...cfg, longEvery: 2 };
    expect(advancePhase("work", 1, custom).phase).toBe("long"); // 2nd pomo
    expect(advancePhase("work", 0, custom).phase).toBe("short");
  });

  it("formats a clock", () => {
    expect(formatClock(25 * 60)).toBe("25:00");
    expect(formatClock(65)).toBe("01:05");
    expect(formatClock(-3)).toBe("00:00");
  });
});
