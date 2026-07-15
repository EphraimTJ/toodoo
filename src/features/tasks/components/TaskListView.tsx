import { useMemo, useRef, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { DndContext, PointerSensor, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { DropdownMenu } from "radix-ui";
import type { SmartView } from "../../../lib/api";
import { useUiStore, type ViewSelection } from "../../../lib/uiStore";
import { useProjects } from "../../projects/hooks/useProjects";
import { useTags } from "../../tags/hooks/useTags";
import { flattenTree, useTaskMutations, useViewTasks, type TreeRow } from "../hooks/useTasks";
import { useViewOptions, type GroupMode, type SortMode } from "../hooks/useViewOptions";
import { completedDateLabel, organizeTasks } from "../lib/sortGroup";
import { BatchToolbar } from "./BatchToolbar";
import { TaskAddBar } from "./TaskAddBar";
import { TaskRow } from "./TaskRow";
import { ViewModeToggle } from "./ViewModeToggle";

const SMART_TITLES: Record<SmartView, string> = {
  today: "Today",
  tomorrow: "Tomorrow",
  next7Days: "Next 7 Days",
  all: "All",
  completed: "Completed",
  trash: "Trash",
};

const SORT_OPTIONS: [SortMode, string][] = [
  ["custom", "Custom"],
  ["date", "Date"],
  ["priority", "Priority"],
  ["title", "Title"],
  ["tag", "Tag"],
];

type RenderItem =
  | { kind: "group"; label: string }
  | { kind: "task"; row: TreeRow }
  | { kind: "completedHeader"; count: number };

const menuItem =
  "flex w-full cursor-pointer select-none items-center justify-between rounded px-2 py-1 text-left outline-none hover:bg-bg data-[highlighted]:bg-bg";

export function TaskListView({ view }: { view: ViewSelection }) {
  const { data: tasks } = useViewTasks(view);
  const { data: projects } = useProjects();
  const { data: tags } = useTags();
  const { options, setOptions } = useViewOptions(view);
  const { reorderTask } = useTaskMutations();
  const clearMultiSelect = useUiStore((s) => s.clearMultiSelect);
  const [completedOpen, setCompletedOpen] = useState(!options.completedCollapsed);

  const isTrash = view.kind === "smart" && view.view === "trash";
  const isCompletedView = view.kind === "smart" && view.view === "completed";
  const flatView = isTrash || isCompletedView;

  const groupChoices: [GroupMode, string][] =
    view.kind !== "project"
      ? [
          ["none", "None"],
          ["date", "Date"],
          ["priority", "Priority"],
          ["tag", "Tag"],
          ["list", "List"],
        ]
      : [
          ["none", "None"],
          ["date", "Date"],
          ["priority", "Priority"],
          ["tag", "Tag"],
        ];

  const title =
    view.kind === "smart"
      ? SMART_TITLES[view.view]
      : view.kind === "tag"
        ? `#${(tags ?? []).find((t) => t.id === view.tagId)?.name ?? "…"}`
        : view.kind === "project"
          ? ((projects ?? []).find((p) => p.id === view.projectId)?.name ?? "…")
          : "";

  const dragEnabled =
    view.kind === "project" && options.sort === "custom" && options.group === "none";

  const { items, activeIds } = useMemo(() => {
    const all = tasks ?? [];
    const out: RenderItem[] = [];
    let ids: string[] = [];

    if (isCompletedView) {
      // Completed-by-date browsing: headers per completion day, newest first
      // (the backend already orders by completed_at DESC).
      let currentLabel = "";
      for (const row of flattenTree(all)) {
        const label = completedDateLabel(row.task);
        if (row.depth === 0 && label !== currentLabel) {
          currentLabel = label;
          out.push({ kind: "group", label });
        }
        out.push({ kind: "task", row });
      }
    } else if (flatView) {
      for (const row of flattenTree(all)) out.push({ kind: "task", row });
    } else {
      const active = all.filter((t) => t.status === "ACTIVE");
      const completed = all.filter((t) => t.status === "COMPLETED");
      const groups = organizeTasks(active, options.sort, options.group, tags ?? [], projects ?? []);
      for (const group of groups) {
        if (group.label) out.push({ kind: "group", label: group.label });
        for (const row of group.rows) out.push({ kind: "task", row });
      }
      ids = groups.flatMap((g) => g.rows.map((r) => r.task.id));
      if (options.showCompleted && completed.length > 0) {
        out.push({ kind: "completedHeader", count: completed.length });
        if (completedOpen) {
          for (const row of flattenTree(completed)) out.push({ kind: "task", row });
        }
      }
    }
    return { items: out, activeIds: ids };
  }, [tasks, options, tags, projects, completedOpen, flatView, isCompletedView]);

  const scrollRef = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line react-hooks/incompatible-library -- virtualizer identity is managed by TanStack Virtual itself
  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 36,
    overscan: 12,
    // Used until the ResizeObserver reports a real rect (and in jsdom tests,
    // where it never does).
    initialRect: { width: 800, height: 600 },
  });

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));
  const onDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const from = activeIds.indexOf(String(active.id));
    const to = activeIds.indexOf(String(over.id));
    if (from < 0 || to < 0) return;
    // Dropping below the original position means "after the target";
    // above means "after the item preceding the target".
    const afterId = from < to ? String(over.id) : (activeIds[to - 1] ?? null);
    reorderTask.mutate({ id: String(active.id), afterId });
  };

  const list = (
    <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto px-3 pb-16">
      <div style={{ height: virtualizer.getTotalSize(), position: "relative" }}>
        {virtualizer.getVirtualItems().map((virtualRow) => {
          const item = items[virtualRow.index];
          return (
            <div
              key={virtualRow.key}
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                width: "100%",
                transform: `translateY(${virtualRow.start}px)`,
              }}
            >
              {item.kind === "group" && (
                <div className="flex h-9 items-end pb-1 pl-2 text-xs font-semibold uppercase tracking-wide text-text-muted">
                  {item.label}
                </div>
              )}
              {item.kind === "completedHeader" && (
                <button
                  type="button"
                  onClick={() => {
                    const next = !completedOpen;
                    setCompletedOpen(next);
                    setOptions({ completedCollapsed: !next });
                  }}
                  className="flex h-9 w-full items-end pb-1 pl-2 text-xs font-semibold uppercase tracking-wide text-text-muted hover:text-text"
                >
                  {completedOpen ? "▾" : "▸"}&nbsp;Completed ({item.count})
                </button>
              )}
              {item.kind === "task" && (
                <TaskRow
                  task={item.row.task}
                  depth={item.row.depth}
                  tags={tags ?? []}
                  draggable={dragEnabled && item.row.task.status === "ACTIVE"}
                  inTrash={isTrash}
                />
              )}
            </div>
          );
        })}
      </div>
      {items.length === 0 && (
        <div className="flex h-40 items-center justify-center text-sm text-text-muted">
          {isTrash ? "Trash is empty." : "No tasks here — add one above."}
        </div>
      )}
    </div>
  );

  return (
    <div className="relative flex h-full min-w-0 flex-1 flex-col" onClick={clearMultiSelect}>
      <header className="flex items-center justify-between border-b border-border px-4 py-2.5">
        <h2 className="text-base font-semibold">{title}</h2>
        {!flatView && (
          <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
            {view.kind === "project" &&
              (() => {
                const project = (projects ?? []).find((p) => p.id === view.projectId);
                return project ? <ViewModeToggle project={project} /> : null;
              })()}
            <DropdownMenu.Root>
              <DropdownMenu.Trigger asChild>
                <button
                  type="button"
                  className="rounded-md px-2 py-1 text-xs text-text-muted hover:bg-surface"
                >
                  Sort: {SORT_OPTIONS.find(([m]) => m === options.sort)?.[1]}
                </button>
              </DropdownMenu.Trigger>
              <DropdownMenu.Portal>
                <DropdownMenu.Content
                  sideOffset={6}
                  className="z-50 min-w-36 rounded-md border border-border bg-surface p-1 text-sm shadow-lg"
                >
                  {SORT_OPTIONS.map(([mode, label]) => (
                    <DropdownMenu.Item
                      key={mode}
                      className={menuItem}
                      onSelect={() => setOptions({ sort: mode })}
                    >
                      {label} {options.sort === mode && "✓"}
                    </DropdownMenu.Item>
                  ))}
                </DropdownMenu.Content>
              </DropdownMenu.Portal>
            </DropdownMenu.Root>

            <DropdownMenu.Root>
              <DropdownMenu.Trigger asChild>
                <button
                  type="button"
                  className="rounded-md px-2 py-1 text-xs text-text-muted hover:bg-surface"
                >
                  Group: {groupChoices.find(([m]) => m === options.group)?.[1] ?? "None"}
                </button>
              </DropdownMenu.Trigger>
              <DropdownMenu.Portal>
                <DropdownMenu.Content
                  sideOffset={6}
                  className="z-50 min-w-36 rounded-md border border-border bg-surface p-1 text-sm shadow-lg"
                >
                  {groupChoices.map(([mode, label]) => (
                    <DropdownMenu.Item
                      key={mode}
                      className={menuItem}
                      onSelect={() => setOptions({ group: mode })}
                    >
                      {label} {options.group === mode && "✓"}
                    </DropdownMenu.Item>
                  ))}
                  <DropdownMenu.Separator className="my-1 h-px bg-border" />
                  <DropdownMenu.Item
                    className={menuItem}
                    onSelect={() => setOptions({ showCompleted: !options.showCompleted })}
                  >
                    Show completed {options.showCompleted && "✓"}
                  </DropdownMenu.Item>
                </DropdownMenu.Content>
              </DropdownMenu.Portal>
            </DropdownMenu.Root>
          </div>
        )}
      </header>

      {!flatView && <TaskAddBar />}

      <DndContext sensors={sensors} onDragEnd={onDragEnd}>
        <SortableContext items={activeIds} strategy={verticalListSortingStrategy}>
          {list}
        </SortableContext>
      </DndContext>

      <BatchToolbar />
    </div>
  );
}
