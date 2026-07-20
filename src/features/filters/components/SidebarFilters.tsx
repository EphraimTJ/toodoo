import { useState } from "react";
import { Popover } from "radix-ui";
import { useUiStore } from "../../../lib/uiStore";
import { useFilters } from "../hooks/useFilters";
import { FilterBuilder } from "./FilterBuilder";

export function SidebarFilters() {
  const { query } = useFilters();
  const filters = query.data ?? [];
  const { view, setView } = useUiStore();
  const [creating, setCreating] = useState(false);

  return (
    <div className="mt-4">
      <div className="flex items-center justify-between px-2 py-1">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-text-muted">Filters</h2>
        <Popover.Root open={creating} onOpenChange={setCreating}>
          <Popover.Trigger asChild>
            <button
              type="button"
              aria-label="New filter"
              className="text-text-muted hover:text-accent"
            >
              +
            </button>
          </Popover.Trigger>
          <Popover.Portal>
            <Popover.Content
              side="right"
              align="start"
              sideOffset={8}
              className="z-50 w-80"
            >
              <FilterBuilder
                onClose={() => setCreating(false)}
                onSaved={(id) => setView({ kind: "filter", filterId: id })}
              />
            </Popover.Content>
          </Popover.Portal>
        </Popover.Root>
      </div>

      <ul>
        {filters.map((filter) => {
          const active = view.kind === "filter" && view.filterId === filter.id;
          return (
            <li key={filter.id}>
              <button
                type="button"
                onClick={() => setView({ kind: "filter", filterId: filter.id })}
                className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-bg ${
                  active ? "bg-bg font-medium text-accent" : ""
                }`}
              >
                <span
                  className="h-2 w-2 shrink-0 rounded-full"
                  style={{ backgroundColor: filter.color ?? "#78786c" }}
                />
                <span className="truncate">{filter.name}</span>
              </button>
            </li>
          );
        })}
        {filters.length === 0 && (
          <li className="px-2 py-1 text-xs text-text-muted">No filters yet.</li>
        )}
      </ul>
    </div>
  );
}
