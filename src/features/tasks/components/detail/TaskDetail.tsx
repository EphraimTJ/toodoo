import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { DropdownMenu, Popover } from "radix-ui";
import { api, type Priority, type Task } from "../../../../lib/api";
import { downloadText } from "../../../../lib/download";
import { taskToMarkdown, taskToText } from "../../../share/lib/shareText";
import { downloadTaskImage } from "../../../share/lib/shareImage";
import { useUiStore } from "../../../../lib/uiStore";
import { useTags, useTagMutations } from "../../../tags/hooks/useTags";
import { useTaskMutations } from "../../hooks/useTasks";
import { TaskFocusInfo } from "../../../focus/components/TaskFocusInfo";
import { ActivityLog } from "./ActivityLog";
import { Comments } from "./Comments";
import { DatePicker } from "./DatePicker";
import { DescriptionEditor } from "./DescriptionEditor";
import { Reminders } from "./Reminders";
import { RepeatPicker } from "./RepeatPicker";

const PRIORITIES: [Priority, string, string][] = [
  [5, "High", "text-destructive"],
  [3, "Medium", "text-secondary"],
  [1, "Low", "text-accent"],
  [0, "None", "text-text-muted"],
];

function CheckItems({ task }: { task: Task }) {
  const queryClient = useQueryClient();
  const { data: items } = useQuery({
    queryKey: ["checkItems", task.id],
    queryFn: () => api.listCheckItems(task.id),
  });
  const [draft, setDraft] = useState("");
  const promote = async (itemId: string) => {
    await api.checkItemToSubtask(itemId);
    void queryClient.invalidateQueries({ queryKey: ["checkItems", task.id] });
    void queryClient.invalidateQueries({ queryKey: ["tasks"] });
  };
  const add = async () => {
    const title = draft.trim();
    if (!title) return;
    setDraft("");
    await api.addCheckItem(task.id, title);
  };

  return (
    <section className="mt-4">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-text-muted">Check items</h3>
      <ul className="mt-1">
        {(items ?? []).map((item) => (
          <li key={item.id} className="group flex items-center gap-2 py-0.5 text-sm">
            <input
              type="checkbox"
              checked={item.done}
              aria-label={item.title}
              onChange={(e) => void api.setCheckItem(item.id, { done: e.target.checked })}
              className="h-3.5 w-3.5 accent-(--color-accent)"
            />
            <span className={item.done ? "text-text-muted line-through" : ""}>{item.title}</span>
            <button
              type="button"
              aria-label={`Convert ${item.title} to subtask`}
              title="Promote to subtask"
              className="ml-auto text-xs text-text-muted opacity-0 hover:text-accent group-hover:opacity-100"
              onClick={() => void promote(item.id)}
            >
              ↥
            </button>
            <button
              type="button"
              aria-label={`Delete ${item.title}`}
              className="text-xs text-text-muted opacity-0 hover:text-destructive group-hover:opacity-100"
              onClick={() => void api.deleteCheckItem(item.id)}
            >
              ✕
            </button>
          </li>
        ))}
      </ul>
      <input
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") void add();
        }}
        placeholder="+ Add check item"
        aria-label="Add check item"
        className="mt-1 w-full bg-transparent py-1 text-sm outline-none placeholder:text-text-muted"
      />
    </section>
  );
}

function Subtasks({ task }: { task: Task }) {
  const { data: siblings } = useQuery({
    queryKey: ["tasks", `project:${task.projectId}`],
    queryFn: () => api.listProjectTasks(task.projectId),
  });
  const { createTask, completeTask, reopenTask } = useTaskMutations();
  const selectTask = useUiStore((s) => s.selectTask);
  const [draft, setDraft] = useState("");

  const children = (siblings ?? []).filter((t) => t.parentId === task.id);
  const add = () => {
    const title = draft.trim();
    if (!title) return;
    createTask.mutate({ projectId: task.projectId, parentId: task.id, title });
    setDraft("");
  };

  return (
    <section className="mt-4">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-text-muted">Subtasks</h3>
      <ul className="mt-1">
        {children.map((child) => (
          <li key={child.id} className="flex items-center gap-2 py-0.5 text-sm">
            <input
              type="checkbox"
              checked={child.status === "COMPLETED"}
              aria-label={child.title}
              onChange={(e) =>
                e.target.checked ? completeTask.mutate(child) : reopenTask.mutate(child.id)
              }
              className="h-3.5 w-3.5 accent-(--color-accent)"
            />
            <button
              type="button"
              onClick={() => selectTask(child.id)}
              className={`truncate text-left hover:text-accent ${
                child.status === "COMPLETED" ? "text-text-muted line-through" : ""
              }`}
            >
              {child.title}
            </button>
          </li>
        ))}
      </ul>
      <input
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") add();
        }}
        placeholder="+ Add subtask"
        aria-label="Add subtask"
        className="mt-1 w-full bg-transparent py-1 text-sm outline-none placeholder:text-text-muted"
      />
    </section>
  );
}

