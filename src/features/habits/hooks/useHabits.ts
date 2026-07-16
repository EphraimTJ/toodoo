import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, type CheckinStatus, type HabitInput } from "../../../lib/api";

export function useTodayHabits() {
  return useQuery({ queryKey: ["habits", "today"], queryFn: api.listTodayHabits });
}

export function useHabits(includeArchived: boolean) {
  return useQuery({
    queryKey: ["habits", "list", includeArchived],
    queryFn: () => api.listHabits(includeArchived),
  });
}

export function useHabitCheckins(habitId: string, from: string, to: string) {
  return useQuery({
    queryKey: ["habits", "checkins", habitId, from, to],
    queryFn: () => api.listCheckins(habitId, from, to),
  });
}

export function useHabitStats(habitId: string) {
  return useQuery({ queryKey: ["habits", "stats", habitId], queryFn: () => api.habitStats(habitId) });
}

export function useHabitMutations() {
  const queryClient = useQueryClient();
  const invalidate = () => void queryClient.invalidateQueries({ queryKey: ["habits"] });

  const createHabit = useMutation({ mutationFn: (input: HabitInput) => api.createHabit(input), onSuccess: invalidate });
  const updateHabit = useMutation({
    mutationFn: (v: { id: string; input: HabitInput }) => api.updateHabit(v.id, v.input),
    onSuccess: invalidate,
  });
  const setArchived = useMutation({
    mutationFn: (v: { id: string; archived: boolean }) => api.setHabitArchived(v.id, v.archived),
    onSuccess: invalidate,
  });
  const deleteHabit = useMutation({ mutationFn: (id: string) => api.deleteHabit(id), onSuccess: invalidate });
  const recordCheckin = useMutation({
    mutationFn: (v: { habitId: string; date: string; status: CheckinStatus; value?: number | null; note?: string | null }) =>
      api.recordCheckin(v.habitId, v.date, v.status, v.value, v.note),
    onSuccess: invalidate,
  });
  const deleteCheckin = useMutation({
    mutationFn: (v: { habitId: string; date: string }) => api.deleteCheckin(v.habitId, v.date),
    onSuccess: invalidate,
  });

  return { createHabit, updateHabit, setArchived, deleteHabit, recordCheckin, deleteCheckin };
}
