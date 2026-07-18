import { describe, expect, it } from "vitest";
import { accentForeground, asMode, normalizeAccent, resolveDark } from "./theme";

describe("resolveDark", () => {
  it("explicit modes ignore the OS preference", () => {
    expect(resolveDark("light", true)).toBe(false);
    expect(resolveDark("dark", false)).toBe(true);
  });
  it("auto follows the OS preference", () => {
    expect(resolveDark("auto", true)).toBe(true);
    expect(resolveDark("auto", false)).toBe(false);
  });
});

describe("accentForeground", () => {
  it("picks a legible foreground by luminance", () => {
    expect(accentForeground("#4772fa")).toBe("#ffffff"); // mid-blue → white text
    expect(accentForeground("#f0a825")).toBe("#000000"); // amber → black text
    expect(accentForeground("#ffffff")).toBe("#000000");
    expect(accentForeground("#000000")).toBe("#ffffff");
  });
  it("falls back to white on a bad value", () => {
    expect(accentForeground("nope")).toBe("#ffffff");
  });
});

describe("normalizers", () => {
  it("normalizes modes and accents", () => {
    expect(asMode("auto")).toBe("auto");
    expect(asMode("bogus")).toBe("light");
    expect(normalizeAccent("4772FA")).toBe("#4772fa");
    expect(normalizeAccent("#abc")).toBeNull();
    expect(normalizeAccent(42)).toBeNull();
  });
});
