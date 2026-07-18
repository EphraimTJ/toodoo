import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../../../lib/api";

export function useSections(projectId: string) {
  const queryClient = useQueryClient();
  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ["sections", projectId] });
    void queryClient.invalidateQueries({ queryKey: ["tasks"] });
  };

  const query = useQuery({
    queryKey: ["sections", projectId],
    queryFn: () => api.listSections(projectId),
  });

  const createSection = useMutation({
    mutationFn: (name: string) => api.createSection(projectId, name),
    onSuccess: invalidate,
  });
  const renameSection = useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) => api.renameSection(id, name),
    onSuccess: invalidate,
  });
  const deleteSection = useMutation({
    mutationFn: (id: string) => api.deleteSection(id),
    onSuccess: invalidate,
  });
  const moveTaskToSection = useMutation({
    mutationFn: ({ taskId, sectionId }: { taskId: string; sectionId: string | null }) =>
      api.moveTaskToSection(taskId, sectionId),
    onSuccess: invalidate,
  });

  return { query, createSection, renameSection, deleteSection, moveTaskToSection };
}
