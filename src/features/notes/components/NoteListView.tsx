import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../../../lib/api";
import { useUiStore } from "../../../lib/uiStore";
import { useProjects } from "../../projects/hooks/useProjects";
import { useTaskMutations } from "../../tasks/hooks/useTasks";

/** A NOTE-kind project: its items are notes (rich text, no checkbox/date),
 *  opened in the shared detail pane. */
export function NoteListView({ projectId }: { projectId: string }) {
  const { data: tasks } = useQuery({
    queryKey: ["tasks", `project:${projectId}`],
    queryFn: () => api.listProjectTasks(projectId),
  });
  const { data: projects } = useProjects();
  const { createTask } = useTaskMutations();
  const { selectedTaskId, selectTask } = useUiStore();
  const [draft, setDraft] = useState("");

  const project = (projects ?? []).find((p) => p.id === projectId);
  const notes = (tasks ?? []).filter((t) => t.kind === "NOTE" && t.status !== "TRASHED");

  const add = () => {
    const title = draft.trim();
    if (!title) return;
    setDraft("");
    createTask.mutate(
      { projectId, title, kind: "NOTE" },
      { onSuccess: (note) => selectTask(note.id) },
    );
  };

  return (
    <div className="flex h-full min-w-0 flex-1 flex-col">
      <header className="flex items-center gap-2 border-b border-border px-4 py-2.5">
        <h2 className="text-base font-semibold">{project?.name ?? "Notes"}</h2>
        <span className="rounded bg-surface px-1.5 text-xs text-text-muted">Note list</span>
      </header>

      <div className="px-4 pb-2 pt-3">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") add();
          }}
          placeholder="+ New note, press Enter"
          aria-label="New note"
          className="w-full rounded-md border border-border bg-surface px-3 py-1.5 text-sm outline-none placeholder:text-text-muted focus:border-accent"
        />
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-4">
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {notes.map((note) => (
            <button
              key={note.id}
              type="button"
              data-testid="note-card"
              onClick={() => selectTask(note.id)}
              className={`flex h-32 flex-col rounded-lg border border-border bg-surface p-3 text-left hover:border-accent ${
                selectedTaskId === note.id ? "ring-1 ring-accent/40" : ""
              }`}
            >
              <span className="font-medium">{note.title}</span>
              <span className="mt-1 line-clamp-4 overflow-hidden text-xs text-text-muted">
                {note.contentPlain ?? ""}
              </span>
            </button>
          ))}
        </div>
        {notes.length === 0 && (
          <div className="flex h-40 items-center justify-center text-sm text-text-muted">
            No notes yet — add one above.
          </div>
        )}
      </div>
    </div>
  );
}
