import { useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { dayRange, useAchievement, useScoreHistory, useSummary } from "../hooks/useStats";

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const minutes = (ms: number) => Math.round(ms / 60_000);

/** A heat cell colored by intensity (0..1) of `value / max`. */
function Cell({ value, max, label }: { value: number; max: number; label: string }) {
  const t = max > 0 ? value / max : 0;
  return (
    <div
      className="flex aspect-square items-center justify-center rounded text-[10px]"
      style={{
        background: t === 0 ? "var(--color-bg)" : `color-mix(in srgb, var(--color-accent) ${Math.round(t * 100)}%, var(--color-bg))`,
        color: t > 0.5 ? "var(--color-accent-fg)" : "var(--color-text-muted)",
      }}
      title={`${label}: ${value}`}
    >
      {value > 0 ? value : ""}
    </div>
  );
}

export function StatsView() {
  const [period, setPeriod] = useState<"week" | "month">("week");
  const { from, to } = dayRange(period === "week" ? 7 : 30);
  const histRange = dayRange(30);

  const { data: ach } = useAchievement();
  const { data: history } = useScoreHistory(histRange.from, histRange.to);
  const { data: summary } = useSummary(from, to);

  const score = ach?.score ?? 0;
  const base = ach?.base ?? 0;
  const next = ach?.next ?? null;
  const progress = next !== null && next > base ? Math.min(1, (score - base) / (next - base)) : 1;

  const historyData = (history ?? []).map((p) => ({ date: p.date.slice(5), score: p.cumulative }));
  const perDay = (summary?.perDay ?? []).map((d) => ({ date: d.date.slice(5), count: d.count }));
  const weekdayMax = Math.max(0, ...(summary?.weekday ?? []));
  const hourMax = Math.max(0, ...(summary?.hour ?? []));

  return (
    <div className="space-y-6 overflow-y-auto p-4" data-testid="stats-view">
      <h1 className="text-lg font-semibold">Stats</h1>

      {/* Achievement */}
      <section className="rounded-lg border border-border p-4" data-testid="achievement-card">
        <div className="flex items-baseline justify-between">
          <div>
            <div className="text-sm text-text-muted">Achievement score</div>
            <div className="text-3xl font-bold tabular-nums" data-testid="achievement-score">
              {score}
            </div>
          </div>
          <div className="text-right">
            <div className="rounded-full bg-accent px-3 py-1 text-sm font-medium text-accent-fg">
              Lv {ach?.level ?? 1} · {ach?.title ?? "Novice"}
            </div>
          </div>
        </div>
        <div className="mt-3">
          <div className="h-2 w-full overflow-hidden rounded-full bg-bg">
            <div className="h-full rounded-full bg-accent" style={{ width: `${progress * 100}%` }} />
          </div>
          <div className="mt-1 text-xs text-text-muted">
            {next !== null ? `${next - score} points to next level` : "Max level reached"}
          </div>
        </div>
        <div className="mt-4 h-40 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={historyData}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
              <XAxis dataKey="date" fontSize={11} stroke="var(--color-text-muted)" />
              <YAxis fontSize={11} stroke="var(--color-text-muted)" width={32} />
              <Tooltip
                contentStyle={{ background: "var(--color-surface)", border: "1px solid var(--color-border)", fontSize: 12 }}
              />
              <Line type="monotone" dataKey="score" stroke="var(--color-accent)" dot={false} strokeWidth={2} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </section>

      {/* Summary */}
      <section className="space-y-4">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-text-muted">Summary</h2>
          <div className="ml-auto flex gap-1 rounded-md border border-border p-0.5 text-xs">
            {(["week", "month"] as const).map((p) => (
              <button
                key={p}
                type="button"
                aria-pressed={period === p}
                onClick={() => setPeriod(p)}
                className={`rounded px-2 py-1 capitalize ${period === p ? "bg-accent text-accent-fg" : "text-text-muted"}`}
              >
                {p}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat label="Completion rate" value={`${Math.round((summary?.completionRate ?? 0) * 100)}%`} testid="stat-rate" />
          <Stat label="Tasks completed" value={String(summary?.completedCount ?? 0)} testid="stat-completed" />
          <Stat label="Focus time" value={`${minutes(summary?.focusMs ?? 0)}m`} testid="stat-focus" />
          <Stat
            label="Procrastination"
            value={`${summary?.lateCount ?? 0} late · ${summary?.overdueCount ?? 0} overdue`}
            testid="stat-procrastination"
          />
        </div>

        <div className="h-48 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={perDay}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
              <XAxis dataKey="date" fontSize={11} stroke="var(--color-text-muted)" />
              <YAxis fontSize={11} stroke="var(--color-text-muted)" width={32} allowDecimals={false} />
              <Tooltip
                contentStyle={{ background: "var(--color-surface)", border: "1px solid var(--color-border)", fontSize: 12 }}
                formatter={(v: number) => [`${v}`, "Completed"]}
              />
              <Bar dataKey="count" fill="var(--color-accent)" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Heatmaps */}
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-text-muted">Best weekday</h3>
            <div className="grid grid-cols-7 gap-1" data-testid="weekday-heatmap">
              {(summary?.weekday ?? new Array(7).fill(0)).map((v, i) => (
                <div key={i} className="space-y-1">
                  <Cell value={v} max={weekdayMax} label={WEEKDAYS[i]} />
                  <div className="text-center text-[10px] text-text-muted">{WEEKDAYS[i]}</div>
                </div>
              ))}
            </div>
          </div>
          <div>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-text-muted">Best hour</h3>
            <div className="grid grid-cols-12 gap-1" data-testid="hour-heatmap">
              {(summary?.hour ?? new Array(24).fill(0)).map((v, i) => (
                <Cell key={i} value={v} max={hourMax} label={`${i}:00`} />
              ))}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

function Stat({ label, value, testid }: { label: string; value: string; testid: string }) {
  return (
    <div className="rounded-lg border border-border p-3" data-testid={testid}>
      <div className="text-xs text-text-muted">{label}</div>
      <div className="mt-1 text-lg font-semibold">{value}</div>
    </div>
  );
}
