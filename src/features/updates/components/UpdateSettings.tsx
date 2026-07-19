import { useEffect, useState } from "react";
import {
  checkForUpdate,
  installUpdate,
  IS_TAURI,
  type DownloadProgress,
  type UpdateInfo,
} from "../lib/updater";

const btn = "rounded border border-border px-2 py-1 text-xs hover:bg-bg disabled:opacity-50";
const primaryBtn =
  "rounded-md bg-accent px-2.5 py-1 text-xs text-accent-fg hover:opacity-90 disabled:opacity-50";

type Status =
  | { kind: "idle" }
  | { kind: "checking" }
  | { kind: "uptodate" }
  | { kind: "available"; info: UpdateInfo }
  | { kind: "downloading"; info: UpdateInfo; progress: DownloadProgress }
  | { kind: "error"; message: string };

function pct(p: DownloadProgress): string {
  if (!p.total) return `${(p.downloaded / 1_000_000).toFixed(1)} MB`;
  return `${Math.round((p.downloaded / p.total) * 100)}%`;
}

/** Check GitHub Releases for a newer signed build and install it in place. */
export function UpdateSettings() {
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const [current, setCurrent] = useState<string | null>(null);

  useEffect(() => {
    if (!IS_TAURI) return;
    void import("@tauri-apps/api/app")
      .then((m) => m.getVersion())
      .then(setCurrent)
      .catch(() => setCurrent(null));
  }, []);

  const check = async () => {
    setStatus({ kind: "checking" });
    try {
      const info = await checkForUpdate();
      setStatus(info ? { kind: "available", info } : { kind: "uptodate" });
    } catch (e) {
      setStatus({ kind: "error", message: String(e) });
    }
  };

  const install = async (info: UpdateInfo) => {
    setStatus({ kind: "downloading", info, progress: { downloaded: 0, total: null } });
    try {
      await installUpdate((progress) =>
        setStatus({ kind: "downloading", info, progress }),
      );
      // On success the app relaunches, so we don't reach here.
    } catch (e) {
      setStatus({ kind: "error", message: String(e) });
    }
  };

  return (
    <div className="space-y-2" data-testid="update-settings">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          className={btn}
          disabled={!IS_TAURI || status.kind === "checking" || status.kind === "downloading"}
          title={IS_TAURI ? "Check GitHub for a newer version" : "Desktop app only"}
          onClick={() => void check()}
          data-testid="check-for-updates"
        >
          {status.kind === "checking" ? "Checking…" : "Check for updates"}
        </button>
        {current && (
          <span className="text-xs text-text-muted" data-testid="current-version">
            Current version {current}
          </span>
        )}
      </div>

      {status.kind === "uptodate" && (
        <p className="text-xs text-text-muted">You're on the latest version.</p>
      )}

      {status.kind === "available" && (
        <div className="space-y-2 rounded-md border border-border p-2.5">
          <p className="text-xs">
            <span className="font-medium">Version {status.info.version}</span> is available
            {status.info.currentVersion ? ` (you have ${status.info.currentVersion})` : ""}.
          </p>
          {status.info.notes && (
            <p className="max-h-24 overflow-y-auto whitespace-pre-wrap text-xs text-text-muted">
              {status.info.notes}
            </p>
          )}
          <button
            type="button"
            className={primaryBtn}
            onClick={() => void install(status.info)}
            data-testid="install-update"
          >
            Download &amp; install
          </button>
        </div>
      )}

      {status.kind === "downloading" && (
        <p className="text-xs text-text-muted" data-testid="download-progress">
          Downloading {status.info.version}… {pct(status.progress)} — the app will restart
          when it's done.
        </p>
      )}

      {status.kind === "error" && (
        <p className="text-xs text-red-500" data-testid="update-error">
          Update failed: {status.message}
        </p>
      )}

      <p className="text-xs text-text-muted">
        Updates are downloaded from GitHub Releases and verified against a signing key before
        installing.
      </p>
    </div>
  );
}
