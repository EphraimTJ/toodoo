/**
 * TypeScript mirror of the Rust `stats` scoring math, for the browser stub
 * (vite dev + Vitest). Pinned to the same unit tests as Rust so the two can't
 * drift. The Rust repository layer remains the source of truth.
 */

/** Ascending (minScore, title) tiers. */
export const TIERS: [number, string][] = [
  [0, "Novice"],
  [100, "Rising"],
  [500, "Focused"],
  [2000, "Pro"],
  [10000, "Master"],
];

export interface Level {
  level: number;
  title: string;
  base: number;
  next: number | null;
}

/**
 * Points for completing a task: no due date → 1; done on or before the due day
 * → 2; late → 1. Day-granular (compare the YYYY-MM-DD prefixes).
 */
export function completionPoints(dueAt: string | null | undefined, completedAt: string): number {
  if (!dueAt) return 1;
  const done = completedAt.slice(0, 10);
  const due = dueAt.slice(0, 10);
  return done <= due ? 2 : 1;
}

/** The tier a cumulative score falls in. */
export function levelFor(score: number): Level {
  let idx = 0;
  TIERS.forEach(([threshold], i) => {
    if (score >= threshold) idx = i;
  });
  const [base, title] = TIERS[idx];
  const nextTier = TIERS[idx + 1];
  return { level: idx + 1, title, base, next: nextTier ? nextTier[0] : null };
}
