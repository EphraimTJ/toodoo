/**
 * Pure theme helpers (unit-tested). The React layer applies the result to the
 * DOM (`.dark` class, `--color-accent` variables, root font-size).
 */

export type ThemeMode = "light" | "dark" | "auto";
export type FontSize = "small" | "medium" | "large";

// "Stone & Sage" earthy accent family. Index 0 (sage) is the app default.
export const ACCENT_PRESETS = [
  "#6c7e58", // sage
  "#4f6f52", // pine
  "#b0763f", // ochre
  "#a75a41", // clay
  "#4f7d76", // teal
  "#8a6f8e", // mauve
  "#a8586b", // dusty rose
  "#7a756a", // stone
] as const;

export const FONT_PX: Record<FontSize, number> = { small: 14, medium: 16, large: 18 };

/** Whether dark styling should apply. `auto` follows the OS `prefersDark`. */
export function resolveDark(mode: ThemeMode, prefersDark: boolean): boolean {
  if (mode === "dark") return true;
  if (mode === "light") return false;
  return prefersDark;
}

/** A legible foreground (`#000`/`#fff`) for text on `hex`, via relative luminance. */
export function accentForeground(hex: string): "#000000" | "#ffffff" {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return "#ffffff";
  const n = parseInt(m[1], 16);
  const channel = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  const lum =
    0.2126 * channel((n >> 16) & 0xff) +
    0.7152 * channel((n >> 8) & 0xff) +
    0.0722 * channel(n & 0xff);
  // Use white on saturated/dark accents and black only on genuinely light ones —
  // a threshold (0.4) tuned to the accent-button convention rather than the raw
  // WCAG crossover, so mid-tone blues/greens/purples still read with white text.
  return lum > 0.4 ? "#000000" : "#ffffff";
}

/** Normalize a stored value to a valid mode. */
export function asMode(v: unknown): ThemeMode {
  return v === "dark" || v === "auto" ? v : "light";
}

export function asFontSize(v: unknown): FontSize {
  return v === "small" || v === "large" ? v : "medium";
}

/** Accept `#rrggbb` (with/without `#`); else null. */
export function normalizeAccent(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const m = /^#?([0-9a-f]{6})$/i.exec(v.trim());
  return m ? `#${m[1].toLowerCase()}` : null;
}
