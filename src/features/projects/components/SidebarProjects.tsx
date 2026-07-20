import { useState } from "react";
import { DndContext, PointerSensor, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Dialog, DropdownMenu } from "radix-ui";
import { INBOX_ID, type Folder, type Project } from "../../../lib/api";
import { useUiStore } from "../../../lib/uiStore";
import { useFolders, useProjectMutations, useProjects } from "../hooks/useProjects";
import { promptDialog } from "../../../components/ui/AppDialogs";

const PROJECT_COLORS = ["#5d7052", "#a85448", "#b0763f", "#4f6f52", "#a8586b", "#78786c"];
const PROJECT_ICONS = ["📋", "🏠", "💼", "🛒", "🎯", "📚", "💪", "✈️", "🎨"];

const menuItem =
  "flex w-full cursor-pointer select-none rounded px-2 py-1 text-left text-sm outline-none hover:bg-bg data-[highlighted]:bg-bg";

function ProjectRow({ project }: { project: Project }) {
  const { view, setView } = useUiStore();
  const { updateProject, deleteProject } = useProjectMutations();
  const [renaming, setRenaming] = useState(false);
  const [draft, setDraft] = useState(project.name);
  const isInbox = project.id === INBOX_ID;

  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: project.id,
    disabled: isInbox,
  });

  const active = view.kind === "project" && view.projectId === project.id;

  const commitRename = () => {
    setRenaming(false);
    const name = draft.trim();
    if (name && name !== project.name) updateProject.mutate({ id: project.id, patch: { name } });
    else setDraft(project.name);
  };

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`group flex items-center ${isDragging ? "opacity-40" : ""}`}
    >
      {renaming ? (
        <input
          autoFocus
          value={draft}
          aria-label="Rename list"
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commitRename}
          onKeyDown={(e) => {
            if (e.key === "Enter") commitRename();
            if (e.key === "Escape") {
              setDraft(project.name);
              setRenaming(false);
            }
          }}
          className="mx-2 w-full rounded border border-accent/50 bg-surface px-1 py-1 text-sm outline-none"
        />
      ) : (
        <button
          type="button"
          onClick={() => setView({ kind: "project", projectId: project.id })}
          className={`flex min-w-0 flex-1 items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-bg ${
            active ? "bg-bg font-medium text-accent" : ""
          }`}
          {...attributes}
          {...listeners}
        >
          <span
            className="h-2 w-2 shrink-0 rounded-full"
            style={{ backgroundColor: project.color ?? "var(--color-border)" }}
          />
          <span className="truncate">
            {project.icon ? `${project.icon} ` : ""}
            {project.name}
          </span>
        </button>
      )}

      <DropdownMenu.Root>
        <DropdownMenu.Trigger asChild>
          <button
            type="button"
            aria-label={`Options for ${project.name}`}
            className="mr-1 rounded px-1 text-text-muted opacity-0 hover:bg-bg group-hover:opacity-100"
          >
            ⋯
          </button>
        </DropdownMenu.Trigger>
        <DropdownMenu.Portal>
          <DropdownMenu.Content
            sideOffset={4}
            className="z-50 min-w-40 rounded-md border border-border bg-surface p-1 shadow-lg"
          >
            {!isInbox && (
              <DropdownMenu.Item className={menuItem} onSelect={() => setRenaming(true)}>
                Rename
              </DropdownMenu.Item>
            )}
            <DropdownMenu.Sub>
              <DropdownMenu.SubTrigger className={menuItem}>Color</DropdownMenu.SubTrigger>
              <DropdownMenu.Portal>
                <DropdownMenu.SubContent className="z-50 flex gap-1 rounded-md border border-border bg-surface p-2 shadow-lg">
                  {PROJECT_COLORS.map((color) => (
                    <DropdownMenu.Item
                      key={color}
                      aria-label={`Set color ${color}`}
                      className="h-5 w-5 cursor-pointer rounded-full outline-none ring-accent data-[highlighted]:ring-2"
                      style={{ backgroundColor: color }}
                      onSelect={() => updateProject.mutate({ id: project.id, patch: { color } })}
                    />
                  ))}
                </DropdownMenu.SubContent>
              </DropdownMenu.Portal>
            </DropdownMenu.Sub>
            <DropdownMenu.Sub>
              <DropdownMenu.SubTrigger className={menuItem}>Icon</DropdownMenu.SubTrigger>
              <DropdownMenu.Portal>
                <DropdownMenu.SubContent className="z-50 grid w-40 grid-cols-5 gap-1 rounded-md border border-border bg-surface p-2 shadow-lg">
                  {PROJECT_ICONS.map((icon) => (
                    <DropdownMenu.Item
                      key={icon}
                      aria-label={`Set icon ${icon}`}
                      className="flex h-6 w-6 cursor-pointer items-center justify-center rounded outline-none hover:bg-bg data-[highlighted]:bg-bg"
                      onSelect={() => updateProject.mutate({ id: project.id, patch: { icon } })}
                    >
                      {icon}
                    </DropdownMenu.Item>
                  ))}
                  <DropdownMenu.Item
                    aria-label="Remove icon"
                    className="flex h-6 w-6 cursor-pointer items-center justify-center rounded text-xs text-text-muted outline-none hover:bg-bg data-[highlighted]:bg-bg"
                    onSelect={() => updateProject.mutate({ id: project.id, patch: { icon: null } })}
                  >
                    ✕
                  </DropdownMenu.Item>
                </DropdownMenu.SubContent>
              </DropdownMenu.Portal>
            </DropdownMenu.Sub>
            {!isInbox && (
              <DropdownMenu.Item
                className={`${menuItem} text-destructive`}
                onSelect={() => deleteProject.mutate(project.id)}
              >
                Delete
              </DropdownMenu.Item>
            )}
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>
    </div>
  );
}

