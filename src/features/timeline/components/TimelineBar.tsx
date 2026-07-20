import { useRef, useState } from "react";
import type { Task } from "../../../lib/api";
import { useTaskMutations } from "../../tasks/hooks/useTasks";
import { addDays, barGeometry, dateToX, toAllDayIso, xToDate } from "../lib/timeline";

const PRIORITY_FILL: Record<number, string> = {
  5: "#a85448",
  3: "#b0763f",
  1: "#5d7052",
  0: "#8a8f98",
};

type Mode = "move" | "left" | "right";

/** A draggable/resizable task bar. Body drag moves both dates (keeps the span);
 *  the edge handles set start/due. All snapping is day-granular. */
export function TimelineBar({
  task,
  origin,
  pxPerDay,
  onOpen,
}: {
  task: Task;
  origin: string;
  pxPerDay: number;
  onOpen(id: string): void;
}) {
  const { updateTask } = useTaskMutations();
  const span = barGeometry(task.startAt, task.dueAt);

  const baseLeft = span ? dateToX(span.start, origin, pxPerDay) : 0;
  const baseWidth = span ? span.days * pxPerDay : pxPerDay;

  const [override, setOverride] = useState<{ left: number; width: number } | null>(null);
  const drag = useRef<{ mode: Mode; startX: number; left: number; width: number; moved: boolean } | null>(null);

  if (!span) return null;
  const left = override?.left ?? baseLeft;
  const width = override?.width ?? baseWidth;

  const startDrag = (mode: Mode, e: React.PointerEvent) => {
    e.stopPropagation();
    drag.current = { mode, startX: e.clientX, left: baseLeft, width: baseWidth, moved: false };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const dx = e.clientX - d.startX;
    if (Math.abs(dx) > 2) d.moved = true;
    if (d.mode === "move") setOverride({ left: d.left + dx, width: d.width });
    else if (d.mode === "left") setOverride({ left: d.left + dx, width: Math.max(pxPerDay, d.width - dx) });
    else setOverride({ left: d.left, width: Math.max(pxPerDay, d.width + dx) });
  };

  const onPointerUp = () => {
    const d = drag.current;
    drag.current = null;
    if (!d) return;
    if (!d.moved) {
      setOverride(null);
      onOpen(task.id);
      return;
    }
    const start = xToDate(override?.left ?? baseLeft, origin, pxPerDay);
    const days = Math.max(1, Math.round((override?.width ?? baseWidth) / pxPerDay));
    const due = addDays(start, days - 1);
    setOverride(null);
    updateTask.mutate({
      id: task.id,
      patch: { startAt: toAllDayIso(start), dueAt: toAllDayIso(due), isAllDay: true },
    });
  };

  return (
    <div
      data-testid="timeline-bar"
      role="button"
      aria-label={task.title}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      className="absolute top-1 flex h-6 items-center rounded px-1 text-xs text-white shadow-sm"
      style={{ left, width, backgroundColor: PRIORITY_FILL[task.priority] ?? PRIORITY_FILL[0] }}
    >
      <span
        onPointerDown={(e) => startDrag("left", e)}
        className="absolute left-0 top-0 h-full w-1.5 cursor-ew-resize rounded-l"
        aria-label="Resize start"
      />
      <span onPointerDown={(e) => startDrag("move", e)} className="min-w-0 flex-1 cursor-grab truncate px-1">
        {task.title}
      </span>
      <span
        onPointerDown={(e) => startDrag("right", e)}
        className="absolute right-0 top-0 h-full w-1.5 cursor-ew-resize rounded-r"
        aria-label="Resize end"
      />
    </div>
  );
}
