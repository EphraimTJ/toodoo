import { createContext, useContext, useEffect, useRef, type ReactNode } from "react";
import { api, type Task } from "../../lib/api";
import { useUiStore } from "../../lib/uiStore";
import { useAmbient } from "./hooks/useAmbient";
import { useFocusSettings } from "./hooks/useFocusSettings";
import { usePomodoro } from "./hooks/usePomodoro";
import { type Phase, type PomoConfig } from "./lib/pomodoro";
import type { Mode } from "./hooks/usePomodoro";

/**
 * Pick the task scheduled for `now` — a timed task whose [start, end] window
 * contains the moment — else the next upcoming timed task today. Used by the
 * focus hotkey so "work on project from 2–3pm" is auto-selected at 2:05.
 */
function chooseCurrentTask(tasks: Task[], now: number): Task | null {
  const timed = tasks.filter(
    (t) => t.status === "ACTIVE" && !t.isAllDay && (t.startAt || t.dueAt),
  );
  const startOf = (t: Task) => Date.parse((t.startAt ?? t.dueAt) as string);
  const endOf = (t: Task) => {
    if (t.dueAt) return Date.parse(t.dueAt);
    if (t.startAt && t.durationMin) return Date.parse(t.startAt) + t.durationMin * 60_000;
    return startOf(t) + 60 * 60_000; // assume an hour if only a start is known
  };
  const ongoing = timed.find((t) => startOf(t) <= now && now <= endOf(t));
  if (ongoing) return ongoing;
  return (
    timed
      .map((t) => ({ t, s: startOf(t) }))
      .filter((x) => x.s >= now)
      .sort((a, b) => a.s - b.s)[0]?.t ?? null
  );
}

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
type AmbientApi = ReturnType<typeof useAmbient>;

const FocusCtx = createContext<FocusTimerApi | null>(null);
const AmbientCtx = createContext<AmbientApi | null>(null);

const IS_TAURI = "__TAURI_INTERNALS__" in window;

/**
 * The single ambient-audio controller when a `FocusProvider` is mounted (the
 * app), else a local instance (bare-component tests). Sharing one instance is
 * what lets the Ctrl+Shift+F hotkey and the Focus page's music controls drive
 * the *same* audio. The local instance keeps hook order stable and stays silent.
 */
export function useSharedAmbient(): AmbientApi {
  const ctx = useContext(AmbientCtx);
  const local = useAmbient();
  return ctx ?? local;
}

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
  const ambient = useAmbient();

  // "Focus on this task" (tray, task row) targets the shared timer when idle.
  const { active, setTaskId } = p;
  useEffect(() => {
    if (focusTaskId && !active) setTaskId(focusTaskId);
  }, [focusTaskId, active, setTaskId]);

  // Ctrl+Shift+F: the Rust side opened the pill and emitted "focus-hotkey".
  // Here we pick the current task, start the timer, and (opt-in) play lo-fi.
  const ambientRef = useRef(ambient);
  ambientRef.current = ambient;
  const autoMusicRef = useRef(config.autoMusic);
  autoMusicRef.current = config.autoMusic;
  useEffect(() => {
    if (!IS_TAURI) return;
    let unlisten: (() => void) | undefined;
    let disposed = false;
    void import("@tauri-apps/api/event").then(({ listen }) =>
      listen("focus-hotkey", () => {
        void (async () => {
          const t = pRef.current;
          if (t.active) return; // a session is already running — don't disturb it
          try {
            const pick = chooseCurrentTask(await api.listSmart("today"), Date.now());
            if (pick) {
              t.setTaskId(pick.id);
              useUiStore.getState().selectTask(pick.id);
            }
          } catch {
            // No task match — still start a plain focus session.
          }
          await t.start();
          if (autoMusicRef.current) ambientRef.current.setTrack("lofi");
        })();
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

  // Stopping the focus session stops the music too — however it was started.
  // Transition-based so idle listening (music with no session) is untouched.
  const prevActive = useRef(false);
  useEffect(() => {
    if (prevActive.current && !p.active) ambient.setTrack(null);
    prevActive.current = p.active;
  }, [p.active, ambient]);

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
        totalSec: p.mode === "pomo" ? p.totalSec : 0,
      };
      void emit("focus-state", payload);
    });
    return () => {
      cancelled = true;
    };
  }, [p.mode, p.phase, p.remaining, p.elapsed, p.running, p.active, p.totalSec]);

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
              totalSec: t.mode === "pomo" ? t.totalSec : 0,
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

  return (
    <AmbientCtx.Provider value={ambient}>
      <FocusCtx.Provider value={p}>{children}</FocusCtx.Provider>
    </AmbientCtx.Provider>
  );
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
