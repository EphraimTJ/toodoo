import { formatDistanceToNow, parseISO } from "date-fns";
import { Check, Circle, Pencil, Repeat, Sparkles, type LucideIcon } from "lucide-react";
import type { Task } from "../../../../lib/api";
import { useActivity } from "../../hooks/useTaskExtras";

const ACTION_LABEL: Record<string, { Icon: LucideIcon; text: string }> = {
  created: { Icon: Sparkles, text: "Created" },
  edited: { Icon: Pencil, text: "Edited" },
  completed: { Icon: Check, text: "Completed" },
  recurrence_advanced: { Icon: Repeat, text: "Rolled to next occurrence" },
};

export function ActivityLog({ task }: { task: Task }) {
  const { data: entries } = useActivity(task.id);
  if (!entries || entries.length === 0) return null;

  return (
    <section className="mt-4">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-text-muted">Activity</h3>
      <ul className="mt-1 space-y-0.5">
        {entries.map((entry) => {
          const label = ACTION_LABEL[entry.action] ?? { Icon: Circle, text: entry.action };
          return (
            <li key={entry.id} className="flex items-center gap-2 text-xs text-text-muted">
              <label.Icon size={13} strokeWidth={1.75} className="text-accent" aria-hidden />
              <span className="text-text">{label.text}</span>
              <span className="ml-auto">
                {formatDistanceToNow(parseISO(entry.at), { addSuffix: true })}
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
