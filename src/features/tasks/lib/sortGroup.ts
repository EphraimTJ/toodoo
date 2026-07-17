import { format, isToday, isTomorrow, isYesterday, parseISO, startOfDay } from "date-fns";
import type { Project, Tag, Task } from "../../../lib/api";
import { flattenTree, type TreeRow } from "../hooks/useTasks";
import type { GroupMode, SortMode } from "../hooks/useViewOptions";

const PRIORITY_LABEL: Record<number, string> = {
  5: "High",
  3: "Medium",
  1: "Low",
  0: "No priority",
};

export function comparator(sort: SortMode, tagsById: Map<string, Tag>) {
  const bySort = (a: Task, b: Task): number => {
    switch (sort) {
      case "custom":
        return (a.sortOrder ?? 0) - (b.sortOrder ?? 0);
      case "date": {
        const da = a.dueAt ?? a.startAt ?? "9999";
        const db = b.dueAt ?? b.startAt ?? "9999";
        return da.localeCompare(db);
      }
      case "priority":
        return b.priority - a.priority;
      case "title":
        return a.title.localeCompare(b.title, undefined, { sensitivity: "base" });
      case "tag": {
        const ta = a.tagIds.map((id) => tagsById.get(id)?.name ?? "").sort()[0] ?? "￿";
        const tb = b.tagIds.map((id) => tagsById.get(id)?.name ?? "").sort()[0] ?? "￿";
        return ta.localeCompare(tb);
      }
    }
  };
  // Pinned tasks float above their siblings regardless of the chosen sort.
  return (a: Task, b: Task): number => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
    return bySort(a, b);
  };
}

function dateGroupLabel(task: Task): string {
  const iso = task.dueAt ?? task.startAt;
  if (!iso) return "No date";
  const date = parseISO(iso);
  if (startOfDay(date) < startOfDay(new Date()) && !isToday(date)) return "Overdue";
  if (isToday(date)) return "Today";
  if (isTomorrow(date)) return "Tomorrow";
  return format(date, "MMM d, EEE");
}

function groupLabel(
  task: Task,
  group: GroupMode,
  tagsById: Map<string, Tag>,
  projectsById: Map<string, Project>,
): string {
  switch (group) {
    case "none":
      return "";
    case "date":
      return dateGroupLabel(task);
    case "priority":
      return PRIORITY_LABEL[task.priority] ?? "No priority";
    case "tag": {
      const names = task.tagIds.map((id) => tagsById.get(id)?.name).filter(Boolean) as string[];
      return names.sort()[0] ?? "No tag";
    }
    case "list":
      return projectsById.get(task.projectId)?.name ?? "Unknown list";
  }
}

export interface TaskGroup {
  label: string;
  rows: TreeRow[];
}

/**
 * Sort + flatten + group the ACTIVE tasks of a view. Sorting orders siblings
 * (children always follow their parent); grouping is decided by the top-level
 * task of each subtree so subtrees never split across groups.
 */
export function organizeTasks(
  tasks: Task[],
  sort: SortMode,
  group: GroupMode,
  tags: Tag[],
  projects: Project[],
): TaskGroup[] {
  const tagsById = new Map(tags.map((t) => [t.id, t]));
  const projectsById = new Map(projects.map((p) => [p.id, p]));
  const sorted = [...tasks].sort(comparator(sort, tagsById));
  const rows = flattenTree(sorted);

  if (group === "none") return [{ label: "", rows }];

  const groups = new Map<string, TreeRow[]>();
  let currentLabel = "";
  for (const row of rows) {
    if (row.depth === 0) currentLabel = groupLabel(row.task, group, tagsById, projectsById);
    const bucket = groups.get(currentLabel) ?? [];
    bucket.push(row);
    groups.set(currentLabel, bucket);
  }
  return [...groups.entries()].map(([label, rows]) => ({ label, rows }));
}

/** Header label for completed-by-date browsing in the Completed view. */
export function completedDateLabel(task: Task): string {
  if (!task.completedAt) return "Earlier";
  const date = parseISO(task.completedAt);
  if (isToday(date)) return "Today";
  if (isYesterday(date)) return "Yesterday";
  return format(date, "MMM d, yyyy");
}

export function dueChip(task: Task): { text: string; overdue: boolean } | null {
  const iso = task.dueAt ?? task.startAt;
  if (!iso) return null;
  const date = parseISO(iso);
  const now = new Date();
  // Timed tasks compare by the actual instant; all-day by calendar day.
  const overdue =
    task.status === "ACTIVE" && (task.isAllDay ? startOfDay(date) < startOfDay(now) : date < now);
  // Show the time for timed tasks (e.g. "Today 7:40 PM"), date only for all-day.
  const time = task.isAllDay ? "" : ` ${format(date, "h:mm a")}`;
  if (isToday(date)) return { text: `Today${time}`, overdue };
  if (isTomorrow(date)) return { text: `Tomorrow${time}`, overdue };
  return { text: `${format(date, "MMM d")}${time}`, overdue };
}
