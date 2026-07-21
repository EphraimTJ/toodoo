import { useState } from "react";
import {
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameDay,
  isSameMonth,
  parseISO,
  startOfMonth,
  startOfWeek,
} from "date-fns";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Popover } from "radix-ui";
import { allDayToLocal } from "../../../../lib/date";

interface Props {
  label: string;
  value: string | null;
  /** All-day tasks store a UTC-midnight calendar date; timed tasks store a real
   *  instant and get a time field. */
  allDay: boolean;
  onChange(iso: string | null): void;
}

export function DatePicker({ label, value, allDay, onChange }: Props) {
  // All-day dates read as their UTC calendar day; timed as the actual instant.
  const selected = value ? (allDay ? allDayToLocal(value) : parseISO(value)) : null;
  const [month, setMonth] = useState(() => selected ?? new Date());

  const days = eachDayOfInterval({
    start: startOfWeek(startOfMonth(month), { weekStartsOn: 1 }),
    end: endOfWeek(endOfMonth(month), { weekStartsOn: 1 }),
  });

  // Emit the stored ISO for a chosen calendar day, honoring all-day vs timed
  // (timed keeps the current time-of-day on the new date, defaulting to 9am).
  const pickDay = (day: Date) => {
    if (allDay) {
      onChange(`${format(day, "yyyy-MM-dd")}T00:00:00.000Z`);
    } else {
      const base = selected ?? new Date(new Date().setHours(9, 0, 0, 0));
      const dt = new Date(day.getFullYear(), day.getMonth(), day.getDate(), base.getHours(), base.getMinutes(), 0, 0);
      onChange(dt.toISOString());
    }
  };

  const pickTime = (hhmm: string) => {
    const [h, m] = hhmm.split(":").map(Number);
    const base = selected ?? new Date();
    const dt = new Date(base.getFullYear(), base.getMonth(), base.getDate(), h || 0, m || 0, 0, 0);
    onChange(dt.toISOString());
  };

  const triggerText = selected
    ? allDay
      ? format(selected, "MMM d, yyyy")
      : format(selected, "MMM d · h:mm a")
    : "None";

  return (
    <Popover.Root>
      <Popover.Trigger asChild>
        <button
          type="button"
          className="rounded-full border border-border px-2.5 py-1 text-xs text-text-muted hover:border-accent hover:text-text"
        >
          {label}: {triggerText}
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          sideOffset={6}
          className="z-50 w-64 rounded-2xl border border-border bg-surface p-3 shadow-float"
        >
          <div className="mb-2 flex items-center justify-between text-sm">
            <button
              type="button"
              aria-label="Previous month"
              onClick={() => setMonth(addMonths(month, -1))}
              className="flex items-center rounded-md p-1 hover:text-accent"
            >
              <ChevronLeft size={16} strokeWidth={2} />
            </button>
            <span className="font-medium">{format(month, "MMMM yyyy")}</span>
            <button
              type="button"
              aria-label="Next month"
              onClick={() => setMonth(addMonths(month, 1))}
              className="flex items-center rounded-md p-1 hover:text-accent"
            >
              <ChevronRight size={16} strokeWidth={2} />
            </button>
          </div>
          <div className="grid grid-cols-7 gap-0.5 text-center text-xs">
            {["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"].map((d) => (
              <span key={d} className="py-1 text-text-muted">
                {d}
              </span>
            ))}
            {days.map((day) => (
              <button
                key={day.toISOString()}
                type="button"
                onClick={() => pickDay(day)}
                className={`rounded-md py-1 hover:bg-accent/15 ${
                  isSameMonth(day, month) ? "" : "text-text-muted/50"
                } ${selected && isSameDay(day, selected) ? "bg-accent text-accent-fg" : ""} ${
                  isSameDay(day, new Date()) ? "font-bold text-accent" : ""
                }`}
              >
                {format(day, "d")}
              </button>
            ))}
          </div>

          {!allDay && (
            <label className="mt-3 flex items-center justify-between gap-2 text-xs text-text-muted">
              Time
              <input
                type="time"
                aria-label={`${label} time`}
                value={selected ? format(selected, "HH:mm") : "09:00"}
                onChange={(e) => pickTime(e.target.value)}
                className="rounded-full border border-border bg-bg px-2.5 py-1 text-text outline-none focus:border-accent"
              />
            </label>
          )}

          {selected && (
            <button
              type="button"
              onClick={() => onChange(null)}
              className="mt-2 w-full rounded-full border border-border py-1 text-xs text-text-muted hover:text-destructive"
            >
              Clear
            </button>
          )}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
