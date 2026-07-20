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
import { Popover } from "radix-ui";

interface Props {
  label: string;
  value: string | null;
  onChange(iso: string | null): void;
}

/** All-day date picker (timed tasks arrive with Phase 2's date-picker parity). */
export function DatePicker({ label, value, onChange }: Props) {
  const [month, setMonth] = useState(() => (value ? parseISO(value) : new Date()));
  const selected = value ? parseISO(value) : null;

  const days = eachDayOfInterval({
    start: startOfWeek(startOfMonth(month), { weekStartsOn: 1 }),
    end: endOfWeek(endOfMonth(month), { weekStartsOn: 1 }),
  });

  return (
    <Popover.Root>
      <Popover.Trigger asChild>
        <button
          type="button"
          className="rounded-md border border-border px-2 py-1 text-xs text-text-muted hover:border-accent hover:text-text"
        >
          {label}: {selected ? format(selected, "MMM d, yyyy") : "None"}
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          sideOffset={6}
          className="z-50 w-64 rounded-md border border-border bg-surface p-3 shadow-lg"
        >
          <div className="mb-2 flex items-center justify-between text-sm">
            <button
              type="button"
              aria-label="Previous month"
              onClick={() => setMonth(addMonths(month, -1))}
              className="px-2 hover:text-accent"
            >
              ‹
            </button>
            <span className="font-medium">{format(month, "MMMM yyyy")}</span>
            <button
              type="button"
              aria-label="Next month"
              onClick={() => setMonth(addMonths(month, 1))}
              className="px-2 hover:text-accent"
            >
              ›
            </button>
          </div>
          <div className="grid grid-cols-7 gap-0.5 text-center text-xs">
            {["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"].map((d) => (
              <span key={d} className="py-1 text-text-muted">
                {d}
              </span>
            ))}
            {days.map((day) => (
              <Popover.Close key={day.toISOString()} asChild>
                <button
                  type="button"
                  onClick={() => onChange(`${format(day, "yyyy-MM-dd")}T00:00:00.000Z`)}
                  className={`rounded py-1 hover:bg-accent/15 ${
                    isSameMonth(day, month) ? "" : "text-text-muted/50"
                  } ${selected && isSameDay(day, selected) ? "bg-accent text-accent-fg" : ""} ${
                    isSameDay(day, new Date()) ? "font-bold text-accent" : ""
                  }`}
                >
                  {format(day, "d")}
                </button>
              </Popover.Close>
            ))}
          </div>
          {selected && (
            <Popover.Close asChild>
              <button
                type="button"
                onClick={() => onChange(null)}
                className="mt-2 w-full rounded-md border border-border py-1 text-xs text-text-muted hover:text-destructive"
              >
                Clear
              </button>
            </Popover.Close>
          )}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
