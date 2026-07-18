import { describe, expect, it } from "vitest";
import { pushRecent } from "./recent";

// Mirrors the Rust `push_recent` tests so the ring buffer can't drift.
describe("pushRecent", () => {
  it("puts newest first", () => {
    expect(pushRecent(["a"], "b", 5)).toEqual(["b", "a"]);
  });
  it("dedupes case-insensitively and moves to front", () => {
    expect(pushRecent(["Alpha", "beta"], "alpha", 5)).toEqual(["alpha", "beta"]);
  });
  it("ignores blank/whitespace", () => {
    expect(pushRecent(["x"], "   ", 5)).toEqual(["x"]);
  });
  it("trims and caps", () => {
    expect(pushRecent(["1", "2", "3"], "  0  ", 3)).toEqual(["0", "1", "2"]);
  });
});
