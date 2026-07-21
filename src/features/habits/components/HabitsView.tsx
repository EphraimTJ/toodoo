import { useEffect, useRef, useState } from "react";
import { differenceInCalendarDays, parseISO } from "date-fns";
import { Check, Flame, Plus } from "lucide-react";
import { localDateParams, type Habit, type HabitToday } from "../../../lib/api";

/** "Day X / N" for a habit with a goal-days duration, else null. */
function goalProgress(h: HabitToday): string | null {
  if (!h.habit.goalDays || !h.habit.startDate) return null;
  const day = Math.min(
    h.habit.goalDays,
    Math.max(1, differenceInCalendarDays(new Date(), parseISO(h.habit.startDate)) + 1),
  );
  return `Day ${day}/${h.habit.goalDays}`;
}
import { useHabitMutations, useHabits, useTodayHabits } from "../hooks/useHabits";
import { HabitDialog } from "./HabitDialog";
import { HabitDetail } from "./HabitDetail";

export function HabitsView() {
  const today = localDateParams().today;
  const { data: todayHabits } = useTodayHabits();
  const { recordCheckin, deleteCheckin, setArchived, deleteHabit } = useHabitMutations();

  const [selected, setSelected] = useState<Habit | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Habit | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const { data: archivedList } = useHabits(true);
  const archived = (archivedList ?? []).filter((h) => h.archived);

  // Auto pop-up: open the check-in log for the first due habit that opted in
  // (once per mount, only if not already checked in / skipped today).
  const autoPopped = useRef(false);
  useEffect(() => {
    if (autoPopped.current) return;
    const due = (todayHabits ?? []).find(
      (h) => h.habit.autoLogPopup && h.status !== "DONE" && h.status !== "SKIP",
    );
    if (due) {
      autoPopped.current = true;
      setSelected(due.habit);
    }
  }, [todayHabits]);

  if (selected) {
    return (
      <>
        <HabitDetail
          habit={selected}
          onBack={() => setSelected(null)}
          onEdit={() => {
            setEditing(selected);
            setDialogOpen(true);
          }}
        />
        <HabitDialog open={dialogOpen} onOpenChange={setDialogOpen} habit={editing} onSaved={() => setEditing(null)} />
      </>
    );
  }

  const toggleCheck = (h: HabitToday) => {
    if (h.status === "DONE") deleteCheckin.mutate({ habitId: h.habit.id, date: today });
    else recordCheckin.mutate({ habitId: h.habit.id, date: today, status: "DONE" });
  };
  const addAmount = (h: HabitToday) => {
    const next = (h.value ?? 0) + 1;
    const goal = h.habit.goalAmount ?? 1;
    recordCheckin.mutate({
      habitId: h.habit.id,
      date: today,
      status: next >= goal ? "DONE" : "PARTIAL",
      value: next,
    });
  };

  // Group by section.
  const groups = new Map<string, HabitToday[]>();
  for (const h of todayHabits ?? []) {
    const key = h.habit.section || "Habits";
    (groups.get(key) ?? groups.set(key, []).get(key)!).push(h);
  }

  return (
    <div className="flex h-full min-w-0 flex-1 flex-col">
      <header className="flex items-center gap-2 border-b border-border px-4 py-2.5">
        <h2 className="text-base font-semibold">Habits</h2>
        <button
          type="button"
          onClick={() => {
            setEditing(null);
            setDialogOpen(true);
          }}
          className="ml-auto rounded-full border border-border px-3 py-1 text-xs hover:border-accent"
        >
          + New habit
        </button>
        <button
          type="button"
          onClick={() => setShowArchived((v) => !v)}
          className="rounded-full px-3 py-1 text-xs text-text-muted hover:bg-surface"
        >
          {showArchived ? "Hide archived" : "Archived"}
        </button>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        {[...groups.entries()].map(([section, list]) => (
          <section key={section} className="mb-4">
            <h3 className="mb-1 px-1 text-xs font-semibold uppercase tracking-wide text-text-muted">{section}</h3>
            <ul className="space-y-1">
              {list.map((h) => (
                <li
                  key={h.habit.id}
                  data-testid="habit-row"
                  className="flex items-center gap-3 rounded-xl px-2.5 py-2 transition-colors hover:bg-surface"
                >
                  <button
                    type="button"
                    aria-label={`Check ${h.habit.name}`}
                    onClick={() => (h.habit.goalKind === "AMOUNT" ? addAmount(h) : toggleCheck(h))}
                    className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-xs"
                    style={{
                      borderColor: h.habit.color ?? "#78786c",
                      backgroundColor: h.status === "DONE" ? (h.habit.color ?? "#4f6f52") : "transparent",
                      color: h.status === "DONE" ? "#fff" : undefined,
                    }}
                  >
                    {h.status === "DONE" ? (
                      <Check size={14} strokeWidth={2.5} />
                    ) : h.habit.goalKind === "AMOUNT" ? (
                      <Plus size={14} strokeWidth={2.5} />
                    ) : null}
                  </button>
                  <button type="button" onClick={() => setSelected(h.habit)} className="flex min-w-0 flex-1 items-center gap-2 text-left">
                    <span>{h.habit.icon}</span>
                    <span className={`truncate ${h.status === "DONE" ? "text-text-muted" : ""}`}>{h.habit.name}</span>
                    {h.habit.goalKind === "AMOUNT" && (
                      <span className="text-xs text-text-muted">
                        {h.value ?? 0}/{h.habit.goalAmount} {h.habit.unit}
                      </span>
                    )}
                  </button>
                  {goalProgress(h) && (
                    <span className="whitespace-nowrap text-xs text-text-muted">{goalProgress(h)}</span>
                  )}
                  {h.streak > 0 && (
                    <span className="flex items-center gap-0.5 text-xs text-secondary">
                      <Flame size={12} strokeWidth={2} fill="currentColor" /> {h.streak}
                    </span>
                  )}
                  <button
                    type="button"
                    aria-label={`Skip ${h.habit.name}`}
                    onClick={() => recordCheckin.mutate({ habitId: h.habit.id, date: today, status: "SKIP" })}
                    className={`text-xs ${h.status === "SKIP" ? "text-text" : "text-text-muted"} hover:text-text`}
                  >
                    Skip
                  </button>
                </li>
              ))}
            </ul>
          </section>
        ))}
        {(todayHabits ?? []).length === 0 && (
          <div className="flex h-40 items-center justify-center text-sm text-text-muted">
            No habits scheduled today — add one above.
          </div>
        )}

        {showArchived && archived.length > 0 && (
          <section className="mt-6 border-t border-border pt-3">
            <h3 className="mb-1 px-1 text-xs font-semibold uppercase tracking-wide text-text-muted">Archived</h3>
            <ul className="space-y-1">
              {archived.map((h) => (
                <li key={h.id} className="flex items-center gap-3 px-2 py-1.5 text-sm text-text-muted">
                  <span>{h.icon}</span>
                  <span className="flex-1 truncate">{h.name}</span>
                  <button type="button" onClick={() => setArchived.mutate({ id: h.id, archived: false })} className="text-xs text-accent hover:underline">
                    Restore
                  </button>
                  <button type="button" onClick={() => deleteHabit.mutate(h.id)} className="text-xs hover:text-destructive">
                    Delete
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>

      <HabitDialog open={dialogOpen} onOpenChange={setDialogOpen} habit={editing} onSaved={() => setEditing(null)} />
    </div>
  );
}