function FolderGroup({ folder, projects }: { folder: Folder; projects: Project[] }) {
  const [open, setOpen] = useState(true);
  const { deleteFolder } = useProjectMutations();

  return (
    <div>
      <div className="group flex items-center">
        <button
          type="button"
          onClick={() => setOpen(!open)}
          className="flex min-w-0 flex-1 items-center gap-1 rounded-md px-2 py-1 text-left text-xs font-semibold uppercase tracking-wide text-text-muted hover:bg-bg"
        >
          {open ? "▾" : "▸"} {folder.name}
        </button>
        <button
          type="button"
          aria-label={`Delete folder ${folder.name}`}
          className="mr-1 rounded px-1 text-text-muted opacity-0 hover:bg-bg group-hover:opacity-100"
          onClick={() => deleteFolder.mutate(folder.id)}
        >
          ✕
        </button>
      </div>
      {open && projects.map((p) => <ProjectRow key={p.id} project={p} />)}
    </div>
  );
}

export function SidebarProjects() {
  const { data: projects } = useProjects();
  const { data: folders } = useFolders();
  const { createProject, createFolder, reorderProject } = useProjectMutations();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newColor, setNewColor] = useState<string | undefined>(undefined);
  const [newKind, setNewKind] = useState<"TASK" | "NOTE">("TASK");

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));
  const rootProjects = (projects ?? []).filter((p) => p.folderId === null && p.id !== INBOX_ID);
  const rootIds = rootProjects.map((p) => p.id);

  const onDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const from = rootIds.indexOf(String(active.id));
    const to = rootIds.indexOf(String(over.id));
    if (from < 0 || to < 0) return;
    const afterId = from < to ? String(over.id) : (rootIds[to - 1] ?? null);
    reorderProject.mutate({ id: String(active.id), afterId });
  };

  const submitNew = () => {
    const name = newName.trim();
    if (!name) return;
    createProject.mutate({ name, color: newColor, kind: newKind });
    setNewName("");
    setNewColor(undefined);
    setNewKind("TASK");
    setDialogOpen(false);
  };

  return (
    <div className="mt-4">
      <div className="flex items-center justify-between px-2">
        <h2 className="text-xs font-medium uppercase tracking-wide text-text-muted">Lists</h2>
        <div className="flex gap-0.5">
          <button
            type="button"
            aria-label="New folder"
            title="New folder"
            className="rounded px-1 text-xs text-text-muted hover:bg-bg"
            onClick={() => {
              void promptDialog({ title: "New folder", label: "Folder name", placeholder: "e.g. Work" }).then(
                (name) => {
                  if (name?.trim()) createFolder.mutate(name.trim());
                },
              );
            }}
          >
            🗀
          </button>
          <Dialog.Root open={dialogOpen} onOpenChange={setDialogOpen}>
            <Dialog.Trigger asChild>
              <button
                type="button"
                aria-label="New list"
                title="New list"
                className="rounded px-1.5 text-sm text-text-muted hover:bg-bg"
              >
                +
              </button>
            </Dialog.Trigger>
            <Dialog.Portal>
              <Dialog.Overlay className="fixed inset-0 z-40 bg-black/40" />
              <Dialog.Content className="fixed left-1/2 top-1/3 z-50 w-80 -translate-x-1/2 rounded-lg border border-border bg-surface p-4 shadow-xl">
                <Dialog.Title className="text-sm font-semibold">New list</Dialog.Title>
                <input
                  autoFocus
                  value={newName}
                  aria-label="List name"
                  onChange={(e) => setNewName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") submitNew();
                  }}
                  placeholder="List name"
                  className="mt-3 w-full rounded-md border border-border bg-bg px-3 py-1.5 text-sm outline-none focus:border-accent"
                />
                <div className="mt-3 flex gap-2">
                  {PROJECT_COLORS.map((color) => (
                    <button
                      key={color}
                      type="button"
                      aria-label={`Color ${color}`}
                      onClick={() => setNewColor(color)}
                      className={`h-5 w-5 rounded-full ${newColor === color ? "ring-2 ring-accent ring-offset-2 ring-offset-surface" : ""}`}
                      style={{ backgroundColor: color }}
                    />
                  ))}
                </div>
                <div className="mt-3 flex gap-1 rounded-md border border-border p-0.5 text-xs" role="group" aria-label="List type">
                  {(["TASK", "NOTE"] as const).map((k) => (
                    <button
                      key={k}
                      type="button"
                      aria-pressed={newKind === k}
                      onClick={() => setNewKind(k)}
                      className={`flex-1 rounded px-2 py-1 ${newKind === k ? "bg-accent text-accent-fg" : "text-text-muted"}`}
                    >
                      {k === "TASK" ? "Task list" : "Note list"}
                    </button>
                  ))}
                </div>
                <div className="mt-4 flex justify-end gap-2">
                  <Dialog.Close asChild>
                    <button
                      type="button"
                      className="rounded-md px-3 py-1 text-sm text-text-muted hover:bg-bg"
                    >
                      Cancel
                    </button>
                  </Dialog.Close>
                  <button
                    type="button"
                    onClick={submitNew}
                    className="rounded-md bg-accent px-3 py-1 text-sm text-accent-fg hover:opacity-90"
                  >
                    Create
                  </button>
                </div>
              </Dialog.Content>
            </Dialog.Portal>
          </Dialog.Root>
        </div>
      </div>

      <DndContext sensors={sensors} onDragEnd={onDragEnd}>
        <SortableContext items={rootIds} strategy={verticalListSortingStrategy}>
          {rootProjects.map((p) => (
            <ProjectRow key={p.id} project={p} />
          ))}
          {(folders ?? []).map((folder) => (
            <FolderGroup
              key={folder.id}
              folder={folder}
              projects={(projects ?? []).filter((p) => p.folderId === folder.id)}
            />
          ))}
        </SortableContext>
      </DndContext>
    </div>
  );
}
