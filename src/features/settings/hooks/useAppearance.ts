import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../../../lib/api";
import {
  accentForeground,
  ACCENT_PRESETS,
  asFontSize,
  asMode,
  FONT_PX,
  normalizeAccent,
  resolveDark,
  type FontSize,
  type ThemeMode,
} from "../lib/theme";

export interface Appearance {
  mode: ThemeMode;
  accent: string;
  fontSize: FontSize;
}

const KEY = ["appearance"] as const;

const DEFAULT: Appearance = { mode: "light", accent: ACCENT_PRESETS[0], fontSize: "medium" };

/** Read the persisted appearance (mode / accent / font-size). */
export function useAppearance() {
  const queryClient = useQueryClient();

  const { data } = useQuery({
    queryKey: KEY,
    queryFn: async (): Promise<Appearance> => {
      const [mode, accent, fontSize] = await Promise.all([
        api.getSetting("theme.mode"),
        api.getSetting("theme.accent"),
        api.getSetting("theme.fontSize"),
      ]);
      return {
        mode: asMode(mode),
        accent: normalizeAccent(accent) ?? DEFAULT.accent,
        fontSize: asFontSize(fontSize),
      };
    },
  });
  const appearance = data ?? DEFAULT;

  const save = (key: string, value: string, patch: Partial<Appearance>) => {
    queryClient.setQueryData(KEY, { ...appearance, ...patch });
    void api.setSetting(key, value);
  };

  const setMode = (mode: ThemeMode) => save("theme.mode", mode, { mode });
  const setAccent = (accent: string) => save("theme.accent", accent, { accent });
  const setFontSize = (fontSize: FontSize) => save("theme.fontSize", fontSize, { fontSize });

  return {
    ...appearance,
    setMode,
    setAccent,
    setFontSize,
    toggleMode: () => setMode(appearance.mode === "dark" ? "light" : "dark"),
  };
}

/** Apply the current appearance to the document (root `.dark`, accent vars,
 *  font-size), re-applying when the OS light/dark preference changes in `auto`. */
export function useApplyAppearance(): void {
  const { mode, accent, fontSize } = useAppearance();

  useEffect(() => {
    const apply = () => {
      const prefersDark = window.matchMedia?.("(prefers-color-scheme: dark)").matches ?? false;
      const root = document.documentElement;
      root.classList.toggle("dark", resolveDark(mode, prefersDark));
      const acc = normalizeAccent(accent) ?? ACCENT_PRESETS[0];
      root.style.setProperty("--color-accent", acc);
      root.style.setProperty("--color-accent-fg", accentForeground(acc));
      root.style.fontSize = `${FONT_PX[fontSize]}px`;
    };
    apply();

    if (mode !== "auto" || !window.matchMedia) return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, [mode, accent, fontSize]);
}
