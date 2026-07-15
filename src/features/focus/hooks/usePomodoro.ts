import { useCallback, useEffect, useRef, useState } from "react";
import type { FocusKind } from "../../../lib/api";
import { advancePhase, phaseDurationSec, type Phase, type PomoConfig } from "../lib/pomodoro";
import { useFocusMutations } from "./useFocus";

export type Mode = "pomo" | "stopwatch";

/**
 * Drives the focus timer over the pure `pomodoro` cycle and persists sessions.
 * Work phases (and stopwatch runs) are persisted focus sessions; break phases
 * are just timers. Pause time is tracked by wall clock and saved on completion.
 */
export function usePomodoro(config: PomoConfig, initialTaskId: string | null = null) {
  const { startFocus, completeFocus } = useFocusMutations();

  const [mode, setMode] = useState<Mode>("pomo");
  const [phase, setPhase] = useState<Phase>("work");
  const [remaining, setRemaining] = useState(() => phaseDurationSec("work", config));
  const [elapsed, setElapsed] = useState(0);
  const [running, setRunning] = useState(false);
  const [taskId, setTaskId] = useState<string | null>(initialTaskId);
  const [note, setNote] = useState("");
  const [sessionOpen, setSessionOpen] = useState(false);

  const sessionId = useRef<string | null>(null);
  const pomosRef = useRef(0);
  const pauseMsRef = useRef(0);
  const pausedAtRef = useRef<number | null>(null);
  const configRef = useRef(config);
  useEffect(() => {
    configRef.current = config;
  }, [config]);

  // Tick.
  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => {
      if (mode === "pomo") setRemaining((r) => Math.max(0, r - 1));
      else setElapsed((e) => e + 1);
    }, 1000);
    return () => clearInterval(id);
  }, [running, mode]);

  const openSession = useCallback(
    async (kind: FocusKind, plannedMin?: number) => {
      pauseMsRef.current = 0;
      pausedAtRef.current = null;
      const session = await startFocus.mutateAsync({ taskId, kind, plannedMin });
      sessionId.current = session.id;
      setSessionOpen(true);
    },
    [startFocus, taskId],
  );

  const closeSession = useCallback(
    async (status: "DONE" | "ABANDONED") => {
      if (!sessionId.current) return;
      const pause = pauseMsRef.current + (pausedAtRef.current ? Date.now() - pausedAtRef.current : 0);
      await completeFocus.mutateAsync({ id: sessionId.current, pauseMs: pause, note: note || null, status });
      sessionId.current = null;
      setSessionOpen(false);
    },
    [completeFocus, note],
  );

  // Pomodoro phase completion (remaining hit 0).
  useEffect(() => {
    if (mode !== "pomo" || !running || remaining > 0) return;
    const cfg = configRef.current;
    void (async () => {
      if (phase === "work") {
        await closeSession("DONE");
        const { phase: next } = advancePhase("work", pomosRef.current, cfg);
        pomosRef.current += 1;
        setPhase(next);
        setRemaining(phaseDurationSec(next, cfg)); // breaks auto-run
      } else {
        setPhase("work");
        setRemaining(phaseDurationSec("work", cfg));
        if (cfg.autoStart) {
          await openSession("POMO", cfg.workMin);
        } else {
          setRunning(false);
        }
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- phase/closeSession/openSession are read at fire time; deps kept minimal on purpose
  }, [remaining, running, mode]);

  const start = useCallback(async () => {
    if (mode === "pomo") {
      setPhase("work");
      setRemaining(phaseDurationSec("work", configRef.current));
      await openSession("POMO", configRef.current.workMin);
    } else {
      setElapsed(0);
      await openSession("STOPWATCH");
    }
    setRunning(true);
  }, [mode, openSession]);

  const pause = useCallback(() => {
    pausedAtRef.current = Date.now();
    setRunning(false);
  }, []);

  const resume = useCallback(() => {
    if (pausedAtRef.current) {
      pauseMsRef.current += Date.now() - pausedAtRef.current;
      pausedAtRef.current = null;
    }
    setRunning(true);
  }, []);

  const stop = useCallback(
    async (status: "DONE" | "ABANDONED" = "DONE") => {
      await closeSession(status);
      setRunning(false);
      setPhase("work");
      setRemaining(phaseDurationSec("work", configRef.current));
      setElapsed(0);
      setNote("");
    },
    [closeSession],
  );

  const active = running || sessionOpen;

  return {
    mode, setMode,
    phase, remaining, elapsed, running, active,
    taskId, setTaskId, note, setNote,
    start, pause, resume, stop,
  };
}
