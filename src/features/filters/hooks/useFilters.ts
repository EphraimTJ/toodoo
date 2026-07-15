import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, type Rule } from "../../../lib/api";

export function useFilters() {
  const queryClient = useQueryClient();
  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ["filters"] });
    void queryClient.invalidateQueries({ queryKey: ["tasks"] });
  };

  const query = useQuery({ queryKey: ["filters"], queryFn: api.listFilters });

  const createFilter = useMutation({
    mutationFn: ({ name, rule, color }: { name: string; rule: Rule; color?: string | null }) =>
      api.createFilter(name, rule, color),
    onSuccess: invalidate,
  });
  const updateFilter = useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: { name?: string; rule?: Rule; color?: string } }) =>
      api.updateFilter(id, patch),
    onSuccess: invalidate,
  });
  const deleteFilter = useMutation({
    mutationFn: (id: string) => api.deleteFilter(id),
    onSuccess: invalidate,
  });

  return { query, createFilter, updateFilter, deleteFilter };
}
