import { Music, Pause, Play, Volume2 } from "lucide-react";
import { AMBIENT_TRACKS, type AmbientTrack } from "../hooks/useAmbient";
import { useSharedAmbient } from "../FocusProvider";

/** Compact focus-music bar for the Timer page. Jazzy lo-fi is selected by
 *  default; the always-present play button starts it with or without a focus
 *  session, and a session starting/stopping plays/pauses the same shared
 *  audio (Ctrl+Shift+F included). */
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

      <button
        type="button"
        disabled={!track}
        aria-label={playing ? "Pause music" : "Play music"}
        onClick={() => setPlaying(!playing)}
        className={`flex shrink-0 items-center rounded-full border p-1.5 ${
          playing
            ? "border-accent text-accent"
            : "border-border text-text-muted hover:text-text"
        } disabled:opacity-40`}
      >
        {playing ? <Pause size={13} strokeWidth={2} /> : <Play size={13} strokeWidth={2} />}
      </button>

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
    </div>
  );
}
