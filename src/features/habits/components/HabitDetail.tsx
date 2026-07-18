import {
  eachDayOfInterval,
  endOfMonth,
  format,
  parseISO,
  startOfMonth,
  startOfWeek,
} from "date-fns";
import type { CheckinStatus, Habit } from "../../../lib/api";
import { useHabitCheckins, useHabitStats } from "../hooks/useHabits";

const iso = (d: Date) => format(d, "yyyy-MM-dd");

function statusStyle(status: CheckinStatus | undefined, color: string): { className: string; style?: React.CSSProperties } {
  switch (status) {
    case "DONE":
      return { className: "", style: { backgroundColor: color } };
    case "PARTIAL":
      return { className: "bg-amber-400/60" };
    case "SKIP":
      return { className: "bg-border" };
    default:
      return { className: "border border-border" };
  }
}

export function HabitDetail({ habit, onBack, onEdit }: { habit: Habit; onBack(): void; onEdit(): void }) {
  const today = new Date();
  const from = iso(new Date(today.getTime() - 118 * 86_400_000));
  const to = iso(today);
  const { data: stats } = useHabitStats(habit.id);
  const { data: checkins } = useHabitCheckins(habit.id, from, to);

  const byDate = new Map((checkins ?? []).map((c) => [c.date, c.status]));
  const color = habit.color ?? "#35b979";

  const monthDays = eachDayOfInterval({ start: startOfMonth(today), end: endOfMonth(today) });
  const leadPad = (startOfMonth(today).getDay() + 6) % 7; // Monday-first

  // Heatmap: 17 weeks up to today, Monday-aligned columns.
  const heatStart = startOfWeek(new Date(today.getTime() - 118 * 86_400_000), { weekStartsOn: 1 });
  const heatDays = eachDayOfInterval({ start: heatStart, end: today });
  const weeks: Date[][] = [];
  for (let i = 0; i < heatDays.length; i += 7) weeks.push(heatDays.slice(i, i + 7));

  const journal = (checkins ?? []).filter((c) => c.note);

  return (
    <div className="flex h-full min-w-0 flex-1 flex-col overflow-y-auto" data-testid="habit-detail">
      <header className="flex items-center gap-2 border-b border-border px-4 py-2.5">
        <button type="button" onClick={onBack} className="text-text-muted hover:text-text" aria-label="Back to habits">
          ‹
        </button>
        <span className="text-lg">{habit.icon}</span>
        <h2 className="flex-1 text-base font-semibold">{habit.name}</h2>
        <button type="button" onClick={onEdit} className="rounded-md border border-border px-2 py-1 text-xs hover:border-accent">
          Edit
        </button>
      </header>

      <div className="space-y-5 p-4">
        {habit.quote && <p className="text-sm italic text-text-muted">“{habit.quote}”</p>}

        <div className="grid grid-cols-4 gap-2 text-center">
          {[
            ["🔥 Current", `${stats?.currentStreak ?? 0}`],
            ["Best", `${stats?.bestStreak ?? 0}`],
            ["Completion", `${Math.round((stats?.completionRate ?? 0) * 100)}%`],
            ["Total", `${stats?.totalCheckins ?? 0}`],
          ].map(([label, value]) => (
            <div key={label} className="rounded-md border border-border p-2">
              <div className="text-lg font-semibold">{value}</div>
              <div className="text-xs text-text-muted">{label}</div>
            </div>
          ))}
        </div>

        <section>
          <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-text-muted">{format(today, "MMMM yyyy")}</h3>
          <div className="grid grid-cols-7 gap-1 text-center text-xs">
            {["M", "T", "W", "T", "F", "S", "S"].map((d, i) => (
              <span key={i} className="text-text-muted">
                {d}
              </span>
            ))}
            {Array.from({ length: leadPad }).map((_, i) => (
              <span key={`pad${i}`} />
            ))}
            {monthDays.map((day) => {
              const st = statusStyle(byDate.get(iso(day)), color);
              return (
                <div key={iso(day)} className={`flex h-7 items-center justify-center rounded ${st.className}`} style={st.style}>
                  {format(day, "d")}
                </div>
              );
            })}
          </div>
        </section>

        <section>
          <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-text-muted">Last 17 weeks</h3>
          <div className="flex gap-1" data-testid="habit-heatmap">
            {weeks.map((week, i) => (
              <div key={i} className="flex flex-col gap-1">
                {week.map((day) => {
                  const st = statusStyle(byDate.get(iso(day)), color);
                  return <div key={iso(day)} title={iso(day)} className={`h-3 w-3 rounded-sm ${st.className}`} style={st.style} />;
                })}
              </div>
            ))}
          </div>
        </section>

        {journal.length > 0 && (
          <section>
            <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-text-muted">Journal</h3>
            <ul className="space-y-1 text-sm">
              {journal.map((c) => (
                <li key={c.id} className="flex gap-2">
                  <span className="w-24 shrink-0 text-text-muted">{format(parseISO(c.date), "MMM d")}</span>
                  <span>{c.note}</span>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </div>
  );
}
