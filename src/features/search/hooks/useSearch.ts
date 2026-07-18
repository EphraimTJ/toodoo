import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, type SearchFilters } from "../../../lib/api";

/** Cross-entity search results for a query + filters (skips empty queries). */
export function useSearchResults(query: string, filters: SearchFilters) {
  return useQuery({
    queryKey: ["search", "all", query, filters],
    queryFn: () => api.searchAll(query, filters),
    enabled: query.trim().length > 0,
  });
}

export function useRecentSearches() {
  return useQuery({ queryKey: ["search", "recent"], queryFn: api.recentSearches });
}

export function useSavedSearches() {
  const queryClient = useQueryClient();
  const invalidate = () => void queryClient.invalidateQueries({ queryKey: ["savedSearches"] });

  const list = useQuery({ queryKey: ["savedSearches"], queryFn: api.listSavedSearches });
  const create = useMutation({
    mutationFn: (v: { query: string; filtersJson: string | null }) =>
      api.createSavedSearch(v.query, v.filtersJson),
    onSuccess: invalidate,
  });
  const remove = useMutation({
    mutationFn: (id: string) => api.deleteSavedSearch(id),
    onSuccess: invalidate,
  });
  return { list, create, remove };
}

export function useAddRecentSearch() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (query: string) => api.addRecentSearch(query),
    onSuccess: (recent) => queryClient.setQueryData(["search", "recent"], recent),
  });
}
