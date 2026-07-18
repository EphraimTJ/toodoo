import { useDesktopConfig } from "../hooks/useDesktopConfig";
import { playChirp, useNotifSound } from "../../reminders/hooks/useNotifSound";

/** Notifications panel: action buttons, snooze duration, and the "toodoo"
 *  chirp. The toggles apply natively in the Tauri app; the browser mirrors
 *  the config. */
export function NotificationSettings() {
  const { query, setNotifActions, setNotifSnoozeMin } = useDesktopConfig();
  const { sound, setSound } = useNotifSound();
  const cfg = query.data;

  if (!cfg) return <div className="p-1 text-sm text-text-muted">Loading…</div>;

  return (
    <div className="space-y-3" data-testid="notification-settings">
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          role="switch"
          aria-label="Notification action buttons"
          checked={cfg.notifActions}
          onChange={(e) => setNotifActions.mutate(e.target.checked)}
        />
        Complete / Snooze buttons on reminder notifications
      </label>
      <p className="text-xs text-text-muted">
        On Windows the native toast carries the buttons (they also work from the
        notification center while Toodoo is running); everywhere, a Complete /
        Snooze popover opens in-app when a reminder fires.
      </p>

      <label className="flex items-center gap-2 text-sm">
        <span className="text-xs font-medium text-text-muted">Snooze duration</span>
        <select
          aria-label="Snooze duration"
          data-testid="snooze-duration-select"
          value={cfg.notifSnoozeMin}
          onChange={(e) => setNotifSnoozeMin.mutate(Number(e.target.value))}
          className="rounded border border-border bg-bg px-1.5 py-0.5 text-sm"
        >
          <option value={5}>5 minutes</option>
          <option value={10}>10 minutes</option>
          <option value={30}>30 minutes</option>
          <option value={60}>60 minutes</option>
        </select>
      </label>

      <div className="space-y-2" data-testid="notif-sound-settings">
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            role="switch"
            aria-label="Notification sound"
            checked={sound.enabled}
            onChange={(e) => setSound.mutate({ enabled: e.target.checked })}
          />
          Notification sound (the &quot;toodoo&quot; chirp on in-app reminder toasts)
        </label>
        {sound.enabled && (
          <div className="flex flex-wrap items-center gap-3 pl-6 text-sm">
            <label className="flex items-center gap-2">
              <span className="text-xs text-text-muted">Volume</span>
              <input
                type="range"
                min={0}
                max={100}
                aria-label="Notification sound volume"
                value={Math.round(sound.volume * 100)}
                onChange={(e) => setSound.mutate({ volume: Number(e.target.value) / 100 })}
              />
            </label>
            <label className="flex items-center gap-2">
              <span className="text-xs text-text-muted">Variant</span>
              <select
                aria-label="Chirp variant"
                value={sound.variant}
                onChange={(e) => setSound.mutate({ variant: Number(e.target.value) })}
                className="rounded border border-border bg-bg px-1.5 py-0.5 text-sm"
              >
                <option value={1}>Toodoo 1 (soft)</option>
                <option value={2}>Toodoo 2 (bright)</option>
                <option value={3}>Toodoo 3 (mellow)</option>
              </select>
            </label>
            <button
              type="button"
              className="rounded border border-border px-2 py-1 text-xs hover:bg-bg"
              onClick={() => playChirp({ ...sound, enabled: true })}
              data-testid="chirp-preview"
            >
              Preview
            </button>
          </div>
        )}
        <p className="pl-6 text-xs text-text-muted">
          Native Windows toasts keep the system notification sound; the chirp
          plays on the in-app toast.
        </p>
      </div>
    </div>
  );
}
