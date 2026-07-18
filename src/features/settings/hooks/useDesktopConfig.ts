import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../../../lib/api";

/** Native desktop config (quick-add hotkey, launch-at-login, notification actions). */
export function useDesktopConfig() {
  const queryClient = useQueryClient();
  const set = (cfg: unknown) => queryClient.setQueryData(["desktopConfig"], cfg);

  const query = useQuery({ queryKey: ["desktopConfig"], queryFn: api.desktopConfig });
  const setHotkey = useMutation({ mutationFn: (a: string) => api.setQuickAddHotkey(a), onSuccess: set });
  const setAutostart = useMutation({ mutationFn: (on: boolean) => api.setAutostart(on), onSuccess: set });
  const setNotifActions = useMutation({ mutationFn: (on: boolean) => api.setNotifActions(on), onSuccess: set });
  const setSimplePopouts = useMutation({ mutationFn: (on: boolean) => api.setSimplePopouts(on), onSuccess: set });
  const setPopoutStyle = useMutation({ mutationFn: (s: string) => api.setPopoutStyle(s), onSuccess: set });

  return { query, setHotkey, setAutostart, setNotifActions, setSimplePopouts, setPopoutStyle };
}
