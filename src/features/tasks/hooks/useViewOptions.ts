import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, type JsonValue } from "../../../lib/api";
import { viewKey, type ViewSelection } from "../../../lib/uiStore";

export type SortMode = "custom" | "date" | "priority" | "title" | "tag";
export type GroupMode = "none" | "date" | "priority" | "tag" | "list";
export type Density = "compact" | "default" | "detailed";

export interface ViewOptions {
  sort: SortMode;
  group: GroupMode;
  showCompleted: boolean;
  completedCollapsed: boolean;
  density: Density;
}

/** Completed shows as a collapsed section at the bottom by default
 *  (docs/decisions.md). */
export const DEFAULT_VIEW_OPTIONS: ViewOptions = {
  sort: "custom",
  group: "none",
  showCompleted: true,
  completedCollapsed: true,
  density: "default",
};

function asViewOptions(v: JsonValue | null): Partial<ViewOptions> | null {
  if (typeof v === "object" && v !== null && !Array.isArray(v) && "sort" in v) {
    return v as Partial<ViewOptions>;
  }
  return null;
}

export function useViewOptions(view: ViewSelection) {
  const key = `viewopts:${viewKey(view)}`;
  const queryClient = useQueryClient();

  const { data } = useQuery({
    queryKey: ["setting", key],
    queryFn: async (): Promise<ViewOptions> => {
      const stored = asViewOptions(await api.getSetting(key));
      return stored ? { ...DEFAULT_VIEW_OPTIONS, ...stored } : DEFAULT_VIEW_OPTIONS;
    },
  });
  const options = data ?? DEFAULT_VIEW_OPTIONS;

  const mutation = useMutation({
    mutationFn: (next: ViewOptions) => api.setSetting(key, { ...next }),
    onMutate: (next) => {
      queryClient.setQueryData(["setting", key], next);
    },
  });

  return {
    options,
    setOptions: (patch: Partial<ViewOptions>) => mutation.mutate({ ...options, ...patch }),
  };
}
