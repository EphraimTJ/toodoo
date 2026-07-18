import { useState } from "react";
import { useUiStore } from "../../../lib/uiStore";
import { flattenTree, useViewTasks } from "../../tasks/hooks/useTasks";
import { TaskRow } from "../../tasks/components/TaskRow";
import { useTags } from "../../tags/hooks/useTags";
import { useFilters } from "../hooks/useFilters";
import { FilterBuilder } from "./FilterBuilder";

/** Read-only smart list produced by a saved filter. Rows behave like list rows
 *  (select, complete) but a filter is not a place to add or reorder tasks. */
export function FilterResultsView({ filterId }: { filterId: string }) {
  const { query, deleteFilter } = useFilters();
  const filter = (query.data ?? []).find((f) => f.id === filterId);
  const { data: tasks } = useViewTasks({ kind: "filter", filterId });
  const { data: tags } = useTags();
  const setView = useUiStore((s) => s.setView);
  const [editing, setEditing] = useState(false);

  const rows = flattenTree(tasks ?? []);

  return (
    <div className="flex h-full min-w-0 flex-1 flex-col">
      <header className="flex items-center justify-between border-b border-border px-4 py-2.5">
        <h2 className="flex items-center gap-2 text-base font-semibold">
          {filter?.color && (
            <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: filter.color }} />
          )}
          {filter?.name ?? "Filter"}
        </h2>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setEditing((v) => !v)}
            className="rounded-md px-2 py-1 text-xs text-text-muted hover:bg-surface"
          >
            Edit
          </button>
          <button
            type="button"
            aria-label="Delete filter"
            onClick={() => {
              if (filter) {
                deleteFilter.mutate(filter.id);
                setView({ kind: "project", projectId: "inbox" });
              }
            }}
            className="rounded-md px-2 py-1 text-xs text-text-muted hover:text-red-500"
          >
            🗑
          </button>
        </div>
      </header>

      {editing && filter && (
        <div className="border-b border-border p-3">
          <FilterBuilder filter={filter} onClose={() => setEditing(false)} />
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-2">
        {rows.map((row) => (
          <TaskRow
            key={row.task.id}
            task={row.task}
            depth={0}
            tags={tags ?? []}
            draggable={false}
            inTrash={false}
          />
        ))}
        {rows.length === 0 && (
          <div className="flex h-40 items-center justify-center text-sm text-text-muted">
            No tasks match this filter.
          </div>
        )}
      </div>
    </div>
  );
}
