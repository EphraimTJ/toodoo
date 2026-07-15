import { useDroppable } from "@dnd-kit/core";
import { Popover } from "radix-ui";
import type { Rule, Tag, Task } from "../../../lib/api";
import { KanbanCard } from "../../kanban/components/KanbanCard";
import { useMatrix } from "../hooks/useMatrix";

const PRIORITY_OPTS: [number, string][] = [
  [5, "High"],
  [3, "Medium"],
  [1, "Low"],
  [0, "None"],
];

interface Props {
  quadrant: number;
  label: string;
  accent: string;
  tasks: Task[];
  tags: Tag[];
  rule: Rule;
}

/** Priorities the quadrant's rule currently matches (its editable dimension). */
function rulePriorities(rule: Rule): number[] {
  const cond = rule.conditions.find((c) => c.field === "priority");
  return cond && cond.field === "priority" ? cond.values : [];
}

export function MatrixQuadrant({ quadrant, label, accent, tasks, tags, rule }: Props) {
  const { setNodeRef, isOver } = useDroppable({ id: String(quadrant) });
  const { setQuadrant } = useMatrix();
  const selected = rulePriorities(rule);

  const togglePriority = (value: number) => {
    const next = selected.includes(value)
      ? selected.filter((v) => v !== value)
      : [...selected, value];
    setQuadrant.mutate({
      quadrant,
      rule: { match: "all", conditions: [{ field: "priority", values: next }] },
    });
  };

  return (
    <section
      ref={setNodeRef}
      aria-label={`Quadrant ${label}`}
      className={`flex min-h-0 flex-col rounded-lg border border-border bg-surface ${
        isOver ? "ring-2 ring-accent/40" : ""
      }`}
    >
      <header className="flex items-center gap-2 border-b border-border px-3 py-2">
        <span className={`h-2.5 w-2.5 rounded-full ${accent}`} />
        <h3 className="flex-1 text-sm font-semibold">{label}</h3>
        <span className="text-xs text-text-muted">{tasks.length}</span>
        <Popover.Root>
          <Popover.Trigger asChild>
            <button
              type="button"
              aria-label={`Edit ${label} rule`}
              className="text-text-muted hover:text-text"
            >
              ⚙
            </button>
          </Popover.Trigger>
          <Popover.Portal>
            <Popover.Content
              sideOffset={6}
              className="z-50 w-44 rounded-md border border-border bg-surface p-2 text-sm shadow-lg"
            >
              <p className="mb-1 text-[11px] uppercase tracking-wide text-text-muted">
                Priorities in this quadrant
              </p>
              {PRIORITY_OPTS.map(([value, plabel]) => (
                <label key={value} className="flex items-center gap-2 py-0.5">
                  <input
                    type="checkbox"
                    checked={selected.includes(value)}
                    onChange={() => togglePriority(value)}
                    className="accent-(--color-accent)"
                  />
                  {plabel}
                </label>
              ))}
            </Popover.Content>
          </Popover.Portal>
        </Popover.Root>
      </header>

      <div className="flex min-h-24 flex-1 flex-col gap-2 overflow-y-auto p-2">
        {tasks.map((task) => (
          <KanbanCard key={task.id} task={task} tags={tags} subtaskTotal={0} subtaskDone={0} />
        ))}
      </div>
    </section>
  );
}
