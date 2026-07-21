import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { useDroppable } from "@dnd-kit/core";
import { DropdownMenu } from "radix-ui";
import type { Section, Tag, Task } from "../../../lib/api";
import { useTaskMutations } from "../../tasks/hooks/useTasks";
import { useSections } from "../hooks/useSections";
import { KanbanCard } from "./KanbanCard";

/** `null` section = the fixed "No Section" column (droppable id "none"). */
interface Props {
  projectId: string;
  section: Section | null;
  tasks: Task[];
  tags: Tag[];
  collapsed: boolean;
  onToggleCollapse(): void;
  childCount(taskId: string): { total: number; done: number };
}

export function KanbanColumn({
  projectId,
  section,
  tasks,
  tags,
  collapsed,
  onToggleCollapse,
  childCount,
}: Props) {
  const dropId = section?.id ?? "none";
  const { setNodeRef, isOver } = useDroppable({ id: dropId });
  const { renameSection, deleteSection, moveTaskToSection } = useSections(projectId);
  const { createTask } = useTaskMutations();
  const [draft, setDraft] = useState("");
  const [renaming, setRenaming] = useState(false);
  const [renameDraft, setRenameDraft] = useState(section?.name ?? "");

  const addCard = async () => {
    const title = draft.trim();
    if (!title) return;
    setDraft("");
    const task = await createTask.mutateAsync({ projectId, title });
    if (section) moveTaskToSection.mutate({ taskId: task.id, sectionId: section.id });
  };

  return (
    <section
      aria-label={`Column ${section?.name ?? "No Section"}`}
      className="flex max-h-full w-72 shrink-0 flex-col rounded-lg bg-surface"
    >
      <header className="flex items-center gap-1 px-3 py-2">
        <button
          type="button"
          aria-label={collapsed ? "Expand column" : "Collapse column"}
          onClick={onToggleCollapse}
          className="flex items-center text-text-muted hover:text-text"
        >
          {collapsed ? <ChevronRight size={15} strokeWidth={2} /> : <ChevronDown size={15} strokeWidth={2} />}
        </button>
        {renaming && section ? (
          <input
            autoFocus
            value={renameDraft}
            aria-label="Rename column"
            onChange={(e) => setRenameDraft(e.target.value)}
            onBlur={() => {
              setRenaming(false);
              const name = renameDraft.trim();
              if (name && name !== section.name) renameSection.mutate({ id: section.id, name });
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") (e.target as HTMLInputElement).blur();
              if (e.key === "Escape") setRenaming(false);
            }}
            className="min-w-0 flex-1 rounded border border-accent/50 bg-bg px-1 text-sm outline-none"
          />
        ) : (
          <h3 className="min-w-0 flex-1 truncate text-sm font-semibold">
            {section?.name ?? "No Section"}
          </h3>
        )}
        <span className="rounded bg-bg px-1.5 text-xs text-text-muted" aria-label="Card count">
          {tasks.length}
        </span>
        {section && (
          <DropdownMenu.Root>
            <DropdownMenu.Trigger asChild>
              <button
                type="button"
                aria-label={`Column ${section.name} menu`}
                className="text-text-muted hover:text-text"
              >
                ⋯
              </button>
            </DropdownMenu.Trigger>
            <DropdownMenu.Portal>
              <DropdownMenu.Content
                sideOffset={6}
                className="z-50 min-w-32 rounded-md border border-border bg-surface p-1 text-sm shadow-lg"
              >
                <DropdownMenu.Item
                  className="cursor-pointer rounded px-2 py-1 outline-none hover:bg-bg data-[highlighted]:bg-bg"
                  onSelect={() => {
                    setRenameDraft(section.name);
                    setRenaming(true);
                  }}
                >
                  Rename
                </DropdownMenu.Item>
                <DropdownMenu.Item
                  className="cursor-pointer rounded px-2 py-1 text-destructive outline-none hover:bg-bg data-[highlighted]:bg-bg"
                  onSelect={() => deleteSection.mutate(section.id)}
                >
                  Delete column
                </DropdownMenu.Item>
              </DropdownMenu.Content>
            </DropdownMenu.Portal>
          </DropdownMenu.Root>
        )}
      </header>

      {!collapsed && (
        <>
          <div
            ref={setNodeRef}
            className={`flex min-h-16 flex-1 flex-col gap-2 overflow-y-auto px-2 pb-2 ${
              isOver ? "rounded-md bg-accent/5 ring-1 ring-accent/30" : ""
            }`}
          >
            {tasks.map((task) => {
              const c = childCount(task.id);
              return (
                <KanbanCard
                  key={task.id}
                  task={task}
                  tags={tags}
                  subtaskTotal={c.total}
                  subtaskDone={c.done}
                />
              );
            })}
          </div>
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void addCard();
            }}
            placeholder="+ Add task"
            aria-label={`Add task to ${section?.name ?? "No Section"}`}
            className="mx-2 mb-2 rounded bg-transparent px-1 py-1 text-sm outline-none placeholder:text-text-muted"
          />
        </>
      )}
    </section>
  );
}
