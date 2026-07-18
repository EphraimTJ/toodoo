import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../../../lib/api";

/** Read + mutate the local REST API configuration (enable, regenerate token). */
export function useApiConfig() {
  const queryClient = useQueryClient();
  const invalidate = () => void queryClient.invalidateQueries({ queryKey: ["apiConfig"] });

  const query = useQuery({ queryKey: ["apiConfig"], queryFn: api.apiConfig });

  const setEnabled = useMutation({
    mutationFn: (enabled: boolean) => api.apiSetEnabled(enabled),
    onSuccess: (cfg) => {
      queryClient.setQueryData(["apiConfig"], cfg);
    },
  });

  const regenerateToken = useMutation({
    mutationFn: () => api.apiRegenerateToken(),
    onSuccess: invalidate,
  });

  return { query, setEnabled, regenerateToken };
}