const TAG_COLORS = ["#5d7052", "#a85448", "#b0763f", "#4f6f52", "#a8586b", "#78786c"];

function TagPicker({ task }: { task: Task }) {
  const { data: tags } = useTags();
  const { createTag, assignTag, unassignTag } = useTagMutations();
  const [draft, setDraft] = useState("");
  const [draftColor, setDraftColor] = useState(TAG_COLORS[0]);

  const assigned = (tags ?? []).filter((t) => task.tagIds.includes(t.id));
  const available = (tags ?? []).filter((t) => !task.tagIds.includes(t.id));

  return (
    <div className="mt-3 flex flex-wrap items-center gap-1">
      {assigned.map((tag) => (
        <span
          key={tag.id}
          className="flex items-center gap-1 rounded-full px-2 py-0.5 text-xs"
          style={{ backgroundColor: `${tag.color ?? "#78786c"}22`, color: tag.color ?? undefined }}
        >
          {tag.name}
          <button
            type="button"
            aria-label={`Remove tag ${tag.name}`}
            onClick={() => unassignTag.mutate({ taskId: task.id, tagId: tag.id })}
            className="opacity-60 hover:opacity-100"
          >
            ✕
          </button>
        </span>
      ))}
      <Popover.Root>
        <Popover.Trigger asChild>
          <button
            type="button"
            className="rounded-full border border-dashed border-border px-2 py-0.5 text-xs text-text-muted hover:border-accent hover:text-accent"
          >
            + Tag
          </button>
        </Popover.Trigger>
        <Popover.Portal>
          <Popover.Content
            sideOffset={6}
            className="z-50 w-56 rounded-md border border-border bg-surface p-2 shadow-lg"
          >
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && draft.trim()) {
                  createTag.mutate(
                    { name: draft.trim(), color: draftColor },
                    {
                      onSuccess: (tag) => assignTag.mutate({ taskId: task.id, tagId: tag.id }),
                    },
                  );
                  setDraft("");
                }
              }}
              placeholder="Search or create…"
              aria-label="Tag name"
              className="mb-1 w-full rounded border border-border bg-bg px-2 py-1 text-xs outline-none focus:border-accent"
            />
            <div className="mb-1 flex gap-1.5 px-0.5" aria-label="New tag color">
              {TAG_COLORS.map((color) => (
                <button
                  key={color}
                  type="button"
                  aria-label={`New tag color ${color}`}
                  onClick={() => setDraftColor(color)}
                  className={`h-4 w-4 rounded-full ${
                    draftColor === color
                      ? "ring-2 ring-accent ring-offset-1 ring-offset-surface"
                      : ""
                  }`}
                  style={{ backgroundColor: color }}
                />
              ))}
            </div>
            {available
              .filter((t) => t.name.toLowerCase().includes(draft.trim().toLowerCase()))
              .map((tag) => (
                <button
                  key={tag.id}
                  type="button"
                  onClick={() => assignTag.mutate({ taskId: task.id, tagId: tag.id })}
                  className="flex w-full items-center gap-2 rounded px-2 py-1 text-left text-xs hover:bg-bg"
                >
                  <span
                    className="h-2 w-2 rounded-full"
                    style={{ backgroundColor: tag.color ?? "#78786c" }}
                  />
                  {tag.name}
                </button>
              ))}
          </Popover.Content>
        </Popover.Portal>
      </Popover.Root>
    </div>
  );
}

