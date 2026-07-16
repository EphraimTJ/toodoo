import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../../../lib/api";

export function useCountdowns() {
  const queryClient = useQueryClient();
  const invalidate = () => void queryClient.invalidateQueries({ queryKey: ["countdowns"] });

  const query = useQuery({ queryKey: ["countdowns"], queryFn: api.listCountdowns });

  const createCountdown = useMutation({
    mutationFn: (v: { title: string; targetDate: string; repeatAnnual: boolean; styleJson?: string }) =>
      api.createCountdown(v.title, v.targetDate, v.repeatAnnual, v.styleJson),
    onSuccess: invalidate,
  });
  const updateCountdown = useMutation({
    mutationFn: (v: { id: string; patch: Parameters<typeof api.updateCountdown>[1] }) =>
      api.updateCountdown(v.id, v.patch),
    onSuccess: invalidate,
  });
  const setPinned = useMutation({
    mutationFn: (v: { id: string; pinned: boolean }) => api.setCountdownPinned(v.id, v.pinned),
    onSuccess: invalidate,
  });
  const deleteCountdown = useMutation({
    mutationFn: (id: string) => api.deleteCountdown(id),
    onSuccess: invalidate,
  });

  return { query, createCountdown, updateCountdown, setPinned, deleteCountdown };
}
