import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, type FolderPatch, type NewProject, type ProjectPatch } from "../../../lib/api";

export function useProjects() {
  return useQuery({ queryKey: ["projects"], queryFn: api.listProjects });
}

export function useFolders() {
  return useQuery({ queryKey: ["folders"], queryFn: api.listFolders });
}

export function useProjectMutations() {
  const queryClient = useQueryClient();
  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ["projects"] });
    void queryClient.invalidateQueries({ queryKey: ["folders"] });
    void queryClient.invalidateQueries({ queryKey: ["tasks"] });
  };

  const createProject = useMutation({
    mutationFn: (input: NewProject) => api.createProject(input),
    onSuccess: invalidate,
  });
  const updateProject = useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: ProjectPatch }) =>
      api.updateProject(id, patch),
    onSuccess: invalidate,
  });
  const deleteProject = useMutation({
    mutationFn: (id: string) => api.deleteProject(id),
    onSuccess: invalidate,
  });
  const reorderProject = useMutation({
    mutationFn: ({ id, afterId }: { id: string; afterId: string | null }) =>
      api.reorderProject(id, afterId),
    onSuccess: invalidate,
  });
  const createFolder = useMutation({
    mutationFn: (name: string) => api.createFolder(name),
    onSuccess: invalidate,
  });
  const updateFolder = useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: FolderPatch }) => api.updateFolder(id, patch),
    onSuccess: invalidate,
  });
  const deleteFolder = useMutation({
    mutationFn: (id: string) => api.deleteFolder(id),
    onSuccess: invalidate,
  });

  return {
    createProject,
    updateProject,
    deleteProject,
    reorderProject,
    createFolder,
    updateFolder,
    deleteFolder,
  };
}
