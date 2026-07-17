import { api } from "../../../lib/api";

const btn = "rounded border border-border px-2 py-1 text-xs hover:bg-bg";

const IS_TAURI = "__TAURI_INTERNALS__" in window;

/** Diagnostics & maintenance actions (Settings → Advanced). */
export function AdvancedSettings() {
  return (
    <div className="space-y-3" data-testid="advanced-settings">
      <section className="space-y-2">
        <h4 className="text-xs font-medium text-text-muted">Diagnostics</h4>
        <div className="flex flex-wrap items-center gap-2">
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
        <p className="text-xs text-text-muted">
          The app writes a rotating diagnostic log (toodoo.log). If something
          misbehaves, send that file along with your report.
        </p>
      </section>
    </div>
  );
}
