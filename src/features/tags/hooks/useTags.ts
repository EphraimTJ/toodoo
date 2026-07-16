import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../../../lib/api";

export function useTags() {
  return useQuery({ queryKey: ["tags"], queryFn: api.listTags });
}

export function useTagMutations() {
  const queryClient = useQueryClient();
  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ["tags"] });
    void queryClient.invalidateQueries({ queryKey: ["tasks"] });
  };

  const createTag = useMutation({
    mutationFn: ({ name, color }: { name: string; color?: string }) => api.createTag(name, color),
    onSuccess: invalidate,
  });
  const assignTag = useMutation({
    mutationFn: ({ taskId, tagId }: { taskId: string; tagId: string }) =>
      api.assignTag(taskId, tagId),
    onSuccess: invalidate,
  });
  const unassignTag = useMutation({
    mutationFn: ({ taskId, tagId }: { taskId: string; tagId: string }) =>
      api.unassignTag(taskId, tagId),
    onSuccess: invalidate,
  });
  const deleteTag = useMutation({
    mutationFn: (id: string) => api.deleteTag(id),
    onSuccess: invalidate,
  });
  const renameTag = useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) => api.updateTag(id, { name }),
    onSuccess: invalidate,
  });
  const mergeTags = useMutation({
    mutationFn: ({ src, dst }: { src: string; dst: string }) => api.mergeTags(src, dst),
    onSuccess: invalidate,
  });
  const setTagParent = useMutation({
    mutationFn: ({ id, parentId }: { id: string; parentId: string | null }) =>
      api.setTagParent(id, parentId),
    onSuccess: invalidate,
  });

  return { createTag, assignTag, unassignTag, deleteTag, renameTag, mergeTags, setTagParent };
}
