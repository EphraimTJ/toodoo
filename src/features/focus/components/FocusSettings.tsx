import { useFocusSettings } from "../hooks/useFocusSettings";

const NUMBERS: [keyof ReturnType<typeof useFocusSettings>["config"], string][] = [
  ["workMin", "Work minutes"],
  ["shortMin", "Short break"],
  ["longMin", "Long break"],
  ["longEvery", "Long break every N pomos"],
  ["dailyGoal", "Daily pomo goal"],
];

export function FocusSettings() {
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
            Play music when focus starts
            <span className="block text-xs text-text-muted">
              Starting the timer (or Ctrl+Shift+F) plays the selected track;
              stopping it pauses the music
            </span>
          </span>
          <input
            type="checkbox"
            checked={config.autoMusic}
            aria-label="Play music when focus starts"
            onChange={(e) => setConfig({ autoMusic: e.target.checked })}
            className="accent-(--color-accent)"
          />
        </label>
        <p className="pt-1 text-xs text-text-muted">
          Focus music (lo-fi and ambient noise) lives on the Timer tab.
        </p>
      </div>
    </div>
  );
}
