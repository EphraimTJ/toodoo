/**
 * Pure Pomodoro cycle logic, independent of React/timers so it can be unit
 * tested directly. A work phase completes a "pomo"; after every
 * `longEvery` pomos the break is a long one. The `usePomodoro` hook drives an
 * interval over this and persists sessions via the repo.
 */

export type Phase = "work" | "short" | "long";

export interface PomoConfig {
  workMin: number;
  shortMin: number;
  longMin: number;
  longEvery: number; // long break after every N pomos
  autoStart: boolean; // auto-start the next phase when one ends
  dailyGoal: number; // target completed pomos per day
}

export const DEFAULT_POMO_CONFIG: PomoConfig = {
  workMin: 25,
  shortMin: 5,
  longMin: 15,
  longEvery: 4,
  autoStart: false,
  dailyGoal: 8,
};

export function phaseDurationSec(phase: Phase, config: PomoConfig): number {
  const minutes = phase === "work" ? config.workMin : phase === "short" ? config.shortMin : config.longMin;
  return Math.max(1, Math.round(minutes * 60));
}

/**
 * The phase that follows `current`. Completing a work phase advances the pomo
 * count and yields a long break every `longEvery` pomos; a break always returns
 * to work.
 *
 * @param pomosBefore total pomos completed *before* this transition.
 */
export function advancePhase(
  current: Phase,
  pomosBefore: number,
  config: PomoConfig,
): { phase: Phase; pomoCompleted: boolean } {
  if (current === "work") {
    const pomosAfter = pomosBefore + 1;
    const long = config.longEvery > 0 && pomosAfter % config.longEvery === 0;
    return { phase: long ? "long" : "short", pomoCompleted: true };
  }
  return { phase: "work", pomoCompleted: false };
}

export function formatClock(totalSec: number): string {
  const s = Math.max(0, Math.round(totalSec));
  const mm = Math.floor(s / 60);
  const ss = s % 60;
  return `${String(mm).padStart(2, "0")}:${String(ss).padStart(2, "0")}`;
}
