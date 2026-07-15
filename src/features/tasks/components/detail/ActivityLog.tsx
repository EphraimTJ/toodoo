import { formatDistanceToNow, parseISO } from "date-fns";
import type { Task } from "../../../../lib/api";
import { useActivity } from "../../hooks/useTaskExtras";

const ACTION_LABEL: Record<string, { icon: string; text: string }> = {
  created: { icon: "✨", text: "Created" },
  edited: { icon: "✏️", text: "Edited" },
  completed: { icon: "✓", text: "Completed" },
  recurrence_advanced: { icon: "↻", text: "Rolled to next occurrence" },
};

export function ActivityLog({ task }: { task: Task }) {
  const { data: entries } = useActivity(task.id);
  if (!entries || entries.length === 0) return null;

  return (
    <section className="mt-4">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-text-muted">Activity</h3>
      <ul className="mt-1 space-y-0.5">
        {entries.map((entry) => {
          const label = ACTION_LABEL[entry.action] ?? { icon: "•", text: entry.action };
          return (
            <li key={entry.id} className="flex items-center gap-2 text-xs text-text-muted">
              <span aria-hidden>{label.icon}</span>
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
