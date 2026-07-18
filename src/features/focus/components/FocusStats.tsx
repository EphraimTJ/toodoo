import { useState } from "react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useFocusStats } from "../hooks/useFocus";

const RANGES: [number, string][] = [
  [7, "7 days"],
  [30, "30 days"],
  [90, "90 days"],
];

function rangeIso(days: number) {
  const now = new Date();
  const to = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);
  const from = new Date(to);
  from.setDate(from.getDate() - (days - 1));
  from.setHours(0, 0, 0, 0);
  return { from: from.toISOString(), to: to.toISOString() };
}

const minutes = (ms: number) => Math.round(ms / 60_000);

export function FocusStats() {
  const [days, setDays] = useState(7);
  const { from, to } = rangeIso(days);
  const { data } = useFocusStats(from, to);

  const perDay = (data?.perDay ?? []).map((d) => ({ date: d.date.slice(5), min: minutes(d.ms), pomos: d.pomos }));

  return (
    <div className="space-y-4 p-4" data-testid="focus-stats">
      <div className="flex items-center gap-2">
        <div className="flex gap-1 rounded-md border border-border p-0.5 text-xs">
          {RANGES.map(([d, label]) => (
            <button
              key={d}
              type="button"
              aria-pressed={days === d}
              onClick={() => setDays(d)}
              className={`rounded px-2 py-1 ${days === d ? "bg-accent text-accent-fg" : "text-text-muted"}`}
            >
              {label}
            </button>
          ))}
        </div>
        <span className="ml-auto text-sm text-text-muted">
          {minutes(data?.totalMs ?? 0)} min · {data?.pomoCount ?? 0} pomos
        </span>
      </div>

      <div className="h-56 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={perDay}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
            <XAxis dataKey="date" fontSize={11} stroke="var(--color-text-muted)" />
            <YAxis fontSize={11} stroke="var(--color-text-muted)" width={32} />
            <Tooltip
              contentStyle={{ background: "var(--color-surface)", border: "1px solid var(--color-border)", fontSize: 12 }}
              formatter={(v: number) => [`${v} min`, "Focus"]}
            />
            <Bar dataKey="min" fill="var(--color-accent)" radius={[3, 3, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-text-muted">By task</h3>
          <ul className="space-y-0.5 text-sm">
            {(data?.perTask ?? []).slice(0, 8).map((t) => (
              <li key={t.taskId ?? "none"} className="flex justify-between">
                <span className="min-w-0 truncate">{t.title}</span>
                <span className="text-text-muted">{minutes(t.ms)}m</span>
              </li>
            ))}
            {(data?.perTask ?? []).length === 0 && <li className="text-text-muted">No focus yet.</li>}
          </ul>
        </div>
        <div>
          <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-text-muted">By tag</h3>
          <ul className="space-y-0.5 text-sm">
            {(data?.perTag ?? []).slice(0, 8).map((t) => (
              <li key={t.tagId} className="flex justify-between">
                <span className="min-w-0 truncate">#{t.name}</span>
                <span className="text-text-muted">{minutes(t.ms)}m</span>
              </li>
            ))}
            {(data?.perTag ?? []).length === 0 && <li className="text-text-muted">No tagged focus.</li>}
          </ul>
        </div>
      </div>
    </div>
  );
}
