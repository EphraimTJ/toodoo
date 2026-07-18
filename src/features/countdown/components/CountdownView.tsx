import { useState } from "react";
import { localDateParams, type Countdown, type CountdownStyle } from "../../../lib/api";
import { countdownView } from "../lib/countdown";
import { useCountdowns } from "../hooks/useCountdowns";
import { CountdownDialog } from "./CountdownDialog";

function label(kind: "until" | "since", days: number): string {
  if (kind === "until") return days === 0 ? "Today" : days === 1 ? "in 1 day" : `in ${days} days`;
  return days === 1 ? "1 day since" : `${days} days since`;
}

export function CountdownView() {
  const { query, setPinned, deleteCountdown } = useCountdowns();
  const today = localDateParams().today;
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Countdown | null>(null);

  const open = (c: Countdown | null) => {
    setEditing(c);
    setDialogOpen(true);
  };

  return (
    <div className="flex h-full min-w-0 flex-1 flex-col">
      <header className="flex items-center gap-2 border-b border-border px-4 py-2.5">
        <h2 className="text-base font-semibold">Countdown</h2>
        <button type="button" onClick={() => open(null)} className="ml-auto rounded-md border border-border px-2 py-1 text-xs hover:border-accent">
          + New countdown
        </button>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {(query.data ?? []).map((c) => {
            const style: CountdownStyle = c.styleJson ? JSON.parse(c.styleJson) : {};
            const view = countdownView(c.targetDate, c.repeatAnnual, style.countUp ?? false, today);
            return (
              <div
                key={c.id}
                data-testid="countdown-card"
                className="group relative flex aspect-square flex-col justify-between rounded-lg p-3 text-white shadow-sm"
                style={{ backgroundColor: style.color ?? "#4772fa" }}
              >
                <button
                  type="button"
                  aria-label={c.pinned ? `Unpin ${c.title}` : `Pin ${c.title}`}
                  onClick={() => setPinned.mutate({ id: c.id, pinned: !c.pinned })}
                  className={`absolute right-2 top-2 text-sm ${c.pinned ? "opacity-100" : "opacity-40 group-hover:opacity-100"}`}
                >
                  {c.pinned ? "★" : "☆"}
                </button>
                <button type="button" onClick={() => open(c)} className="flex flex-1 flex-col justify-between text-left">
                  <span className="pr-5 text-sm font-medium">{c.title}</span>
                  <span>
                    <span className="block text-4xl font-bold tabular-nums">{Math.abs(view.days)}</span>
                    <span className="text-xs opacity-90">{label(view.kind, view.days)}</span>
                  </span>
                </button>
                <button
                  type="button"
                  aria-label={`Delete ${c.title}`}
                  onClick={() => deleteCountdown.mutate(c.id)}
                  className="absolute bottom-2 right-2 text-xs opacity-0 group-hover:opacity-80"
                >
                  🗑
                </button>
              </div>
            );
          })}
        </div>
        {(query.data ?? []).length === 0 && (
          <div className="flex h-40 items-center justify-center text-sm text-text-muted">
            No countdowns yet — add one above.
          </div>
        )}
      </div>

      <CountdownDialog open={dialogOpen} onOpenChange={setDialogOpen} countdown={editing} onSaved={() => setEditing(null)} />
    </div>
  );
}
