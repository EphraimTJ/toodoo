import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../../../lib/api";

export function useSubscriptions() {
  const queryClient = useQueryClient();
  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ["subscriptions"] });
    void queryClient.invalidateQueries({ queryKey: ["calendar"] });
  };

  const query = useQuery({ queryKey: ["subscriptions"], queryFn: api.listSubscriptions });

  const addSubscription = useMutation({
    mutationFn: (v: { url: string; name: string; color?: string | null; refreshMin?: number }) =>
      api.addSubscription(v.url, v.name, v.color, v.refreshMin),
    onSuccess: invalidate,
  });
  const updateSubscription = useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: Parameters<typeof api.updateSubscription>[1] }) =>
      api.updateSubscription(id, patch),
    onSuccess: invalidate,
  });
  const deleteSubscription = useMutation({
    mutationFn: (id: string) => api.deleteSubscription(id),
    onSuccess: invalidate,
  });
  const refreshSubscription = useMutation({
    mutationFn: (id: string) => api.refreshSubscription(id),
    onSuccess: invalidate,
  });

  return { query, addSubscription, updateSubscription, deleteSubscription, refreshSubscription };
}
