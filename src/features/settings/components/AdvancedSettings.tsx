import { useState } from "react";
import { api } from "../../../lib/api";

const btn = "rounded border border-border px-2 py-1 text-xs hover:bg-bg";

const IS_TAURI = "__TAURI_INTERNALS__" in window;

/** Diagnostics & maintenance actions (Settings → Advanced). */
export function AdvancedSettings() {
  const [notifyReport, setNotifyReport] = useState<string | null>(null);

  const testNotification = async () => {
    setNotifyReport("…");
    try {
      setNotifyReport(await api.sendTestNotification());
    } catch (e) {
      setNotifyReport(`failed: ${String(e)}`);
    }
  };

  return (
    <div className="space-y-3" data-testid="advanced-settings">
      <section className="space-y-2">
        <h4 className="text-xs font-medium text-text-muted">Diagnostics</h4>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            className={btn}
            onClick={() => void testNotification()}
            data-testid="send-test-notification"
          >
            Send test notification now
          </button>
          <button
            type="button"
            className={btn}
            disabled={!IS_TAURI}
            title={IS_TAURI ? "Open the folder containing toodoo.log" : "Desktop app only"}
            onClick={() => void api.openLogsFolder()}
          >
            Open logs folder
          </button>
        </div>
        {notifyReport && (
          <p className="text-xs text-text-muted" data-testid="notify-report">
            {notifyReport}
          </p>
        )}
        <p className="text-xs text-text-muted">
          The app writes a rotating diagnostic log (toodoo.log). If something
          misbehaves, send that file along with your report.
        </p>
      </section>
    </div>
  );
}
