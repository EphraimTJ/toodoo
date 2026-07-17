import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { api } from "../../../lib/api";

const btn = "rounded border border-border px-2 py-1 text-xs hover:bg-bg";

const IS_TAURI = "__TAURI_INTERNALS__" in window;

/** Diagnostics & maintenance actions (Settings → Advanced). */
export function AdvancedSettings() {
  const queryClient = useQueryClient();
  const [notifyReport, setNotifyReport] = useState<string | null>(null);
  const [confirmSeed, setConfirmSeed] = useState(false);
  const [seedReport, setSeedReport] = useState<string | null>(null);

  const loadSampleData = async () => {
    setSeedReport("Loading…");
    setConfirmSeed(false);
    try {
      await api.seedSampleData(true);
      await queryClient.invalidateQueries();
      setSeedReport("Sample data loaded.");
    } catch (e) {
      setSeedReport(`failed: ${String(e)}`);
    }
  };

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
      <section className="space-y-2">
        <h4 className="text-xs font-medium text-text-muted">Sample data</h4>
        {confirmSeed ? (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs">
              Add the example workspace on top of your current data?
            </span>
            <button
              type="button"
              className="rounded-md bg-accent px-2.5 py-1 text-xs text-accent-fg hover:opacity-90"
              onClick={() => void loadSampleData()}
              data-testid="confirm-load-sample-data"
            >
              Yes, load it
            </button>
            <button type="button" className={btn} onClick={() => setConfirmSeed(false)}>
              Cancel
            </button>
          </div>
        ) : (
          <button
            type="button"
            className={btn}
            onClick={() => setConfirmSeed(true)}
            data-testid="load-sample-data"
          >
            Load sample data…
          </button>
        )}
        {seedReport && <p className="text-xs text-text-muted">{seedReport}</p>}
      </section>
    </div>
  );
}
