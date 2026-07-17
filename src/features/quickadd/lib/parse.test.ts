import { describe, expect, it } from "vitest";
import { parseRrule } from "../../tasks/lib/rrule";
import { parseQuickAdd } from "./parse";

// Fixed reference so date parsing is deterministic: Mon 2026-03-02, 09:00 local.
const REF = new Date(2026, 2, 2, 9, 0, 0);

describe("parseQuickAdd — tokens", () => {
  it("parses tag, list, and priority, stripping them from the title", () => {
    const r = parseQuickAdd("Pay rent ~Bills #finance !high", REF);
    expect(r.title).toBe("Pay rent");
    expect(r.tags).toEqual(["finance"]);
    expect(r.listName).toBe("Bills");
    expect(r.priority).toBe(5);
  });

  it("supports multiple tags", () => {
    const r = parseQuickAdd("Ship #work #urgent", REF);
    expect(r.tags).toEqual(["work", "urgent"]);
    expect(r.title).toBe("Ship");
  });

  it("maps priority words", () => {
    expect(parseQuickAdd("a !medium", REF).priority).toBe(3);
    expect(parseQuickAdd("a !low", REF).priority).toBe(1);
    expect(parseQuickAdd("a !none", REF).priority).toBe(0);
    // Unknown ! word stays literal.
    const r = parseQuickAdd("a !bogus", REF);
    expect(r.priority).toBeNull();
    expect(r.title).toBe("a !bogus");
  });

  it("leaves plain text untouched", () => {
    const r = parseQuickAdd("Just a normal task", REF);
    expect(r).toMatchObject({ title: "Just a normal task", tags: [], listName: null, priority: null, dueAt: null, rrule: null });
    expect(r.tokens).toHaveLength(0);
  });
});

describe("parseQuickAdd — recurrence (round-trips through the picker parser)", () => {
  it.each([
    ["every day", "FREQ=DAILY"],
    ["every 2 weeks", "FREQ=WEEKLY;INTERVAL=2"],
    ["monthly", "FREQ=MONTHLY"],
    ["every friday", "FREQ=WEEKLY;BYDAY=FR"],
    ["every mon, wed", "FREQ=WEEKLY;BYDAY=MO,WE"],
  ])("%s → %s", (phrase, expected) => {
    const r = parseQuickAdd(`Standup ${phrase}`, REF);
    expect(r.rrule).toBe(expected);
    expect(parseRrule(r.rrule)).not.toBeNull(); // engine-accepted
    expect(r.title).toBe("Standup");
  });
});

describe("parseQuickAdd — dates & times", () => {
  it("parses an all-day date and marks it all-day", () => {
    const r = parseQuickAdd("Taxes tomorrow", REF);
    expect(r.isAllDay).toBe(true);
    expect(r.dueAt).toBe("2026-03-03T00:00:00.000Z");
    expect(r.title).toBe("Taxes");
  });

  it("parses a time and marks it timed", () => {
    const r = parseQuickAdd("Call 5pm", REF);
    expect(r.isAllDay).toBe(false);
    expect(r.dueAt).not.toBeNull();
    expect(new Date(r.dueAt!).getHours()).toBe(17);
    expect(r.title).toBe("Call");
  });

  it("does not eat 'every friday' as a date", () => {
    const r = parseQuickAdd("Review every friday", REF);
    expect(r.rrule).toBe("FREQ=WEEKLY;BYDAY=FR");
    expect(r.dueAt).toBeNull();
  });
});

describe("parseQuickAdd — chips carry exact spans", () => {
  it("each token's text is a substring of the input (for dismissal)", () => {
    const input = "Pay rent ~Bills #finance !high every month";
    const r = parseQuickAdd(input, REF);
    for (const t of r.tokens) expect(input).toContain(t.text);
    // Removing the tag span drops it on re-parse.
    const without = input.replace("#finance", "").replace(/\s+/g, " ").trim();
    expect(parseQuickAdd(without, REF).tags).toEqual([]);
  });
});
