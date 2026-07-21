import { Music, Pause, Play, Square, Volume2 } from "lucide-react";
import { AMBIENT_TRACKS, type AmbientTrack } from "../hooks/useAmbient";
import { useSharedAmbient } from "../FocusProvider";

/** Compact focus-music bar for the Timer page: pick a track (or the lo-fi that
 *  the focus hotkey starts), pause/resume, adjust volume, or stop. Drives the
 *  same shared audio as the Ctrl+Shift+F hotkey. */
export function AmbientControls() {
  const { track, setTrack, playing, setPlaying, volume, setVolume } = useSharedAmbient();

  return (
    <div
      className="mx-auto mt-3 flex max-w-sm items-center gap-2 rounded-xl border border-border bg-surface px-3 py-2 text-sm"
      data-testid="ambient-controls"
    >
      <Music size={15} strokeWidth={1.75} className="shrink-0 text-text-muted" />
      <select
        aria-label="Focus music"
        value={track ?? ""}
        onChange={(e) => setTrack((e.target.value || null) as AmbientTrack | null)}
        className="min-w-0 flex-1 rounded border border-border bg-bg px-2 py-1 text-sm outline-none focus:border-accent"
      >
        <option value="">Off</option>
        {(Object.keys(AMBIENT_TRACKS) as AmbientTrack[]).map((t) => (
          <option key={t} value={t}>
            {AMBIENT_TRACKS[t].label}
          </option>
        ))}
      </select>

      {track && (
        <button
          type="button"
          aria-label={playing ? "Pause music" : "Play music"}
          onClick={() => setPlaying(!playing)}
          className="flex shrink-0 items-center rounded-full border border-border p-1.5 text-text-muted hover:text-text"
        >
          {playing ? <Pause size={13} strokeWidth={2} /> : <Play size={13} strokeWidth={2} />}
        </button>
      )}

      <span className="flex shrink-0 items-center gap-1 text-text-muted">
        <Volume2 size={14} strokeWidth={1.75} />
        <input
          type="range"
          min={0}
          max={1}
          step={0.05}
          value={volume}
          aria-label="Music volume"
          onChange={(e) => setVolume(Number(e.target.value))}
          className="w-20 accent-(--color-accent)"
        />
      </span>

      {track && (
        <button
          type="button"
          aria-label="Stop music"
          onClick={() => setTrack(null)}
          className="flex shrink-0 items-center rounded-full border border-border p-1.5 text-text-muted hover:text-destructive"
        >
          <Square size={12} strokeWidth={2} />
        </button>
      )}
    </div>
  );
}
