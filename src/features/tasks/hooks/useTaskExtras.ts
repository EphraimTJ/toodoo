import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, type ReminderKind } from "../../../lib/api";

/** Reminders for a task, with add/snooze/delete mutations. */
export function useReminders(taskId: string) {
  const queryClient = useQueryClient();
  const invalidate = () =>
    void queryClient.invalidateQueries({ queryKey: ["reminders", taskId] });

  const query = useQuery({
    queryKey: ["reminders", taskId],
    queryFn: () => api.listReminders(taskId),
  });

  const addReminder = useMutation({
    mutationFn: (input: { triggerKind: ReminderKind; at?: string | null; offsetMin?: number | null }) =>
      api.addReminder(taskId, input.triggerKind, { at: input.at, offsetMin: input.offsetMin }),
    onSuccess: invalidate,
  });
  const snoozeReminder = useMutation({
    mutationFn: ({ id, until }: { id: string; until: string }) => api.snoozeReminder(id, until),
    onSuccess: invalidate,
  });
  const deleteReminder = useMutation({
    mutationFn: (id: string) => api.deleteReminder(id),
    onSuccess: invalidate,
  });

  return { query, addReminder, snoozeReminder, deleteReminder };
}

/** Activity history (created / edited / completed …) for a task. */
export function useActivity(taskId: string) {
  return useQuery({
    queryKey: ["activity", taskId],
    queryFn: () => api.listActivity("task", taskId),
  });
}
