import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../../lib/api";

export interface PaneWidths {
  sidebar: number;
  detail: number;
}

export const PANE_DEFAULTS: PaneWidths = { sidebar: 240, detail: 320 };
export const PANE_LIMITS = {
  sidebar: { min: 180, max: 360 },
  detail: { min: 280, max: 560 },
} as const;

const LS_KEY = "toodoo:layout:panes";
const SETTINGS_KEY = "layout:panes";

function clampAll(w: PaneWidths): PaneWidths {
  return {
    sidebar: Math.min(PANE_LIMITS.sidebar.max, Math.max(PANE_LIMITS.sidebar.min, w.sidebar)),
    detail: Math.min(PANE_LIMITS.detail.max, Math.max(PANE_LIMITS.detail.min, w.detail)),
  };
}

/** Synchronous first read (no flicker): localStorage mirrors the setting. */
function readInitial(): PaneWidths {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) return clampAll({ ...PANE_DEFAULTS, ...(JSON.parse(raw) as Partial<PaneWidths>) });
  } catch {
    // Fall through to defaults.
  }
  return PANE_DEFAULTS;
}

/**
 * Sidebar/detail pane widths: applied synchronously from the localStorage
 * mirror on first paint, kept durable in the `layout:panes` setting
 * (viewopts pattern), clamped to per-pane min/max.
 */
export function usePaneWidths() {
  const [widths, setWidths] = useState<PaneWidths>(readInitial);
  const saveTimer = useRef<number | undefined>(undefined);

  // The setting is authoritative across machines; adopt it after load.
  useEffect(() => {
    void api
      .getSetting(SETTINGS_KEY)
      .then((stored) => {
        if (stored && typeof stored === "object") {
          setWidths((w) => clampAll({ ...w, ...(stored as Partial<PaneWidths>) }));
        }
      })
      .catch(() => {});
  }, []);

  const persist = useCallback((next: PaneWidths) => {
    try {
      localStorage.setItem(LS_KEY, JSON.stringify(next));
    } catch {
      // Mirror only.
    }
    window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => {
      void api.setSetting(SETTINGS_KEY, { ...next }).catch(() => {});
    }, 400);
  }, []);

  const setPane = useCallback(
    (pane: keyof PaneWidths, width: number) => {
      setWidths((w) => {
        const next = clampAll({ ...w, [pane]: width });
        persist(next);
        return next;
      });
    },
    [persist],
  );

  const resetPane = useCallback(
    (pane: keyof PaneWidths) => setPane(pane, PANE_DEFAULTS[pane]),
    [setPane],
  );

  return { widths, setPane, resetPane };
}
