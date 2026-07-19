import type { Update, DownloadEvent } from "@tauri-apps/plugin-updater";

/** Desktop-only: the updater talks to the Tauri core, absent in web/tests. */
export const IS_TAURI = "__TAURI_INTERNALS__" in window;

export interface UpdateInfo {
  /** The version available on GitHub Releases. */
  version: string;
  /** The version currently installed. */
  currentVersion: string;
  /** Release notes (the release body), if any. */
  notes?: string;
  /** Publish date string, if provided by latest.json. */
  date?: string;
}

export interface DownloadProgress {
  downloaded: number;
  /** Total bytes, or null when the server didn't send a length. */
  total: number | null;
}

// The resolved Update carries the methods to download/install. We hold it
// between a check() and a later install() rather than surfacing plugin types
// into the React layer.
let pending: Update | null = null;

/**
 * Ask GitHub Releases whether a newer signed build exists. Returns its info,
 * or null when up to date (or when not running under Tauri).
 */
export async function checkForUpdate(): Promise<UpdateInfo | null> {
  if (!IS_TAURI) return null;
  const { check } = await import("@tauri-apps/plugin-updater");
  const update = await check();
  pending = update;
  if (!update) return null;
  return {
    version: update.version,
    currentVersion: update.currentVersion,
    notes: update.body || undefined,
    date: update.date || undefined,
  };
}

/**
 * Download and install the update found by the last {@link checkForUpdate},
 * reporting byte progress, then relaunch into the new version.
 */
export async function installUpdate(
  onProgress?: (p: DownloadProgress) => void,
): Promise<void> {
  if (!pending) throw new Error("No update is pending — run a check first.");
  let downloaded = 0;
  let total: number | null = null;

  await pending.downloadAndInstall((event: DownloadEvent) => {
    switch (event.event) {
      case "Started":
        total = event.data.contentLength ?? null;
        onProgress?.({ downloaded, total });
        break;
      case "Progress":
        downloaded += event.data.chunkLength;
        onProgress?.({ downloaded, total });
        break;
      case "Finished":
        onProgress?.({ downloaded, total });
        break;
    }
  });

  const { relaunch } = await import("@tauri-apps/plugin-process");
  await relaunch();
}
