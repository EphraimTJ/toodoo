import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { DndContext, PointerSensor, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { api, type Task } from "../../../lib/api";
import { useTags } from "../../tags/hooks/useTags";
import { useSections } from "../hooks/useSections";
import { KanbanColumn } from "./KanbanColumn";

/** Kanban board for a project: a fixed "No Section" column followed by the
 *  project's sections. Top-level ACTIVE tasks show as cards; dragging a card
 *  into a column reassigns its section. */
export function KanbanBoard({ projectId }: { projectId: string }) {
  const { data: tasks } = useQuery({
    queryKey: ["tasks", `project:${projectId}`],
    queryFn: () => api.listProjectTasks(projectId),
  });
  const { data: tags } = useTags();
  const { query: sectionsQuery, createSection, moveTaskToSection } = useSections(projectId);
  const sections = sectionsQuery.data ?? [];

  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(new Set());
  const [newColumn, setNewColumn] = useState("");

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const { cards, childCount } = useMemo(() => {
    const all = tasks ?? [];
    const childrenByParent = new Map<string, Task[]>();
    for (const t of all) {
      if (t.parentId) {
        const bucket = childrenByParent.get(t.parentId) ?? [];
        bucket.push(t);
        childrenByParent.set(t.parentId, bucket);
      }
    }
    const cards = all.filter((t) => t.parentId === null && t.status === "ACTIVE");
    const childCount = (taskId: string) => {
      const kids = childrenByParent.get(taskId) ?? [];
      return { total: kids.length, done: kids.filter((k) => k.status === "COMPLETED").length };
    };
    return { cards, childCount };
  }, [tasks]);

  const bySection = (sectionId: string | null) =>
    cards.filter((t) => (t.sectionId ?? null) === sectionId);

  const onDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over) return;
    const taskId = String(active.id);
    const target = String(over.id);
    const sectionId = target === "none" ? null : target;
    const current = cards.find((t) => t.id === taskId)?.sectionId ?? null;
    if (current === sectionId) return;
    moveTaskToSection.mutate({ taskId, sectionId });
  };

  const toggle = (id: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const addColumn = () => {
    const name = newColumn.trim();
    if (!name) return;
    setNewColumn("");
    createSection.mutate(name);
  };

  return (
    <div className="flex h-full min-h-0 flex-1 gap-3 overflow-x-auto p-3" data-testid="kanban-board">
      <KanbanColumn
        projectId={projectId}
        section={null}
        tasks={bySection(null)}
        tags={tags ?? []}
        collapsed={collapsed.has("none")}
        onToggleCollapse={() => toggle("none")}
        childCount={childCount}
      />
      <DndContext sensors={sensors} onDragEnd={onDragEnd}>
        <div className="flex gap-3">
          {sections.map((section) => (
            <KanbanColumn
              key={section.id}
              projectId={projectId}
              section={section}
              tasks={bySection(section.id)}
              tags={tags ?? []}
              collapsed={collapsed.has(section.id)}
              onToggleCollapse={() => toggle(section.id)}
              childCount={childCount}
            />
          ))}
        </div>
      </DndContext>

      <div className="w-56 shrink-0">
        <input
          value={newColumn}
          onChange={(e) => setNewColumn(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") addColumn();
          }}
          placeholder="+ Add column"
          aria-label="Add column"
          className="w-full rounded-lg border border-dashed border-border bg-transparent px-3 py-2 text-sm outline-none placeholder:text-text-muted hover:border-accent"
        />
      </div>
    </div>
  );
}
