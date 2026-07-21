import { useDraggable } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { Pin, Repeat } from "lucide-react";
import type { Tag, Task } from "../../../lib/api";
import { useUiStore } from "../../../lib/uiStore";
import { useTaskMutations } from "../../tasks/hooks/useTasks";
import { dueChip } from "../../tasks/lib/sortGroup";

const PRIORITY_DOT: Record<number, string> = {
  5: "border-destructive bg-destructive",
  3: "border-secondary bg-secondary",
  1: "border-accent bg-accent",
  0: "border-border bg-transparent",
};

interface Props {
  task: Task;
  tags: Tag[];
  subtaskTotal: number;
  subtaskDone: number;
}

export function KanbanCard({ task, tags, subtaskTotal, subtaskDone }: Props) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: task.id });
  const { selectTask, selectedTaskId } = useUiStore();
  const { completeTask } = useTaskMutations();

  const chip = dueChip(task);
  const rowTags = tags.filter((t) => task.tagIds.includes(t.id));

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform) }}
      {...attributes}
      {...listeners}
      data-testid="kanban-card"
      onClick={() => selectTask(task.id)}
      className={`cursor-grab rounded-md border border-border bg-bg p-2 text-sm shadow-sm hover:border-accent/50 ${
        isDragging ? "opacity-40" : ""
      } ${selectedTaskId === task.id ? "ring-1 ring-accent/40" : ""}`}
    >
      <div className="flex items-start gap-2">
        <button
          type="button"
          role="checkbox"
          aria-checked={false}
          aria-label={`Complete ${task.title}`}
          onClick={(e) => {
            e.stopPropagation();
            completeTask.mutate(task);
          }}
          className={`mt-0.5 h-3.5 w-3.5 shrink-0 rounded-full border ${
            PRIORITY_DOT[task.priority] ?? PRIORITY_DOT[0]
          }`}
        />
        <span className="min-w-0 flex-1 break-words">{task.title}</span>
        {task.pinned && (
          <span aria-label="Pinned" className="flex items-center text-accent">
            <Pin size={11} strokeWidth={1.75} />
          </span>
        )}
        {task.rrule && (
          <span aria-label="Repeats" className="flex items-center text-text-muted">
            <Repeat size={11} strokeWidth={1.75} />
          </span>
        )}
      </div>
      <div className="mt-1 flex flex-wrap items-center gap-2 pl-5 text-xs text-text-muted">
        {chip && <span className={chip.overdue ? "text-destructive" : ""}>{chip.text}</span>}
        {subtaskTotal > 0 && (
          <span>
            ☑ {subtaskDone}/{subtaskTotal}
          </span>
        )}
        {rowTags.map((t) => (
          <span key={t.id} style={{ color: t.color ?? undefined }}>
            #{t.name}
          </span>
        ))}
      </div>
    </div>
  );
}
