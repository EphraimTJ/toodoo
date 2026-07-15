import { useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { Draggable } from "@fullcalendar/interaction";
import { api } from "../../../lib/api";

/** Dateless tasks, made draggable onto the calendar grid. FullCalendar's
 *  Draggable turns each row into an external event source; the drop is handled
 *  by CalendarView's `eventReceive` (which schedules the task). */
export function UnscheduledPanel() {
  const { data: tasks } = useQuery({ queryKey: ["tasks", "smart:all"], queryFn: () => api.listSmart("all") });
  const undated = (tasks ?? []).filter((t) => !t.dueAt && !t.startAt);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!ref.current) return;
    const draggable = new Draggable(ref.current, {
      itemSelector: ".fc-draggable-task",
      eventData: (el) => ({
        title: el.getAttribute("data-title") ?? "",
        create: true,
        extendedProps: { kind: "NEW_TASK", taskId: el.getAttribute("data-task-id") },
      }),
    });
    return () => draggable.destroy();
  }, [undated.length]);

  return (
    <aside
      aria-label="Unscheduled tasks"
      data-testid="unscheduled-panel"
      className="flex w-56 shrink-0 flex-col border-l border-border p-2"
    >
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-text-muted">Unscheduled</h3>
      <div ref={ref} className="flex-1 space-y-1 overflow-y-auto">
        {undated.map((t) => (
          <div
            key={t.id}
            data-task-id={t.id}
            data-title={t.title}
            className="fc-draggable-task cursor-grab rounded border border-border bg-surface px-2 py-1 text-sm hover:border-accent"
          >
            {t.title}
          </div>
        ))}
        {undated.length === 0 && <p className="text-xs text-text-muted">Nothing unscheduled.</p>}
      </div>
    </aside>
  );
}
