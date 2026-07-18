import { createContext, useContext, useEffect, useRef, type ReactNode } from "react";
import { useUiStore } from "../../lib/uiStore";
import { useFocusSettings } from "./hooks/useFocusSettings";
import { usePomodoro } from "./hooks/usePomodoro";
import { phaseDurationSec, type Phase, type PomoConfig } from "./lib/pomodoro";
import type { Mode } from "./hooks/usePomodoro";

/** Timer state mirrored to pill windows once per second (Tauri event bus). */
export interface FocusBroadcast {
  mode: Mode;
  phase: Phase;
  remaining: number;
  elapsed: number;
  running: boolean;
  active: boolean;
  /** Full duration of the current phase, for ring progress. 0 for stopwatch. */
  totalSec: number;
}

export type FocusCmd = "pause" | "resume" | "stop" | "start" | "toggle-mode" | "ping";

type FocusTimerApi = ReturnType<typeof usePomodoro>;

const FocusCtx = createContext<FocusTimerApi | null>(null);

const IS_TAURI = "__TAURI_INTERNALS__" in window;

/**
 * Owns the single focus timer for the main window: always mounted (the timer
 * survives navigating away from the Focus view), shared by the Focus view and
 * the in-app focus panel, broadcast to pill windows (`focus-state`), and
 * remotely controllable from them (`focus-cmd`).
 */
export function FocusProvider({ children }: { children: ReactNode }) {
  const { config } = useFocusSettings();
  const focusTaskId = useUiStore((s) => s.focusTaskId);
  const p = usePomodoro(config);

  // "Focus on this task" (tray, task row) targets the shared timer when idle.
  const { active, setTaskId } = p;
  useEffect(() => {
    if (focusTaskId && !active) setTaskId(focusTaskId);
  }, [focusTaskId, active, setTaskId]);

  // Broadcast to pill windows.
  const configRef = useRef(config);
  configRef.current = config;
  useEffect(() => {
    if (!IS_TAURI) return;
    let cancelled = false;
    void import("@tauri-apps/api/event").then(({ emit }) => {
      if (cancelled) return;
      const payload: FocusBroadcast = {
        mode: p.mode,
        phase: p.phase,
        remaining: p.remaining,
        elapsed: p.elapsed,
        running: p.running,
        active: p.active,
        totalSec: p.mode === "pomo" ? phaseDurationSec(p.phase, configRef.current) : 0,
      };
      void emit("focus-state", payload);
    });
    return () => {
      cancelled = true;
    };
  }, [p.mode, p.phase, p.remaining, p.elapsed, p.running, p.active]);

  // Remote control from pill windows.
  const pRef = useRef(p);
  pRef.current = p;
  useEffect(() => {
    if (!IS_TAURI) return;
    let unlisten: (() => void) | undefined;
    let disposed = false;
    void import("@tauri-apps/api/event").then(({ listen, emit }) =>
      listen<{ action: FocusCmd }>("focus-cmd", ({ payload }) => {
        const t = pRef.current;
        switch (payload.action) {
          case "ping": {
            // A pill window just opened and wants the current snapshot.
            const snapshot: FocusBroadcast = {
              mode: t.mode,
              phase: t.phase,
              remaining: t.remaining,
              elapsed: t.elapsed,
              running: t.running,
              active: t.active,
              totalSec: t.mode === "pomo" ? phaseDurationSec(t.phase, configRef.current) : 0,
            };
            void emit("focus-state", snapshot);
            break;
          }
          case "pause":
            if (t.running) t.pause();
            break;
          case "resume":
            if (t.active && !t.running) t.resume();
            break;
          case "stop":
            if (t.active) void t.stop("DONE");
            break;
          case "start":
            if (!t.active) void t.start();
            break;
          case "toggle-mode":
            if (!t.active) t.setMode(t.mode === "pomo" ? "stopwatch" : "pomo");
            break;
        }
      }).then((fn) => {
        if (disposed) fn();
        else unlisten = fn;
      }),
    );
    return () => {
      disposed = true;
      unlisten?.();
    };
  }, []);

  return <FocusCtx.Provider value={p}>{children}</FocusCtx.Provider>;
}

/**
 * The shared focus timer when a `FocusProvider` is mounted (the app), else a
 * local instance (unit tests render `FocusTimer` bare). The local instance is
 * created unconditionally to keep hook order stable and stays dormant when the
 * shared one exists.
 */
export function useFocusTimer(config: PomoConfig): FocusTimerApi {
  const ctx = useContext(FocusCtx);
  const local = usePomodoro(config);
  return ctx ?? local;
}
