import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, type NewTask, type Priority, type Task, type TaskPatch } from "../../../lib/api";
import { viewKey, type ViewSelection } from "../../../lib/uiStore";

export function useViewTasks(view: ViewSelection) {
  return useQuery({
    queryKey: ["tasks", viewKey(view)],
    queryFn: () => {
      switch (view.kind) {
        case "project":
          return api.listProjectTasks(view.projectId);
        case "tag":
          return api.listTagTasks(view.tagId);
        case "smart":
          return api.listSmart(view.view);
      }
    },
  });
}

export function useSmartCounts() {
  return useQuery({
    queryKey: ["smartCounts"],
    queryFn: api.smartCounts,
    refetchInterval: 60_000,
  });
}

export function useTaskMutations() {
  const queryClient = useQueryClient();
  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ["tasks"] });
    void queryClient.invalidateQueries({ queryKey: ["smartCounts"] });
  };

  const createTask = useMutation({
    mutationFn: (input: NewTask) => api.createTask(input),
    onSuccess: invalidate,
  });
  const updateTask = useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: TaskPatch }) => api.updateTask(id, patch),
    onSuccess: invalidate,
  });
  const completeTask = useMutation({
    mutationFn: (id: string) => api.completeTask(id),
    onSuccess: invalidate,
  });
  const reopenTask = useMutation({
    mutationFn: (id: string) => api.reopenTask(id),
    onSuccess: invalidate,
  });
  const trashTask = useMutation({
    mutationFn: (id: string) => api.trashTask(id),
    onSuccess: invalidate,
  });
  const restoreTask = useMutation({
    mutationFn: (id: string) => api.restoreTask(id),
    onSuccess: invalidate,
  });
  const deleteTaskForever = useMutation({
    mutationFn: (id: string) => api.deleteTaskForever(id),
    onSuccess: invalidate,
  });
  const moveTask = useMutation({
    mutationFn: ({ id, projectId }: { id: string; projectId: string }) =>
      api.moveTask(id, projectId),
    onSuccess: invalidate,
  });
  const reorderTask = useMutation({
    mutationFn: ({ id, afterId }: { id: string; afterId: string | null }) =>
      api.reorderTask(id, afterId),
    onSuccess: invalidate,
  });

  return {
    createTask,
    updateTask,
    completeTask,
    reopenTask,
    trashTask,
    restoreTask,
    deleteTaskForever,
    moveTask,
    reorderTask,
  };
}

/** Batch operations over a multi-selection. */
export function useBatchMutations() {
  const queryClient = useQueryClient();
  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ["tasks"] });
    void queryClient.invalidateQueries({ queryKey: ["smartCounts"] });
  };

  return useMutation({
    mutationFn: async ({
      ids,
      action,
    }: {
      ids: string[];
      action:
        | { kind: "move"; projectId: string }
        | { kind: "priority"; priority: Priority }
        | { kind: "due"; dueAt: string | null }
        | { kind: "tag"; tagId: string }
        | { kind: "trash" };
    }) => {
      for (const id of ids) {
        switch (action.kind) {
          case "move":
            await api.moveTask(id, action.projectId);
            break;
          case "priority":
            await api.updateTask(id, { priority: action.priority });
            break;
          case "due":
            await api.updateTask(id, { dueAt: action.dueAt });
            break;
          case "tag":
            await api.assignTag(id, action.tagId);
            break;
          case "trash":
            await api.trashTask(id);
            break;
        }
      }
    },
    onSuccess: invalidate,
  });
}

/** Assemble the parent/child hierarchy into a flat, depth-annotated list. */
export interface TreeRow {
  task: Task;
  depth: number;
}

export function flattenTree(tasks: Task[]): TreeRow[] {
  const byParent = new Map<string | null, Task[]>();
  const ids = new Set(tasks.map((t) => t.id));
  for (const task of tasks) {
    // Treat a parent outside this view as absent so the child still renders.
    const parent = task.parentId !== null && ids.has(task.parentId) ? task.parentId : null;
    const bucket = byParent.get(parent) ?? [];
    bucket.push(task);
    byParent.set(parent, bucket);
  }
  const out: TreeRow[] = [];
  const walk = (parent: string | null, depth: number) => {
    for (const task of byParent.get(parent) ?? []) {
      out.push({ task, depth });
      walk(task.id, depth + 1);
    }
  };
  walk(null, 0);
  return out;
}
