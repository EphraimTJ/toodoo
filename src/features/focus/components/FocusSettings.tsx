import { useFocusSettings } from "../hooks/useFocusSettings";
import { AMBIENT_TRACKS, type AmbientTrack } from "../hooks/useAmbient";

const NUMBERS: [keyof ReturnType<typeof useFocusSettings>["config"], string][] = [
  ["workMin", "Work minutes"],
  ["shortMin", "Short break"],
  ["longMin", "Long break"],
  ["longEvery", "Long break every N pomos"],
  ["dailyGoal", "Daily pomo goal"],
];

interface AmbientProps {
  track: AmbientTrack | null;
  setTrack(t: AmbientTrack | null): void;
  volume: number;
  setVolume(v: number): void;
}

export function FocusSettings({ ambient }: { ambient: AmbientProps }) {
  const { config, setConfig } = useFocusSettings();

  return (
    <div className="max-w-md space-y-4 p-4" data-testid="focus-settings">
      <div className="space-y-2">
        {NUMBERS.map(([key, label]) => (
          <label key={key} className="flex items-center justify-between text-sm">
            {label}
            <input
              type="number"
              min={1}
              value={config[key] as number}
              aria-label={label}
              onChange={(e) => setConfig({ [key]: Math.max(1, Number(e.target.value) || 1) })}
              className="w-20 rounded border border-border bg-bg px-2 py-1 text-right outline-none focus:border-accent"
            />
          </label>
        ))}
        <label className="flex items-center justify-between text-sm">
          Auto-start next phase
          <input
            type="checkbox"
            checked={config.autoStart}
            onChange={(e) => setConfig({ autoStart: e.target.checked })}
            className="accent-(--color-accent)"
          />
        </label>
        <label className="flex items-center justify-between text-sm">
          <span>
            Play lo-fi with focus hotkey
            <span className="block text-xs text-text-muted">
              Ctrl+Shift+F starts the current task’s timer
            </span>
          </span>
          <input
            type="checkbox"
            checked={config.autoMusic}
            aria-label="Play lo-fi with focus hotkey"
            onChange={(e) => setConfig({ autoMusic: e.target.checked })}
            className="accent-(--color-accent)"
          />
        </label>
      </div>

      <div className="space-y-2 border-t border-border pt-3">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-text-muted">Ambient sound</h3>
        <select
          aria-label="Ambient track"
          value={ambient.track ?? ""}
          onChange={(e) => ambient.setTrack((e.target.value || null) as AmbientTrack | null)}
          className="w-full rounded border border-border bg-bg px-2 py-1 text-sm outline-none focus:border-accent"
        >
          <option value="">Off</option>
          {(Object.keys(AMBIENT_TRACKS) as AmbientTrack[]).map((t) => (
            <option key={t} value={t}>
              {AMBIENT_TRACKS[t].label}
            </option>
          ))}
        </select>
        <label className="flex items-center gap-2 text-sm">
          Volume
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={ambient.volume}
            aria-label="Ambient volume"
            onChange={(e) => ambient.setVolume(Number(e.target.value))}
            className="flex-1 accent-(--color-accent)"
          />
        </label>
      </div>
    </div>
  );
}
