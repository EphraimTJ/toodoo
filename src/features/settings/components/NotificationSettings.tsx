import { useDesktopConfig } from "../hooks/useDesktopConfig";
import {
  NOTIF_META,
  playNotif,
  useNotifSounds,
  type NotifKind,
} from "../../reminders/hooks/useNotifSound";

const KINDS: NotifKind[] = ["reminder", "habit", "focusDone", "breakOver"];

/** Notifications panel: action buttons, snooze duration, and a distinct sound
 *  per notification type. Toggles apply natively in Tauri; browser mirrors. */
export function NotificationSettings() {
  const { query, setNotifActions, setNotifSnoozeMin } = useDesktopConfig();
  const { sounds, setSounds } = useNotifSounds();
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
          className="rounded-full border border-border bg-bg px-2 py-0.5 text-sm"
        >
          <option value={5}>5 minutes</option>
          <option value={10}>10 minutes</option>
          <option value={30}>30 minutes</option>
          <option value={60}>60 minutes</option>
        </select>
      </label>

      <div className="space-y-3" data-testid="notif-sound-settings">
        <h4 className="text-xs font-medium text-text-muted">Sounds</h4>
        {KINDS.map((kind) => {
          const s = sounds[kind];
          const meta = NOTIF_META[kind];
          return (
            <div key={kind} className="space-y-1">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  role="switch"
                  aria-label={`${meta.label} sound`}
                  checked={s.enabled}
                  onChange={(e) =>
                    setSounds.mutate({ [kind]: { ...s, enabled: e.target.checked } } as Partial<
                      typeof sounds
                    >)
                  }
                />
                {meta.label}
              </label>
              {s.enabled && (
                <div className="flex flex-wrap items-center gap-3 pl-6 text-sm">
                  <label className="flex items-center gap-2">
                    <span className="text-xs text-text-muted">Volume</span>
                    <input
                      type="range"
                      min={0}
                      max={100}
                      aria-label={`${meta.label} volume`}
                      value={Math.round(s.volume * 100)}
                      onChange={(e) =>
                        setSounds.mutate({ [kind]: { ...s, volume: Number(e.target.value) / 100 } } as Partial<
                          typeof sounds
                        >)
                      }
                    />
                  </label>
                  {kind === "reminder" && (
                    <label className="flex items-center gap-2">
                      <span className="text-xs text-text-muted">Chime</span>
                      <select
                        aria-label="Chirp variant"
                        value={s.variant}
                        onChange={(e) =>
                          setSounds.mutate({ reminder: { ...s, variant: Number(e.target.value) } })
                        }
                        className="rounded-full border border-border bg-bg px-2 py-0.5 text-sm"
                      >
                        <option value={1}>Soft</option>
                        <option value={2}>Bright</option>
                        <option value={3}>Mellow</option>
                      </select>
                    </label>
                  )}
                  <button
                    type="button"
                    className="rounded-full border border-border px-2.5 py-1 text-xs hover:bg-bg"
                    onClick={() => playNotif(kind, { ...sounds, [kind]: { ...s, enabled: true } })}
                    data-testid={kind === "reminder" ? "chirp-preview" : `${kind}-preview`}
                  >
                    Preview
                  </button>
                </div>
              )}
              <p className="pl-6 text-[11px] text-text-muted">{meta.hint}</p>
            </div>
          );
        })}
        <p className="text-xs text-text-muted">
          Native Windows toasts keep the system sound; these play on the in-app
          notifications.
        </p>
      </div>
    </div>
  );
}
