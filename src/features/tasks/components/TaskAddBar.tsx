import { useState } from "react";
import { INBOX_ID } from "../../../lib/api";
import { useUiStore } from "../../../lib/uiStore";
import { useTaskMutations } from "../hooks/useTasks";
import { localDateParams } from "../../../lib/api";

/** Where a task created from the current view should land, and with what date. */
function creationDefaults(view: ReturnType<typeof useUiStore.getState>["view"]): {
  projectId: string;
  dueAt?: string;
} {
  const { today } = localDateParams();
  if (view.kind === "project") return { projectId: view.projectId };
  switch (view.view) {
    case "today":
      return { projectId: INBOX_ID, dueAt: `${today}T00:00:00.000Z` };
    case "tomorrow": {
      const d = new Date();
      d.setDate(d.getDate() + 1);
      return { projectId: INBOX_ID, dueAt: `${localDateParams(d).today}T00:00:00.000Z` };
    }
    default:
      return { projectId: INBOX_ID };
  }
}

export function TaskAddBar() {
  const view = useUiStore((s) => s.view);
  const { createTask } = useTaskMutations();
  const [title, setTitle] = useState("");

  const submit = () => {
    const trimmed = title.trim();
    if (!trimmed) return;
    const { projectId, dueAt } = creationDefaults(view);
    createTask.mutate({ projectId, title: trimmed, dueAt, isAllDay: true });
    setTitle("");
  };

  return (
    <div className="px-4 pb-2 pt-3">
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") submit();
        }}
        placeholder="+ Add task, press Enter"
        aria-label="Add task"
        className="w-full rounded-md border border-border bg-surface px-3 py-1.5 text-sm outline-none placeholder:text-text-muted focus:border-accent"
      />
    </div>
  );
}
