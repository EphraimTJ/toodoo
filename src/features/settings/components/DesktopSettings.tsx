import { useEffect, useState } from "react";
import { useDesktopConfig } from "../hooks/useDesktopConfig";
import { playChirp, useNotifSound } from "../../reminders/hooks/useNotifSound";

/** Desktop panel: global quick-add hotkey, launch-at-login, notification actions.
 *  The toggles apply natively in the Tauri app; the browser mirrors the config. */
export function DesktopSettings() {
  const { query, setHotkey, setAutostart, setNotifActions, setSimplePopouts, setPopoutStyle } =
    useDesktopConfig();
  const { sound, setSound } = useNotifSound();
  const cfg = query.data;
  const [hotkey, setHotkeyDraft] = useState("");

  useEffect(() => {
    if (cfg) setHotkeyDraft(cfg.quickAddHotkey);
  }, [cfg]);

  if (!cfg) return <div className="p-1 text-sm text-text-muted">Loading…</div>;

  return (
    <div className="space-y-3" data-testid="desktop-settings">
      <label className="block text-sm">
        <span className="text-xs font-medium text-text-muted">Global quick-add hotkey</span>
        <input
          aria-label="Quick-add hotkey"
          data-testid="hotkey-input"
          value={hotkey}
          onChange={(e) => setHotkeyDraft(e.target.value)}
          onBlur={() => {
            if (hotkey.trim() && hotkey.trim() !== cfg.quickAddHotkey) setHotkey.mutate(hotkey.trim());
          }}
          placeholder="CmdOrCtrl+Shift+A"
          className="mt-1 w-full rounded border border-border bg-bg px-2 py-1 font-mono text-sm outline-none focus:border-accent"
        />
      </label>

      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          role="switch"
          aria-label="Launch at login"
          data-testid="autostart-toggle"
          checked={cfg.autostart}
          onChange={(e) => setAutostart.mutate(e.target.checked)}
        />
        Launch Toodoo at login
      </label>

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
        Native action buttons are used where the OS supports them; otherwise a
        Complete / Snooze popover opens in-app when a reminder fires.
      </p>

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

      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          role="switch"
          aria-label="Use simple in-app pop-outs"
          data-testid="simple-popouts-toggle"
          checked={cfg.simplePopouts}
          onChange={(e) => setSimplePopouts.mutate(e.target.checked)}
        />
        Use simple in-app pop-outs
      </label>
      <p className="text-xs text-text-muted">
        Opens focus / sticky pop-outs as floating panels inside the main window
        instead of separate always-on-top windows. Turn this on if separate
        windows open blank on your machine (the app also switches automatically
        after repeated failures).
      </p>

      {!cfg.simplePopouts && (
        <label className="flex items-center gap-2 text-sm">
          <span className="text-xs font-medium text-text-muted">Pop-out window style</span>
          <select
            aria-label="Pop-out window style"
            data-testid="popout-style-select"
            value={cfg.popoutStyle}
            onChange={(e) => setPopoutStyle.mutate(e.target.value)}
            className="rounded border border-border bg-bg px-1.5 py-0.5 text-sm"
          >
            <option value="pill">Pill (frameless, transparent)</option>
            <option value="solid">Solid (frameless, opaque)</option>
            <option value="windowed">Windowed (title bar)</option>
          </select>
        </label>
      )}
      {!cfg.simplePopouts && (
        <p className="text-xs text-text-muted">
          If pill pop-outs open blank on your machine, try Solid, then
          Windowed — some graphics drivers cannot create transparent windows.
        </p>
      )}
    </div>
  );
}
