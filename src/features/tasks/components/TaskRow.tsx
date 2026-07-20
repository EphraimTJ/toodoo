import { useState } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { Tag, Task } from "../../../lib/api";
import { useUiStore } from "../../../lib/uiStore";
import { useTaskMutations } from "../hooks/useTasks";
import { dueChip } from "../lib/sortGroup";
import { describeRrule } from "../lib/rrule";

// Priority reads through the earth palette: burnt sienna (high) → terracotta
// (medium) → moss (low) → raw timber (none).
const PRIORITY_COLOR: Record<number, string> = {
  5: "border-destructive text-destructive",
  3: "border-secondary text-secondary",
  1: "border-accent text-accent",
  0: "border-border text-text-muted",
};

interface Props {
  task: Task;
  depth: number;
  tags: Tag[];
  draggable: boolean;
  inTrash: boolean;
}

export function TaskRow({ task, depth, tags, draggable, inTrash }: Props) {
  const { selectedTaskId, selectTask, multiSelect, toggleMultiSelect } = useUiStore();
  const { completeTask, reopenTask, updateTask, restoreTask, deleteTaskForever } =
    useTaskMutations();
  const [completing, setCompleting] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(task.title);

  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: task.id,
    disabled: !draggable,
  });

  const done = task.status === "COMPLETED";
  const chip = dueChip(task);
  const rowTags = tags.filter((t) => task.tagIds.includes(t.id));

  const toggle = () => {
    if (inTrash) return;
    if (done) {
      reopenTask.mutate(task.id);
    } else {
      // Let the fill/strike animation play before the row moves away.
      setCompleting(true);
      window.setTimeout(() => {
        completeTask.mutate(task);
        setCompleting(false);
      }, 350);
    }
  };

  const commitTitle = () => {
    setEditing(false);
    const title = draft.trim();
    if (title && title !== task.title) updateTask.mutate({ id: task.id, patch: { title } });
    else setDraft(task.title);
  };

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        paddingLeft: `${depth * 24 + 8}px`,
      }}
      data-testid="task-row"
      className={`group flex h-9 items-center gap-2 rounded-md pr-2 text-sm hover:bg-surface ${
        selectedTaskId === task.id ? "bg-surface ring-1 ring-accent/40" : ""
      } ${multiSelect.has(task.id) ? "bg-accent/10" : ""} ${isDragging ? "opacity-40" : ""}`}
      onClick={(e) => {
        if (e.ctrlKey || e.metaKey) toggleMultiSelect(task.id);
        else selectTask(task.id);
      }}
    >
      {draggable && (
        <button
          type="button"
          aria-label="Drag to reorder"
          className="cursor-grab text-text-muted opacity-0 group-hover:opacity-60"
          {...attributes}
          {...listeners}
          onClick={(e) => e.stopPropagation()}
        >
          ⠿
        </button>
      )}
      <button
        type="button"
        role="checkbox"
        aria-checked={done || completing}
        aria-label={done ? `Reopen ${task.title}` : `Complete ${task.title}`}
        onClick={(e) => {
          e.stopPropagation();
          toggle();
        }}
        className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-md border-2 transition-all duration-300 ${
          PRIORITY_COLOR[task.priority] ?? PRIORITY_COLOR[0]
        } ${done || completing ? "bg-current" : "bg-transparent"}`}
      >
        {(done || completing) && <span className="text-[10px] leading-none text-surface">✓</span>}
      </button>

      {editing ? (
        <input
          autoFocus
          value={draft}
          aria-label="Edit task title"
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commitTitle}
          onKeyDown={(e) => {
            if (e.key === "Enter") commitTitle();
            if (e.key === "Escape") {
              setDraft(task.title);
              setEditing(false);
            }
          }}
          onClick={(e) => e.stopPropagation()}
          className="min-w-0 flex-1 rounded border border-accent/50 bg-surface px-1 outline-none"
        />
      ) : (
        <span
          onDoubleClick={(e) => {
            e.stopPropagation();
            if (!inTrash) setEditing(true);
          }}
          className={`min-w-0 flex-1 truncate transition-all duration-300 ${
            done || completing ? "text-text-muted line-through" : ""
          }`}
        >
          {task.title}
        </span>
      )}

      {task.pinned && (
        <span aria-label="Pinned" title="Pinned" className="text-xs text-accent">
          📌
        </span>
      )}
      {task.rrule && (
        <span
          aria-label="Repeats"
          title={describeRrule(task.rrule) ?? "Repeats"}
          className="text-xs text-text-muted"
        >
          ↻
        </span>
      )}
      {rowTags.map((tag) => (
        <span
          key={tag.id}
          className="rounded-full px-1.5 py-0.5 text-[10px]"
          style={{ backgroundColor: `${tag.color ?? "#78786c"}22`, color: tag.color ?? undefined }}
        >
          {tag.name}
        </span>
      ))}
      {chip && (
        <span className={`text-xs ${chip.overdue ? "text-destructive" : "text-text-muted"}`}>
          {chip.text}
        </span>
      )}

      {inTrash && (
        <span className="flex gap-1 opacity-0 group-hover:opacity-100">
          <button
            type="button"
            className="rounded-full px-1.5 py-0.5 text-xs text-accent hover:bg-accent/10"
            onClick={(e) => {
              e.stopPropagation();
              restoreTask.mutate(task.id);
            }}
          >
            Restore
          </button>
          <button
            type="button"
            className="rounded-full px-1.5 py-0.5 text-xs text-destructive hover:bg-destructive/10"
            onClick={(e) => {
              e.stopPropagation();
              deleteTaskForever.mutate(task.id);
            }}
          >
            Delete forever
          </button>
        </span>
      )}
    </div>
  );
}
