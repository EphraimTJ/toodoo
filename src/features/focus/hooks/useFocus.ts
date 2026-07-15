import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, type FocusKind } from "../../../lib/api";

export function useFocusMutations() {
  const queryClient = useQueryClient();
  const invalidate = () => void queryClient.invalidateQueries({ queryKey: ["focus"] });

  const startFocus = useMutation({
    mutationFn: (v: { taskId: string | null; kind: FocusKind; plannedMin?: number }) =>
      api.startFocus(v.taskId, v.kind, v.plannedMin),
    onSuccess: invalidate,
  });
  const completeFocus = useMutation({
    mutationFn: (v: { id: string; pauseMs: number; note: string | null; status: string }) =>
      api.completeFocus(v.id, v.pauseMs, v.note, v.status),
    onSuccess: invalidate,
  });
  const addSession = useMutation({
    mutationFn: (v: {
      taskId: string | null;
      kind: FocusKind;
      startedAt: string;
      endedAt: string;
      note?: string;
    }) => api.addFocusSession(v.taskId, v.kind, v.startedAt, v.endedAt, v.note),
    onSuccess: invalidate,
  });
  const updateSession = useMutation({
    mutationFn: (v: { id: string; patch: { startedAt?: string; endedAt?: string; note?: string } }) =>
      api.updateFocusSession(v.id, v.patch),
    onSuccess: invalidate,
  });
  const deleteSession = useMutation({
    mutationFn: (id: string) => api.deleteFocusSession(id),
    onSuccess: invalidate,
  });

  return { startFocus, completeFocus, addSession, updateSession, deleteSession };
}

export function useFocusSessions(from: string, to: string) {
  return useQuery({ queryKey: ["focus", "sessions", from, to], queryFn: () => api.listFocusSessions(from, to) });
}

export function useFocusStats(from: string, to: string) {
  return useQuery({ queryKey: ["focus", "stats", from, to], queryFn: () => api.focusStats(from, to) });
}

export function useTaskActuals(taskId: string) {
  return useQuery({ queryKey: ["focus", "actuals", taskId], queryFn: () => api.taskFocusActuals(taskId) });
}
