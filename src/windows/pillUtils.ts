import { useEffect, useRef } from "react";
import { api } from "../lib/api";

export const IS_TAURI = "__TAURI_INTERNALS__" in window;

/** Set the page background for a pill window: "transparent" for the true
 *  pill chrome, or a solid color when the window itself is opaque (the
 *  "solid"/"windowed" pop-out styles) so the pill's rounded corners don't sit
 *  on a stark default background. */
export function useWindowBackground(color: string) {
  useEffect(() => {
    const html = document.documentElement;
    const prevHtml = html.style.background;
    const prevBody = document.body.style.background;
    html.style.background = color;
    document.body.style.background = color;
    return () => {
      html.style.background = prevHtml;
      document.body.style.background = prevBody;
    };
  }, [color]);
}

export interface WindowBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * Restore this window's persisted position/size on mount and save it
 * (debounced) whenever it moves or resizes. Physical pixels throughout.
 * `onMoved` also receives every position change for dock detection.
 */
export function usePersistedWindowBox(
  key: string,
  onMoved?: (y: number) => void,
  opts?: {
    /** Persist/restore position only (windows whose size is app-managed —
     *  the focus pill resizes itself for the hover menu and dock states). */
    positionOnly?: boolean;
  },
) {
  const positionOnly = opts?.positionOnly ?? false;
  const onMovedRef = useRef(onMoved);
  onMovedRef.current = onMoved;

  useEffect(() => {
    if (!IS_TAURI) return;
    let disposed = false;
    const cleanups: (() => void)[] = [];
    let saveTimer: number | undefined;

    void (async () => {
      const { getCurrentWindow, PhysicalPosition, PhysicalSize } = await import(
        "@tauri-apps/api/window"
      );
      const win = getCurrentWindow();

      // Restore.
      try {
        const stored = (await api.getSetting(key)) as WindowBox | null;
        if (!disposed && stored && typeof stored.x === "number") {
          await win.setPosition(new PhysicalPosition(stored.x, stored.y));
          if (!positionOnly && stored.w > 0 && stored.h > 0) {
            await win.setSize(new PhysicalSize(stored.w, stored.h));
          }
        }
      } catch {
        // First open or unreadable — keep the centered default.
      }

      const save = () => {
        window.clearTimeout(saveTimer);
        saveTimer = window.setTimeout(() => {
          void (async () => {
            try {
              const pos = await win.outerPosition();
              const size = positionOnly ? { width: 0, height: 0 } : await win.innerSize();
              await api.setSetting(key, { x: pos.x, y: pos.y, w: size.width, h: size.height });
            } catch {
              // Persistence is best-effort.
            }
          })();
        }, 400);
      };

      const unMove = await win.onMoved(({ payload }) => {
        onMovedRef.current?.(payload.y);
        save();
      });
      const unResize = await win.onResized(() => save());
      if (disposed) {
        unMove();
        unResize();
      } else {
        cleanups.push(unMove, unResize);
      }
    })();

    return () => {
      disposed = true;
      window.clearTimeout(saveTimer);
      cleanups.forEach((fn) => fn());
    };
  }, [key]);
}

/** Resize the current window to `w`×`h` logical pixels. */
export async function setWindowSize(w: number, h: number) {
  if (!IS_TAURI) return;
  const { getCurrentWindow, LogicalSize } = await import("@tauri-apps/api/window");
  await getCurrentWindow().setSize(new LogicalSize(w, h));
}

/** Pin the current window's top edge to y (physical), keeping x. */
export async function pinWindowTop(y: number) {
  if (!IS_TAURI) return;
  const { getCurrentWindow, PhysicalPosition } = await import("@tauri-apps/api/window");
  const win = getCurrentWindow();
  const pos = await win.outerPosition();
  await win.setPosition(new PhysicalPosition(pos.x, y));
}

export function closeThisWindow() {
  if (!IS_TAURI) return;
  void import("@tauri-apps/api/window").then(({ getCurrentWindow }) => getCurrentWindow().close());
}

export function emitFocusCmd(action: string) {
  if (!IS_TAURI) return;
  void import("@tauri-apps/api/event").then(({ emit }) => emit("focus-cmd", { action }));
}
