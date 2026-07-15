import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, type JsonValue } from "../../../lib/api";
import { DEFAULT_POMO_CONFIG, type PomoConfig } from "../lib/pomodoro";

function asConfig(v: JsonValue | null): PomoConfig {
  if (v && typeof v === "object" && !Array.isArray(v)) {
    return { ...DEFAULT_POMO_CONFIG, ...(v as Partial<PomoConfig>) };
  }
  return DEFAULT_POMO_CONFIG;
}

/** Pomodoro configuration (durations, long-break interval, auto-start, daily
 *  goal), persisted in settings. */
export function useFocusSettings() {
  const queryClient = useQueryClient();
  const key = "focus:config";
  const { data } = useQuery({
    queryKey: ["setting", key],
    queryFn: async () => asConfig(await api.getSetting(key)),
  });
  const config = data ?? DEFAULT_POMO_CONFIG;
  const mutation = useMutation({
    mutationFn: (next: PomoConfig) => api.setSetting(key, { ...next }),
    onMutate: (next) => queryClient.setQueryData(["setting", key], next),
  });
  return { config, setConfig: (patch: Partial<PomoConfig>) => mutation.mutate({ ...config, ...patch }) };
}
