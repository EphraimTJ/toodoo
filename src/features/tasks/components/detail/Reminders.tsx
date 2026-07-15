import { format, parseISO } from "date-fns";
import { DropdownMenu } from "radix-ui";
import type { Reminder, Task } from "../../../../lib/api";
import { useReminders } from "../../hooks/useTaskExtras";

/** Relative-reminder presets, in minutes before the due/start anchor. */
const PRESETS: [number, string][] = [
  [0, "On time"],
  [5, "5 minutes before"],
  [30, "30 minutes before"],
  [60, "1 hour before"],
  [1440, "1 day before"],
];

function describeReminder(r: Reminder): string {
  if (r.triggerKind === "ABS") {
    return r.at ? format(parseISO(r.at), "MMM d, h:mm a") : "At a set time";
  }
  const preset = PRESETS.find(([m]) => m === (r.offsetMin ?? 0));
  if (preset) return preset[1];
  const min = r.offsetMin ?? 0;
  return min % 1440 === 0 ? `${min / 1440} day(s) before` : `${min} minutes before`;
}

export function Reminders({ task }: { task: Task }) {
  const { query, addReminder, deleteReminder } = useReminders(task.id);
  const reminders = query.data ?? [];
  const hasAnchor = task.dueAt !== null || task.startAt !== null;

  return (
    <section className="mt-4">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-text-muted">Reminders</h3>
      <ul className="mt-1">
        {reminders.map((r) => (
          <li key={r.id} className="group flex items-center gap-2 py-0.5 text-sm">
            <span aria-hidden>🔔</span>
            <span>{describeReminder(r)}</span>
            {r.snoozedUntil && (
              <span className="text-xs text-text-muted">
                (snoozed to {format(parseISO(r.snoozedUntil), "MMM d, h:mm a")})
              </span>
            )}
            <button
              type="button"
              aria-label={`Delete reminder ${describeReminder(r)}`}
              className="ml-auto text-xs text-text-muted opacity-0 hover:text-red-500 group-hover:opacity-100"
              onClick={() => deleteReminder.mutate(r.id)}
            >
              ✕
            </button>
          </li>
        ))}
      </ul>

      <DropdownMenu.Root>
        <DropdownMenu.Trigger asChild>
          <button
            type="button"
            className="mt-1 text-sm text-text-muted hover:text-accent"
          >
            + Add reminder
          </button>
        </DropdownMenu.Trigger>
        <DropdownMenu.Portal>
          <DropdownMenu.Content
            sideOffset={6}
            className="z-50 min-w-44 rounded-md border border-border bg-surface p-1 text-sm shadow-lg"
          >
            {!hasAnchor && (
              <p className="px-2 py-1 text-xs text-text-muted">
                Set a start or due date to use “before” reminders.
              </p>
            )}
            {PRESETS.map(([offsetMin, label]) => (
              <DropdownMenu.Item
                key={offsetMin}
                disabled={!hasAnchor}
                className="cursor-pointer select-none rounded px-2 py-1 outline-none hover:bg-bg data-[highlighted]:bg-bg data-[disabled]:opacity-40"
                onSelect={() => addReminder.mutate({ triggerKind: "REL", offsetMin })}
              >
                {label}
              </DropdownMenu.Item>
            ))}
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>
    </section>
  );
}
