import type { Task } from "../../../lib/api";

/** The project's dateless tasks; each is HTML5-draggable onto the timeline grid
 *  (TimelineView handles the drop and schedules the task at the dropped day). */
export function UnscheduledTimelinePanel({ tasks }: { tasks: Task[] }) {
  return (
    <aside
      aria-label="Unscheduled tasks"
      data-testid="timeline-unscheduled"
      className="flex w-52 shrink-0 flex-col border-l border-border p-2"
    >
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-text-muted">Unscheduled</h3>
      <div className="flex-1 space-y-1 overflow-y-auto">
        {tasks.map((t) => (
          <div
            key={t.id}
            draggable
            onDragStart={(e) => e.dataTransfer.setData("text/task", t.id)}
            className="cursor-grab truncate rounded border border-border bg-surface px-2 py-1 text-sm hover:border-accent"
          >
            {t.title}
          </div>
        ))}
        {tasks.length === 0 && <p className="text-xs text-text-muted">Nothing unscheduled.</p>}
      </div>
    </aside>
  );
}
