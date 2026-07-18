import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../../../lib/api";

/** Backup list + config, with create/restore/delete/config mutations. */
export function useBackups() {
  const queryClient = useQueryClient();
  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ["backups"] });
    void queryClient.invalidateQueries({ queryKey: ["backupConfig"] });
  };

  const list = useQuery({ queryKey: ["backups"], queryFn: api.listBackups });
  const config = useQuery({ queryKey: ["backupConfig"], queryFn: api.backupConfig });

  const create = useMutation({ mutationFn: () => api.createBackup(), onSuccess: invalidate });
  const remove = useMutation({
    mutationFn: (path: string) => api.deleteBackup(path),
    onSuccess: invalidate,
  });
  const restore = useMutation({ mutationFn: (path: string) => api.restoreBackup(path) });
  const setConfig = useMutation({
    mutationFn: (v: { autoEnabled: boolean; keep: number }) =>
      api.setBackupConfig(v.autoEnabled, v.keep),
    onSuccess: (cfg) => queryClient.setQueryData(["backupConfig"], cfg),
  });

  return { list, config, create, remove, restore, setConfig };
}
