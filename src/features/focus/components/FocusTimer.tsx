import { useQuery } from "@tanstack/react-query";
import { api } from "../../../lib/api";
import { useUiStore } from "../../../lib/uiStore";
import { useFocusStats } from "../hooks/useFocus";
import { usePomodoro } from "../hooks/usePomodoro";
import { formatClock, type PomoConfig } from "../lib/pomodoro";

const PHASE_LABEL = { work: "Focus", short: "Short break", long: "Long break" } as const;

function todayRange() {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);
  return { from: start.toISOString(), to: end.toISOString() };
}

export function FocusTimer({ config }: { config: PomoConfig }) {
  const focusTaskId = useUiStore((s) => s.focusTaskId);
  const p = usePomodoro(config, focusTaskId);
  const { from, to } = todayRange();
  const stats = useFocusStats(from, to);
  const pomosToday = stats.data?.pomoCount ?? 0;
  const { data: tasks } = useQuery({ queryKey: ["tasks", "smart:all"], queryFn: () => api.listSmart("all") });

  const { data: habits } = useQuery({ queryKey: ["habits", "active"], queryFn: () => api.listHabits(false) });
  const clock = p.mode === "pomo" ? formatClock(p.remaining) : formatClock(p.elapsed);
  const paused = p.active && !p.running;
  const targetValue = p.habitId ? `habit:${p.habitId}` : p.taskId ? `task:${p.taskId}` : "";

  return (
    <div className="flex flex-col items-center gap-4 py-6" data-testid="focus-timer">
      <div className="flex gap-1 rounded-md border border-border p-0.5 text-xs">
        {(["pomo", "stopwatch"] as const).map((m) => (
          <button
            key={m}
            type="button"
            disabled={p.active}
            aria-pressed={p.mode === m}
            onClick={() => p.setMode(m)}
            className={`rounded px-3 py-1 ${p.mode === m ? "bg-accent text-accent-fg" : "text-text-muted"} disabled:opacity-40`}
          >
            {m === "pomo" ? "Pomodoro" : "Stopwatch"}
          </button>
        ))}
      </div>

      {p.mode === "pomo" && (
        <div className="text-xs uppercase tracking-wide text-text-muted">{PHASE_LABEL[p.phase]}</div>
      )}
      <div className="font-mono text-6xl tabular-nums" aria-label="Timer">
        {clock}
      </div>

      <select
        aria-label="Focus target"
        value={targetValue}
        disabled={p.active}
        onChange={(e) => {
          const [kind, id] = e.target.value.split(":");
          p.setTaskId(kind === "task" ? id : null);
          p.setHabitId(kind === "habit" ? id : null);
        }}
        className="w-64 rounded border border-border bg-bg px-2 py-1 text-sm outline-none focus:border-accent disabled:opacity-60"
      >
        <option value="">No task</option>
        <optgroup label="Tasks">
          {(tasks ?? []).map((t) => (
            <option key={t.id} value={`task:${t.id}`}>
              {t.title}
            </option>
          ))}
        </optgroup>
        <optgroup label="Habits">
          {(habits ?? []).map((h) => (
            <option key={h.id} value={`habit:${h.id}`}>
              {h.name}
            </option>
          ))}
        </optgroup>
      </select>

      <input
        value={p.note}
        onChange={(e) => p.setNote(e.target.value)}
        placeholder="Session note…"
        aria-label="Session note"
        className="w-64 rounded border border-border bg-bg px-2 py-1 text-sm outline-none focus:border-accent"
      />

      <div className="flex gap-2">
        {!p.active && (
          <button type="button" onClick={() => void p.start()} className="rounded-md bg-accent px-6 py-2 text-sm text-accent-fg">
            Start
          </button>
        )}
        {p.running && (
          <button type="button" onClick={p.pause} className="rounded-md border border-border px-6 py-2 text-sm">
            Pause
          </button>
        )}
        {paused && (
          <button type="button" onClick={p.resume} className="rounded-md bg-accent px-6 py-2 text-sm text-accent-fg">
            Resume
          </button>
        )}
        {p.active && (
          <button type="button" onClick={() => void p.stop("DONE")} className="rounded-md border border-border px-6 py-2 text-sm hover:text-red-500">
            Stop
          </button>
        )}
      </div>

      <div className="text-sm text-text-muted" aria-label="Daily goal">
        {pomosToday} / {config.dailyGoal} pomos today
        <span className="ml-2 inline-flex gap-0.5 align-middle">
          {Array.from({ length: config.dailyGoal }).map((_, i) => (
            <span key={i} className={`h-2 w-2 rounded-full ${i < pomosToday ? "bg-accent" : "bg-border"}`} />
          ))}
        </span>
      </div>
    </div>
  );
}
