import { useEffect, useState } from "react";
import { useDesktopConfig } from "../hooks/useDesktopConfig";

/** Desktop panel: global quick-add hotkey, launch-at-login, notification actions.
 *  The toggles apply natively in the Tauri app; the browser mirrors the config. */
export function DesktopSettings() {
  const { query, setHotkey, setAutostart, setNotifActions, setSimplePopouts } = useDesktopConfig();
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
    </div>
  );
}