export function TaskDetail() {
  const { selectedTaskId, selectTask } = useUiStore();
  const queryClient = useQueryClient();
  const { updateTask, trashTask, restoreTask, completeTask, reopenTask, setPinned } =
    useTaskMutations();
  const [copiedLink, setCopiedLink] = useState<string | null>(null);

  const copyLink = async (id: string) => {
    const link = await api.copyTaskLink(id);
    setCopiedLink(link);
    try {
      await navigator.clipboard.writeText(link);
    } catch {
      /* clipboard unavailable — the link is still shown for manual copy */
    }
  };

  const { data: task } = useQuery({
    queryKey: ["tasks", "detail", selectedTaskId],
    queryFn: () => api.getTask(selectedTaskId as string),
    enabled: selectedTaskId !== null,
  });

  if (!selectedTaskId || !task) {
    return (
      <div className="flex flex-1 items-center justify-center px-6 text-center text-sm text-text-muted">
        Select a task to see its details.
      </div>
    );
  }

  const done = task.status === "COMPLETED";
  const trashed = task.status === "TRASHED";
  const priority = PRIORITIES.find(([p]) => p === task.priority) ?? PRIORITIES[3];

  return (
    <div className="flex h-full flex-col overflow-y-auto p-4" data-testid="task-detail">
      <div className="flex items-center gap-2">
        <input
          type="checkbox"
          checked={done}
          disabled={trashed}
          aria-label={done ? "Reopen task" : "Complete task"}
          onChange={(e) =>
            e.target.checked ? completeTask.mutate(task) : reopenTask.mutate(task.id)
          }
          className="h-4 w-4 accent-(--color-accent)"
        />
        <DatePicker
          label="Start"
          value={task.startAt}
          onChange={(startAt) => updateTask.mutate({ id: task.id, patch: { startAt } })}
        />
        <DatePicker
          label="Due"
          value={task.dueAt}
          onChange={(dueAt) => updateTask.mutate({ id: task.id, patch: { dueAt } })}
        />
        <label className="flex items-center gap-1 text-xs text-text-muted" title="All-day vs. timed">
          <input
            type="checkbox"
            aria-label="All day"
            checked={task.isAllDay}
            onChange={(e) => updateTask.mutate({ id: task.id, patch: { isAllDay: e.target.checked } })}
            className="h-3.5 w-3.5 accent-(--color-accent)"
          />
          All day
        </label>
        {!task.isAllDay && (
          <label className="flex items-center gap-1 text-xs text-text-muted" title="Duration in minutes">
            <input
              type="number"
              min={0}
              step={5}
              aria-label="Duration minutes"
              value={task.durationMin ?? ""}
              placeholder="dur"
              onChange={(e) =>
                updateTask.mutate({
                  id: task.id,
                  patch: { durationMin: e.target.value === "" ? null : Math.max(0, Number(e.target.value)) },
                })
              }
              className="w-14 rounded border border-border bg-bg px-1 py-0.5 outline-none focus:border-accent"
            />
            min
          </label>
        )}
        <RepeatPicker task={task} />
        <button
          type="button"
          aria-label={task.pinned ? "Unpin task" : "Pin task"}
          aria-pressed={task.pinned}
          disabled={trashed}
          onClick={() => setPinned.mutate({ id: task.id, pinned: !task.pinned })}
          className={`ml-auto rounded-md border border-border px-2 py-1 text-xs ${
            task.pinned ? "border-accent text-accent" : "text-text-muted hover:text-text"
          }`}
        >
          📌
        </button>
        <DropdownMenu.Root>
          <DropdownMenu.Trigger asChild>
            <button
              type="button"
              className={`rounded-md border border-border px-2 py-1 text-xs ${priority[2]}`}
            >
              ⚑ {priority[1]}
            </button>
          </DropdownMenu.Trigger>
          <DropdownMenu.Portal>
            <DropdownMenu.Content
              sideOffset={6}
              className="z-50 min-w-28 rounded-md border border-border bg-surface p-1 text-sm shadow-lg"
            >
              {PRIORITIES.map(([value, label, cls]) => (
                <DropdownMenu.Item
                  key={value}
                  className={`flex cursor-pointer select-none rounded px-2 py-1 outline-none hover:bg-bg data-[highlighted]:bg-bg ${cls}`}
                  onSelect={() => updateTask.mutate({ id: task.id, patch: { priority: value } })}
                >
                  ⚑ {label}
                </DropdownMenu.Item>
              ))}
            </DropdownMenu.Content>
          </DropdownMenu.Portal>
        </DropdownMenu.Root>
      </div>

      <textarea
        key={task.id}
        defaultValue={task.title}
        aria-label="Task title"
        rows={1}
        onBlur={(e) => {
          const title = e.target.value.trim();
          if (title && title !== task.title) updateTask.mutate({ id: task.id, patch: { title } });
        }}
        className={`mt-3 w-full resize-none bg-transparent text-lg font-semibold outline-none ${
          done ? "text-text-muted line-through" : ""
        }`}
      />

      <TagPicker task={task} />
      <DescriptionEditor task={task} />
      <Reminders task={task} />
      <CheckItems task={task} />
      <Subtasks task={task} />
      <TaskFocusInfo task={task} />
      <Comments task={task} />
      <ActivityLog task={task} />

      <div className="mt-auto flex items-center gap-2 pt-4">
        <button
          type="button"
          className="rounded-md border border-border px-2 py-1 text-xs text-text-muted hover:text-text"
          onClick={() =>
            void api.setTaskKind(task.id, task.kind === "NOTE" ? "TASK" : "NOTE").then(() => {
              void queryClient.invalidateQueries({ queryKey: ["tasks"] });
            })
          }
        >
          {task.kind === "NOTE" ? "Convert to task" : "Convert to note"}
        </button>
        <button
          type="button"
          className="rounded-md border border-border px-2 py-1 text-xs text-text-muted hover:text-accent"
          onClick={() => void api.stickyFromTask(task.id)}
        >
          📌 Pop out
        </button>
        <button
          type="button"
          aria-label="Copy task link"
          className="rounded-md border border-border px-2 py-1 text-xs text-text-muted hover:text-accent"
          onClick={() => void copyLink(task.id)}
        >
          🔗 Copy link
        </button>
        <DropdownMenu.Root>
          <DropdownMenu.Trigger asChild>
            <button
              type="button"
              aria-label="Share task"
              className="rounded-md border border-border px-2 py-1 text-xs text-text-muted hover:text-accent"
            >
              ↗ Share
            </button>
          </DropdownMenu.Trigger>
          <DropdownMenu.Portal>
            <DropdownMenu.Content
              sideOffset={6}
              className="z-50 min-w-40 rounded-md border border-border bg-surface p-1 text-sm shadow-lg"
            >
              <DropdownMenu.Item
                className="cursor-pointer select-none rounded px-2 py-1 outline-none hover:bg-bg data-[highlighted]:bg-bg"
                onSelect={() => void navigator.clipboard.writeText(taskToText(task)).catch(() => {})}
              >
                Copy as text
              </DropdownMenu.Item>
              <DropdownMenu.Item
                className="cursor-pointer select-none rounded px-2 py-1 outline-none hover:bg-bg data-[highlighted]:bg-bg"
                onSelect={() => downloadText(`${task.title || "task"}.md`, taskToMarkdown(task), "text/markdown")}
              >
                Download markdown
              </DropdownMenu.Item>
              <DropdownMenu.Item
                className="cursor-pointer select-none rounded px-2 py-1 outline-none hover:bg-bg data-[highlighted]:bg-bg"
                onSelect={() => void downloadTaskImage(task)}
              >
                Download image
              </DropdownMenu.Item>
            </DropdownMenu.Content>
          </DropdownMenu.Portal>
        </DropdownMenu.Root>
        <button
          type="button"
          className="rounded-md border border-border px-2 py-1 text-xs text-text-muted hover:text-accent"
          onClick={() =>
            void api.duplicateTask(task.id).then(() => {
              void queryClient.invalidateQueries({ queryKey: ["tasks"] });
            })
          }
        >
          ⧉ Duplicate
        </button>
        <button
          type="button"
          className="rounded-md border border-border px-2 py-1 text-xs text-text-muted hover:text-accent"
          onClick={() => {
            const name = window.prompt("Template name", task.title);
            if (name?.trim())
              void api.saveTaskAsTemplate(task.id, name.trim()).then(() => {
                void queryClient.invalidateQueries({ queryKey: ["templates"] });
              });
          }}
        >
          ⧉ Save as template
        </button>
        {task.parentId && (
          <button
            type="button"
            className="rounded-md border border-border px-2 py-1 text-xs text-text-muted hover:text-accent"
            onClick={() => {
              const lossy =
                (task.tagIds?.length ?? 0) > 0 ||
                task.priority !== 0 ||
                task.dueAt !== null ||
                task.startAt !== null;
              if (lossy && !window.confirm("Converting to a check item drops its tags, priority, dates, and any subtasks. Continue?"))
                return;
              void api.subtaskToCheckItem(task.id).then(() => {
                selectTask(null);
                void queryClient.invalidateQueries({ queryKey: ["tasks"] });
                void queryClient.invalidateQueries({ queryKey: ["checkItems"] });
              });
            }}
          >
            ✓ To check item
          </button>
        )}
        <div className="ml-auto flex gap-2">
          {!done && !trashed && (
            <button
              type="button"
              aria-label="Mark won't do"
              className="rounded-md border border-border px-2 py-1 text-xs text-text-muted hover:text-text"
              onClick={() =>
                void api.setWontDo(task.id).then(() => {
                  void queryClient.invalidateQueries({ queryKey: ["tasks"] });
                  void queryClient.invalidateQueries({ queryKey: ["smartCounts"] });
                })
              }
            >
              Won't do
            </button>
          )}
          {trashed ? (
            <button
              type="button"
              className="rounded-md border border-border px-2 py-1 text-xs text-accent hover:bg-accent/10"
              onClick={() => restoreTask.mutate(task.id)}
            >
              Restore
            </button>
          ) : (
            <button
              type="button"
              aria-label="Move task to trash"
              className="rounded-md border border-border px-2 py-1 text-xs text-text-muted hover:text-destructive"
              onClick={() => {
                trashTask.mutate(task.id);
                selectTask(null);
              }}
            >
              🗑 Trash
            </button>
          )}
        </div>
      </div>

      {copiedLink && (
        <p className="pt-2 text-xs text-text-muted" aria-live="polite" data-testid="task-link">
          Copied <code>{copiedLink}</code>
        </p>
      )}
    </div>
  );
}
