import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, type Rule } from "../../../lib/api";

export function useMatrix() {
  const queryClient = useQueryClient();
  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ["matrix"] });
    void queryClient.invalidateQueries({ queryKey: ["tasks"] });
  };

  const config = useQuery({ queryKey: ["matrix", "config"], queryFn: api.getMatrix });
  const tasks = useQuery({ queryKey: ["matrix", "tasks"], queryFn: api.listMatrix });

  const setQuadrant = useMutation({
    mutationFn: ({ quadrant, rule }: { quadrant: number; rule: Rule }) =>
      api.setQuadrant(quadrant, rule),
    onSuccess: invalidate,
  });
  const assign = useMutation({
    mutationFn: ({ taskId, quadrant }: { taskId: string; quadrant: number }) =>
      api.assignToQuadrant(taskId, quadrant),
    onSuccess: invalidate,
  });

  return { config, tasks, setQuadrant, assign };
}
