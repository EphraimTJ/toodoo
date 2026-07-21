import { useQueryClient } from "@tanstack/react-query";
import { api, type Priority } from "../../../lib/api";
import { allDayToLocal } from "../../../lib/date";
import type { ParsedQuickAdd } from "../lib/parse";

export interface QuickAddDefaults {
  projectId: string;
  dueAt?: string;
  tagId?: string; // e.g. the current tag view — always applied
}

/**
 * Turn a parsed quick-add into a task: resolve the list (match by name, else keep
 * `~name` literal in the title), create the task, then get-or-create + assign
 * tags. Returns a submit function.
 */
export function useQuickAdd() {
  const queryClient = useQueryClient();

  return async (parsed: ParsedQuickAdd, defaults: QuickAddDefaults): Promise<void> => {
    let projectId = defaults.projectId;
    let title = parsed.title;

    if (parsed.listName) {
      const projects = await api.listProjects();
      const match = projects.find((p) => p.name.toLowerCase() === parsed.listName!.toLowerCase());
      if (match) projectId = match.id;
      // No matching list: keep the ~name as literal title text (no silent create).
      else title = `${title} ~${parsed.listName}`.trim();
    }

    const task = await api.createTask({
      projectId,
      title,
      dueAt: parsed.dueAt ?? defaults.dueAt,
      isAllDay: parsed.dueAt ? parsed.isAllDay : true,
      priority: parsed.priority !== null ? (parsed.priority as Priority) : undefined,
      rrule: parsed.rrule ?? undefined,
      repeatFrom: parsed.rrule ? "DUE" : undefined,
    });

    // "remind me …" → add a reminder at the due time (on-time for a timed due,
    // 9am local on the day for an all-day due). No due date → no reminder.
    const due = parsed.dueAt ?? defaults.dueAt;
    if (parsed.remind && due) {
      if (parsed.dueAt && !parsed.isAllDay) {
        await api.addReminder(task.id, "REL", { offsetMin: 0 });
      } else {
        const at = allDayToLocal(due);
        at.setHours(9, 0, 0, 0);
        await api.addReminder(task.id, "ABS", { at: at.toISOString() });
      }
    }

    const tagNames = [...parsed.tags];
    if (tagNames.length > 0 || defaults.tagId) {
      const existing = await api.listTags();
      for (const name of tagNames) {
        const found = existing.find((t) => t.name.toLowerCase() === name.toLowerCase());
        const tag = found ?? (await api.createTag(name));
        await api.assignTag(task.id, tag.id);
      }
      if (defaults.tagId) await api.assignTag(task.id, defaults.tagId);
      void queryClient.invalidateQueries({ queryKey: ["tags"] });
    }

    void queryClient.invalidateQueries({ queryKey: ["tasks"] });
    void queryClient.invalidateQueries({ queryKey: ["smartCounts"] });
    void queryClient.invalidateQueries({ queryKey: ["search"] });
  };
}
