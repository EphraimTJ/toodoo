import { api } from "./api";
import { useUiStore, type PopoutPanel } from "./uiStore";

const IS_TAURI = "__TAURI_INTERNALS__" in window;

/** Consecutive native-window failures after which a kind falls back to the
 *  in-app panel automatically (the Rust watchdog persists the counter). */
const FAILURE_THRESHOLD = 2;

/**
 * Open a focus/sticky pop-out the resilient way: a native always-on-top
 * window normally, but an in-app floating panel when (a) not running in
 * Tauri, (b) the user turned on "simple in-app pop-outs", or (c) the native
 * path has failed `FAILURE_THRESHOLD` times in a row (watchdog counter).
 * Returns which surface was used.
 */
export async function openPopout(panel: PopoutPanel): Promise<"native" | "panel"> {
  if (IS_TAURI) {
    try {
      const kind = panel.kind;
      const [cfg, failures] = await Promise.all([
        api.desktopConfig(),
        api.getSetting(`popout.failures.${kind}`),
      ]);
      const failedOut = typeof failures === "number" && failures >= FAILURE_THRESHOLD;
      if (!cfg.simplePopouts && !failedOut) {
        if (panel.kind === "focus") await api.openFocusWindow();
        else await api.openStickyWindow(panel.id);
        return "native";
      }
    } catch {
      // Config unreadable — fall through to the panel, never a dead end.
    }
  }
  useUiStore.getState().openPanel(panel);
  return "panel";
}
