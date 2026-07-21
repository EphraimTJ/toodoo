import { useState } from "react";
import { X } from "lucide-react";
import { format, parseISO } from "date-fns";
import { useFocusMutations, useFocusSessions } from "../hooks/useFocus";

function rangeIso(days: number) {
  const now = new Date();
  const to = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);
  const from = new Date(to);
  from.setDate(from.getDate() - (days - 1));
  from.setHours(0, 0, 0, 0);
  return { from: from.toISOString(), to: to.toISOString() };
}

const durationMin = (startedAt: string, endedAt: string | null, pauseMs: number) =>
  endedAt ? Math.max(0, Math.round((new Date(endedAt).getTime() - new Date(startedAt).getTime() - pauseMs) / 60_000)) : 0;

const toLocalInput = (iso: string) => {
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
};

/** Editable focus-record timeline: add a session by hand, or delete one. */
export function FocusRecords() {
  const { from, to } = rangeIso(30);
  const { data: sessions } = useFocusSessions(from, to);
  const { addSession, deleteSession } = useFocusMutations();
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");

  const add = () => {
    if (!start || !end) return;
    addSession.mutate({
      taskId: null,
      kind: "STOPWATCH",
      startedAt: new Date(start).toISOString(),
      endedAt: new Date(end).toISOString(),
    });
    setStart("");
    setEnd("");
  };

  return (
    <div className="space-y-3 p-4" data-testid="focus-records">
      <div className="flex flex-wrap items-end gap-2 rounded-md border border-border p-2 text-sm">
        <label className="text-xs text-text-muted">
          From
          <input
            type="datetime-local"
            value={start}
            aria-label="Record start"
            onChange={(e) => setStart(e.target.value)}
            className="block rounded border border-border bg-bg px-2 py-1 outline-none focus:border-accent"
          />
        </label>
        <label className="text-xs text-text-muted">
          To
          <input
            type="datetime-local"
            value={end}
            aria-label="Record end"
            onChange={(e) => setEnd(e.target.value)}
            className="block rounded border border-border bg-bg px-2 py-1 outline-none focus:border-accent"
          />
        </label>
        <button type="button" onClick={add} className="rounded-md bg-accent px-3 py-1 text-accent-fg">
          Add record
        </button>
        <button
          type="button"
          onClick={() => {
            const now = new Date();
            setStart(toLocalInput(new Date(now.getTime() - 25 * 60_000).toISOString()));
            setEnd(toLocalInput(now.toISOString()));
          }}
          className="rounded-md border border-border px-3 py-1 text-text-muted"
        >
          Last 25 min
        </button>
      </div>

      <ul className="divide-y divide-border">
        {(sessions ?? []).map((s) => (
          <li key={s.id} className="group flex items-center gap-3 py-1.5 text-sm">
            <span className="w-36 text-text-muted">{format(parseISO(s.startedAt), "MMM d, h:mm a")}</span>
            <span className="w-16">{durationMin(s.startedAt, s.endedAt, s.pauseMs)} min</span>
            <span className="rounded bg-bg px-1.5 text-xs text-text-muted">{s.kind === "POMO" ? "🍅" : "⏱"}</span>
            <span className="min-w-0 flex-1 truncate text-text-muted">{s.note}</span>
            <button
              type="button"
              aria-label="Delete record"
              onClick={() => deleteSession.mutate(s.id)}
              className="text-text-muted opacity-0 hover:text-destructive group-hover:opacity-100"
            >
              <X size={13} strokeWidth={2} />
            </button>
          </li>
        ))}
        {(sessions ?? []).length === 0 && (
          <li className="py-4 text-center text-sm text-text-muted">No focus records yet.</li>
        )}
      </ul>
    </div>
  );
}
