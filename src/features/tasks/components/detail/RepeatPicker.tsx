import { useState } from "react";
import { Popover } from "radix-ui";
import type { RepeatFrom, Task } from "../../../../lib/api";
import { useTaskMutations } from "../../hooks/useTasks";
import {
  composeRrule,
  DEFAULT_PARTS,
  describeRrule,
  parseRrule,
  WEEKDAYS,
  weekdayLabel,
  type Freq,
  type RecurrenceParts,
  type Weekday,
} from "../../lib/rrule";

const FREQS: [Freq, string][] = [
  ["DAILY", "Daily"],
  ["WEEKLY", "Weekly"],
  ["MONTHLY", "Monthly"],
  ["YEARLY", "Yearly"],
];

export function RepeatPicker({ task }: { task: Task }) {
  const { updateTask } = useTaskMutations();
  const [open, setOpen] = useState(false);

  const summary = describeRrule(task.rrule);
  const parts = parseRrule(task.rrule) ?? DEFAULT_PARTS;
  const repeatFrom: RepeatFrom = task.repeatFrom === "COMPLETION" ? "COMPLETION" : "DUE";

  const apply = (next: RecurrenceParts, from: RepeatFrom = repeatFrom) =>
    updateTask.mutate({ id: task.id, patch: { rrule: composeRrule(next), repeatFrom: from } });

  const clear = () =>
    updateTask.mutate({ id: task.id, patch: { rrule: null, repeatFrom: null } });

  const toggleDay = (day: Weekday) => {
    const byDay = parts.byDay.includes(day)
      ? parts.byDay.filter((d) => d !== day)
      : [...parts.byDay, day];
    apply({ ...parts, byDay });
  };

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>
        <button
          type="button"
          aria-label="Repeat"
          className={`rounded-md border border-border px-2 py-1 text-xs hover:border-accent ${
            summary ? "text-accent" : "text-text-muted hover:text-text"
          }`}
        >
          ↻ {summary ?? "Repeat"}
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          sideOffset={6}
          className="z-50 w-64 rounded-md border border-border bg-surface p-3 text-sm shadow-lg"
        >
          <div className="grid grid-cols-4 gap-1">
            {FREQS.map(([value, label]) => (
              <button
                key={value}
                type="button"
                onClick={() => apply({ ...parts, freq: value })}
                className={`rounded border px-1.5 py-1 text-xs ${
                  task.rrule && parts.freq === value
                    ? "border-accent text-accent"
                    : "border-border text-text-muted hover:border-accent"
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          <label className="mt-3 flex items-center gap-2 text-xs text-text-muted">
            Every
            <input
              type="number"
              min={1}
              value={parts.interval}
              aria-label="Repeat interval"
              onChange={(e) => apply({ ...parts, interval: Math.max(1, Number(e.target.value) || 1) })}
              className="w-14 rounded border border-border bg-bg px-1 py-0.5 text-text outline-none focus:border-accent"
            />
            {{ DAILY: "day(s)", WEEKLY: "week(s)", MONTHLY: "month(s)", YEARLY: "year(s)" }[parts.freq]}
          </label>

          {parts.freq === "WEEKLY" && (
            <div className="mt-2 flex flex-wrap gap-1" aria-label="Repeat weekdays">
              {WEEKDAYS.map((day) => (
                <button
                  key={day}
                  type="button"
                  aria-label={weekdayLabel(day)}
                  aria-pressed={parts.byDay.includes(day)}
                  onClick={() => toggleDay(day)}
                  className={`h-7 w-7 rounded-full text-[11px] ${
                    parts.byDay.includes(day)
                      ? "bg-accent text-accent-fg"
                      : "border border-border text-text-muted hover:border-accent"
                  }`}
                >
                  {weekdayLabel(day).slice(0, 1)}
                </button>
              ))}
            </div>
          )}

          <fieldset className="mt-3 border-t border-border pt-2">
            <legend className="text-[11px] uppercase tracking-wide text-text-muted">Ends</legend>
            <div className="mt-1 space-y-1">
              <label className="flex items-center gap-2 text-xs">
                <input
                  type="radio"
                  name="repeat-end"
                  checked={parts.end.kind === "never"}
                  onChange={() => apply({ ...parts, end: { kind: "never" } })}
                  className="accent-(--color-accent)"
                />
                Never
              </label>
              <label className="flex items-center gap-2 text-xs">
                <input
                  type="radio"
                  name="repeat-end"
                  checked={parts.end.kind === "count"}
                  onChange={() => apply({ ...parts, end: { kind: "count", count: 5 } })}
                  className="accent-(--color-accent)"
                />
                After
                <input
                  type="number"
                  min={1}
                  aria-label="Repeat count"
                  disabled={parts.end.kind !== "count"}
                  value={parts.end.kind === "count" ? parts.end.count : 5}
                  onChange={(e) =>
                    apply({ ...parts, end: { kind: "count", count: Math.max(1, Number(e.target.value) || 1) } })
                  }
                  className="w-12 rounded border border-border bg-bg px-1 py-0.5 text-text outline-none focus:border-accent disabled:opacity-40"
                />
                times
              </label>
              <label className="flex items-center gap-2 text-xs">
                <input
                  type="radio"
                  name="repeat-end"
                  checked={parts.end.kind === "until"}
                  onChange={() =>
                    apply({
                      ...parts,
                      end: { kind: "until", date: new Date().toISOString().slice(0, 10) },
                    })
                  }
                  className="accent-(--color-accent)"
                />
                On
                <input
                  type="date"
                  aria-label="Repeat until date"
                  disabled={parts.end.kind !== "until"}
                  value={parts.end.kind === "until" ? parts.end.date : ""}
                  onChange={(e) =>
                    e.target.value && apply({ ...parts, end: { kind: "until", date: e.target.value } })
                  }
                  className="rounded border border-border bg-bg px-1 py-0.5 text-text outline-none focus:border-accent disabled:opacity-40"
                />
              </label>
            </div>
          </fieldset>

          <div className="mt-3 flex gap-1 border-t border-border pt-2" aria-label="Repeat from">
            {(["DUE", "COMPLETION"] as RepeatFrom[]).map((from) => (
              <button
                key={from}
                type="button"
                onClick={() => apply(parts, from)}
                className={`flex-1 rounded border px-1.5 py-1 text-[11px] ${
                  repeatFrom === from
                    ? "border-accent text-accent"
                    : "border-border text-text-muted hover:border-accent"
                }`}
              >
                {from === "DUE" ? "From due date" : "After completion"}
              </button>
            ))}
          </div>

          {task.rrule && (
            <button
              type="button"
              onClick={() => {
                clear();
                setOpen(false);
              }}
              className="mt-3 w-full rounded-md border border-border py-1 text-xs text-text-muted hover:text-red-500"
            >
              Remove repeat
            </button>
          )}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
