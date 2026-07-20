import { DndContext, PointerSensor, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import type { QuadrantTasks } from "../../../lib/api";
import { useTags } from "../../tags/hooks/useTags";
import { useMatrix } from "../hooks/useMatrix";
import { MatrixQuadrant } from "./MatrixQuadrant";

const QUADRANTS: { quadrant: number; label: string; accent: string }[] = [
  { quadrant: 0, label: "Urgent & Important", accent: "bg-destructive" },
  { quadrant: 1, label: "Important, Not Urgent", accent: "bg-accent" },
  { quadrant: 2, label: "Urgent, Not Important", accent: "bg-secondary" },
  { quadrant: 3, label: "Neither", accent: "bg-zinc-400" },
];

export function MatrixView() {
  const { config, tasks, assign } = useMatrix();
  const { data: tags } = useTags();
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const tasksByQuadrant = (q: number): QuadrantTasks["tasks"] =>
    (tasks.data ?? []).find((qt) => qt.quadrant === q)?.tasks ?? [];
  const ruleFor = (q: number) =>
    (config.data ?? []).find((c) => c.quadrant === q)?.rule ?? { match: "all" as const, conditions: [] };

  const onDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over) return;
    assign.mutate({ taskId: String(active.id), quadrant: Number(over.id) });
  };

  return (
    <div className="flex h-full min-w-0 flex-1 flex-col">
      <header className="border-b border-border px-4 py-2.5">
        <h2 className="text-base font-semibold">Eisenhower Matrix</h2>
      </header>
      <DndContext sensors={sensors} onDragEnd={onDragEnd}>
        <div
          className="grid min-h-0 flex-1 grid-cols-2 grid-rows-2 gap-3 p-3"
          data-testid="matrix-view"
        >
          {QUADRANTS.map((q) => (
            <MatrixQuadrant
              key={q.quadrant}
              quadrant={q.quadrant}
              label={q.label}
              accent={q.accent}
              tasks={tasksByQuadrant(q.quadrant)}
              tags={tags ?? []}
              rule={ruleFor(q.quadrant)}
            />
          ))}
        </div>
      </DndContext>
    </div>
  );
}
