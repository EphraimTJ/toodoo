/**
 * TypeScript mirror of the Rust `repo::search::push_recent` ring buffer, for the
 * browser stub. Pinned to the same unit tests so the two can't drift.
 */

/** Prepend `query` to `existing`: trimmed, blank ignored, case-insensitive
 *  dedupe, newest first, capped at `cap`. */
export function pushRecent(existing: string[], query: string, cap: number): string[] {
  const q = query.trim();
  if (!q) return [...existing];
  const out = [q, ...existing.filter((e) => e.trim().toLowerCase() !== q.toLowerCase())];
  return out.slice(0, cap);
}

export const RECENT_CAP = 12;
