import { useAppearance } from "../hooks/useAppearance";
import { ACCENT_PRESETS, type FontSize, type ThemeMode } from "../lib/theme";

const MODES: [ThemeMode, string][] = [
  ["light", "Light"],
  ["dark", "Dark"],
  ["auto", "Auto"],
];
const SIZES: [FontSize, string][] = [
  ["small", "S"],
  ["medium", "M"],
  ["large", "L"],
];

/** Theme mode, accent color, and font size. */
export function AppearanceSettings() {
  const { mode, accent, fontSize, setMode, setAccent, setFontSize } = useAppearance();

  return (
    <div className="space-y-4" data-testid="appearance-settings">
      <div>
        <div className="mb-1 text-xs font-medium text-text-muted">Theme</div>
        <div className="inline-flex gap-1 rounded-md border border-border p-0.5 text-xs">
          {MODES.map(([m, label]) => (
            <button
              key={m}
              type="button"
              aria-label={`Theme ${label}`}
              aria-pressed={mode === m}
              onClick={() => setMode(m)}
              className={`rounded px-2.5 py-1 ${mode === m ? "bg-accent text-accent-fg" : "text-text-muted"}`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div>
        <div className="mb-1 text-xs font-medium text-text-muted">Accent</div>
        <div className="flex flex-wrap items-center gap-2">
          {ACCENT_PRESETS.map((c) => (
            <button
              key={c}
              type="button"
              aria-label={`Accent ${c}`}
              onClick={() => setAccent(c)}
              style={{ background: c }}
              className={`h-6 w-6 rounded-full border-2 ${accent.toLowerCase() === c ? "border-text" : "border-transparent"}`}
            />
          ))}
          <label className="ml-1 flex items-center gap-1 text-xs text-text-muted">
            Custom
            <input
              type="color"
              aria-label="Custom accent"
              value={accent}
              onChange={(e) => setAccent(e.target.value)}
              className="h-6 w-8 cursor-pointer rounded border border-border bg-transparent p-0"
            />
          </label>
        </div>
      </div>

      <div>
        <div className="mb-1 text-xs font-medium text-text-muted">Font size</div>
        <div className="inline-flex gap-1 rounded-md border border-border p-0.5 text-xs">
          {SIZES.map(([s, label]) => (
            <button
              key={s}
              type="button"
              aria-label={`Font size ${label}`}
              aria-pressed={fontSize === s}
              onClick={() => setFontSize(s)}
              className={`rounded px-2.5 py-1 ${fontSize === s ? "bg-accent text-accent-fg" : "text-text-muted"}`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
