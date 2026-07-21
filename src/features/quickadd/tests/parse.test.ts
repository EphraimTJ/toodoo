import { describe, expect, it } from "vitest";
import { parseQuickAdd } from "../lib/parse";

// A fixed reference so "in 2 days" is deterministic.
const REF = new Date("2026-03-10T09:00:00");

describe("parseQuickAdd — remind me", () => {
  it("recognises 'remind me in 2 days to …' like TickTick", () => {
    const p = parseQuickAdd("remind me in 2 days to start a new app", REF);
    expect(p.title).toBe("start a new app");
    expect(p.remind).toBe(true);
    expect(p.dueAt).not.toBeNull();
    // "remind me" and the date each become a chip.
    expect(p.tokens.some((t) => t.kind === "remind")).toBe(true);
    expect(p.tokens.some((t) => t.kind === "date")).toBe(true);
  });

  it("handles 'remind me to …' with no date", () => {
    const p = parseQuickAdd("remind me to call mum", REF);
    expect(p.title).toBe("call mum");
    expect(p.remind).toBe(true);
    expect(p.dueAt).toBeNull();
  });

  it("leaves non-reminder input untouched", () => {
    const p = parseQuickAdd("buy milk #groceries", REF);
    expect(p.remind).toBe(false);
    expect(p.title).toBe("buy milk");
    expect(p.tags).toEqual(["groceries"]);
  });

  it("still parses priority and tags alongside a reminder", () => {
    const p = parseQuickAdd("remind me tomorrow to pay rent ~Bills #finance !high", REF);
    expect(p.remind).toBe(true);
    expect(p.title).toBe("pay rent");
    expect(p.priority).toBe(5);
    expect(p.tags).toEqual(["finance"]);
    expect(p.listName).toBe("Bills");
  });
});
