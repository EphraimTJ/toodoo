import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../../../lib/api";

export function useSticky() {
  const queryClient = useQueryClient();
  const invalidate = () => void queryClient.invalidateQueries({ queryKey: ["stickies"] });

  const query = useQuery({ queryKey: ["stickies"], queryFn: api.listStickies });

  const newSticky = useMutation({ mutationFn: (text: string) => api.newQuickSticky(text), onSuccess: invalidate });
  const updateSticky = useMutation({
    mutationFn: (v: { id: string; patch: Parameters<typeof api.updateSticky>[1] }) =>
      api.updateSticky(v.id, v.patch),
    onSuccess: invalidate,
  });
  const closeSticky = useMutation({ mutationFn: (id: string) => api.closeSticky(id), onSuccess: invalidate });

  return { query, newSticky, updateSticky, closeSticky };
}
