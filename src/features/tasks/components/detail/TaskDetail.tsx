import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { DropdownMenu, Popover } from "radix-ui";
import { ArrowUp, Flag, Pin, Trash2, X } from "lucide-react";
import { format, parseISO } from "date-fns";
import { api, type Priority, type Task } from "../../../../lib/api";
import { allDayToLocal } from "../../../../lib/date";
import { downloadText } from "../../../../lib/download";
import { openPopout } from "../../../../lib/popout";
import { toast } from "../../../../lib/toast";
import { taskToMarkdown, taskToText } from "../../../share/lib/shareText";
import { downloadTaskImage } from "../../../share/lib/shareImage";
import { useUiStore } from "../../../../lib/uiStore";
import { confirmDialog, promptDialog } from "../../../../components/ui/AppDialogs";
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

const menuItem =
  "flex cursor-pointer select-none items-center rounded-md px-2 py-1.5 text-sm outline-none hover:bg-bg data-[highlighted]:bg-bg";

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
              className="ml-auto flex items-center text-text-muted opacity-0 hover:text-accent group-hover:opacity-100"
              onClick={() => void promote(item.id)}
            >
              <ArrowUp size={13} strokeWidth={1.75} />
            </button>
            <button
              type="button"
              aria-label={`Delete ${item.title}`}
              className="flex items-center text-text-muted opacity-0 hover:text-destructive group-hover:opacity-100"
              onClick={() => void api.deleteCheckItem(item.id)}
            >
              <X size={12} strokeWidth={2} />
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
            className="flex items-center opacity-60 hover:opacity-100"
          >
            <X size={11} strokeWidth={2} />
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
  const wontDo = task.status === "WONT_DO";
  const closed = done || wontDo;
  const trashed = task.status === "TRASHED";
  const priority = PRIORITIES.find(([p]) => p === task.priority) ?? PRIORITIES[3];

  return (
    <div className="flex h-full flex-col" data-testid="task-detail">
      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        <div className="flex items-start gap-2.5">
          <input
            type="checkbox"
            checked={closed}
            disabled={trashed}
            aria-label={closed ? "Reopen task" : "Complete task"}
            onChange={(e) =>
              e.target.checked ? completeTask.mutate(task) : reopenTask.mutate(task.id)
            }
            className="mt-2 h-4 w-4 accent-(--color-accent)"
          />
          <textarea
            key={task.id}
            defaultValue={task.title}
            aria-label="Task title"
            rows={1}
            onBlur={(e) => {
              const title = e.target.value.trim();
              if (title && title !== task.title) updateTask.mutate({ id: task.id, patch: { title } });
            }}
            className={`w-full resize-none bg-transparent pt-1 text-lg font-semibold leading-snug outline-none ${
              closed ? "text-text-muted line-through" : ""
            }`}
          />
          <button
            type="button"
            aria-label={task.pinned ? "Unpin task" : "Pin task"}
            aria-pressed={task.pinned}
            disabled={trashed}
            onClick={() => setPinned.mutate({ id: task.id, pinned: !task.pinned })}
            className={`mt-1 flex shrink-0 items-center rounded-full border p-1.5 ${
              task.pinned ? "border-accent text-accent" : "border-border text-text-muted hover:text-text"
            }`}
          >
            <Pin size={14} strokeWidth={1.75} />
          </button>
        </div>

        {/* Properties — a tidy chip row rather than one cramped line. */}
        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          <DatePicker
            label="Start"
            value={task.startAt}
            allDay={task.isAllDay}
            onChange={(startAt) => updateTask.mutate({ id: task.id, patch: { startAt } })}
          />
          <DatePicker
            label="Due"
            value={task.dueAt}
            allDay={task.isAllDay}
            onChange={(dueAt) => updateTask.mutate({ id: task.id, patch: { dueAt } })}
          />
          <DropdownMenu.Root>
            <DropdownMenu.Trigger asChild>
              <button
                type="button"
                className={`flex items-center gap-1 rounded-full border border-border px-2.5 py-1 text-xs ${priority[2]}`}
              >
                <Flag size={12} strokeWidth={1.75} /> {priority[1]}
              </button>
            </DropdownMenu.Trigger>
            <DropdownMenu.Portal>
              <DropdownMenu.Content
                sideOffset={6}
                className="z-50 min-w-28 rounded-xl border border-border bg-surface p-1 text-sm shadow-float"
              >
                {PRIORITIES.map(([value, label, cls]) => (
                  <DropdownMenu.Item
                    key={value}
                    className={`flex cursor-pointer select-none items-center gap-1.5 rounded-md px-2 py-1 outline-none hover:bg-bg data-[highlighted]:bg-bg ${cls}`}
                    onSelect={() => updateTask.mutate({ id: task.id, patch: { priority: value } })}
                  >
                    <Flag size={12} strokeWidth={1.75} /> {label}
                  </DropdownMenu.Item>
                ))}
              </DropdownMenu.Content>
            </DropdownMenu.Portal>
          </DropdownMenu.Root>
          <RepeatPicker task={task} />
          <label
            className="flex items-center gap-1 rounded-full border border-border px-2.5 py-1 text-xs text-text-muted"
            title="All-day vs. timed"
          >
            <input
              type="checkbox"
              aria-label="All day"
              checked={task.isAllDay}
              onChange={(e) => {
                const toAllDay = e.target.checked;
                // Convert existing dates so toggling doesn't shift the day: a
                // timed instant → that calendar date at UTC-midnight, and an
                // all-day date → that day at 9am local.
                const conv = (iso: string | null): string | null => {
                  if (!iso) return null;
                  if (toAllDay) return `${format(parseISO(iso), "yyyy-MM-dd")}T00:00:00.000Z`;
                  const d = allDayToLocal(iso);
                  d.setHours(9, 0, 0, 0);
                  return d.toISOString();
                };
                updateTask.mutate({
                  id: task.id,
                  patch: { isAllDay: toAllDay, dueAt: conv(task.dueAt), startAt: conv(task.startAt) },
                });
              }}
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
                className="w-14 rounded-full border border-border bg-bg px-2 py-0.5 outline-none focus:border-accent"
              />
              min
            </label>
          )}
        </div>

        <TagPicker task={task} />
      <DescriptionEditor task={task} />
      <Reminders task={task} />
      <CheckItems task={task} />
      <Subtasks task={task} />
      <TaskFocusInfo task={task} />
      <Comments task={task} />
      <ActivityLog task={task} />

      </div>

      {/* Pinned footer: essential status actions stay visible; the rest fold
          into a single "More" menu instead of a nine-button pile. */}
      <footer className="flex shrink-0 items-center gap-1 border-t border-border/70 px-3 py-2">
        <DropdownMenu.Root>
          <DropdownMenu.Trigger asChild>
            <button
              type="button"
              aria-label="More actions"
              className="rounded-full border border-border px-3 py-1 text-xs text-text-muted hover:text-text"
            >
              ⋯ More
            </button>
          </DropdownMenu.Trigger>
          <DropdownMenu.Portal>
            <DropdownMenu.Content
              sideOffset={6}
              align="start"
              className="z-50 min-w-44 rounded-xl border border-border bg-surface p-1 text-sm shadow-float"
            >
              <DropdownMenu.Item
                className={menuItem}
                onSelect={() => {
                  const toNote = task.kind !== "NOTE";
                  void api.setTaskKind(task.id, toNote ? "NOTE" : "TASK").then(() => {
                    void queryClient.invalidateQueries({ queryKey: ["tasks"] });
                    void queryClient.invalidateQueries({ queryKey: ["tasks", "detail", task.id] });
                    toast(toNote ? "Converted to note" : "Converted to task");
                  });
                }}
              >
                {task.kind === "NOTE" ? "Convert to task" : "Convert to note"}
              </DropdownMenu.Item>
              <DropdownMenu.Item
                className={menuItem}
                onSelect={() =>
                  void api
                    .stickyFromTask(task.id)
                    .then(async (id) => {
                      await openPopout({ kind: "sticky", id });
                      void queryClient.invalidateQueries({ queryKey: ["stickies"] });
                      toast("Popped out as sticky");
                    })
                    .catch(() => toast("Couldn’t create the sticky"))
                }
              >
                Pop out as sticky
              </DropdownMenu.Item>
              <DropdownMenu.Item
                className={menuItem}
                onSelect={() => void copyLink(task.id).then(() => toast("Link copied"))}
              >
                Copy link
              </DropdownMenu.Item>
              <DropdownMenu.Item
                className={menuItem}
                onSelect={() =>
                  void navigator.clipboard
                    .writeText(taskToText(task))
                    .then(() => toast("Copied to clipboard"))
                    .catch(() => toast("Clipboard unavailable"))
                }
              >
                Copy as text
              </DropdownMenu.Item>
              <DropdownMenu.Item
                className={menuItem}
                onSelect={() => {
                  downloadText(`${task.title || "task"}.md`, taskToMarkdown(task), "text/markdown");
                  toast("Markdown downloaded");
                }}
              >
                Download markdown
              </DropdownMenu.Item>
              <DropdownMenu.Item
                className={menuItem}
                onSelect={() =>
                  void downloadTaskImage(task)
                    .then(() => toast("Image downloaded"))
                    .catch(() => toast("Couldn’t render the image"))
                }
              >
                Download image
              </DropdownMenu.Item>
              <DropdownMenu.Separator className="my-1 h-px bg-border" />
              <DropdownMenu.Item
                className={menuItem}
                onSelect={() =>
                  void api.duplicateTask(task.id).then(() => {
                    void queryClient.invalidateQueries({ queryKey: ["tasks"] });
                    toast("Task duplicated");
                  })
                }
              >
                Duplicate
              </DropdownMenu.Item>
              <DropdownMenu.Item
                className={menuItem}
                onSelect={() => {
                  void promptDialog({
                    title: "Save as template",
                    label: "Template name",
                    defaultValue: task.title,
                  }).then((name) => {
                    if (name?.trim())
                      void api.saveTaskAsTemplate(task.id, name.trim()).then(() => {
                        void queryClient.invalidateQueries({ queryKey: ["templates"] });
                        toast("Saved as template");
                      });
                  });
                }}
              >
                Save as template
              </DropdownMenu.Item>
              {task.parentId && (
                <DropdownMenu.Item
                  className={menuItem}
                  onSelect={() => {
                    const lossy =
                      (task.tagIds?.length ?? 0) > 0 ||
                      task.priority !== 0 ||
                      task.dueAt !== null ||
                      task.startAt !== null;
                    const proceed = lossy
                      ? confirmDialog({
                          title: "Convert to check item?",
                          message:
                            "This drops its tags, priority, dates, and any subtasks. Continue?",
                          confirmText: "Convert",
                          destructive: true,
                        })
                      : Promise.resolve(true);
                    void proceed.then((ok) => {
                      if (!ok) return;
                      void api.subtaskToCheckItem(task.id).then(() => {
                        selectTask(null);
                        void queryClient.invalidateQueries({ queryKey: ["tasks"] });
                        void queryClient.invalidateQueries({ queryKey: ["checkItems"] });
                      });
                    });
                  }}
                >
                  Convert to check item
                </DropdownMenu.Item>
              )}
            </DropdownMenu.Content>
          </DropdownMenu.Portal>
        </DropdownMenu.Root>

        <div className="ml-auto flex items-center gap-1">
          {!closed && !trashed && (
            <button
              type="button"
              aria-label="Mark won't do"
              className="rounded-full border border-border px-3 py-1 text-xs text-text-muted hover:text-text"
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
          {wontDo && !trashed && (
            <button
              type="button"
              aria-label="Reopen task"
              className="rounded-full border border-border px-3 py-1 text-xs text-accent hover:bg-accent/10"
              onClick={() => reopenTask.mutate(task.id)}
            >
              Reopen
            </button>
          )}
          {trashed ? (
            <button
              type="button"
              className="rounded-full border border-border px-3 py-1 text-xs text-accent hover:bg-accent/10"
              onClick={() => restoreTask.mutate(task.id)}
            >
              Restore
            </button>
          ) : (
            <button
              type="button"
              aria-label="Move task to trash"
              className="flex items-center gap-1 rounded-full border border-border px-3 py-1 text-xs text-text-muted hover:text-destructive"
              onClick={() => {
                trashTask.mutate(task.id);
                selectTask(null);
              }}
            >
              <Trash2 size={12} strokeWidth={1.75} /> Trash
            </button>
          )}
        </div>
      </footer>

      {copiedLink && (
        <p className="px-3 pb-2 text-xs text-text-muted" aria-live="polite" data-testid="task-link">
          Copied <code>{copiedLink}</code>
        </p>
      )}
    </div>
  );
}
