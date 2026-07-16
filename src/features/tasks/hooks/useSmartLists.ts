import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, type JsonValue, type SmartView } from "../../../lib/api";

export interface SmartListItem {
  view: SmartView;
  visible: boolean;
}

const KEY = "smartlists.config";
const DEFAULT: SmartListItem[] = [
  { view: "today", visible: true },
  { view: "tomorrow", visible: true },
  { view: "next7Days", visible: true },
  { view: "all", visible: true },
  { view: "completed", visible: true },
  { view: "wontDo", visible: true },
  { view: "trash", visible: true },
];

const KNOWN = new Set(DEFAULT.map((d) => d.view));

function parse(v: JsonValue | null): SmartListItem[] {
  if (!Array.isArray(v)) return DEFAULT;
  const stored: SmartListItem[] = [];
  for (const x of v) {
    if (typeof x === "object" && x !== null && !Array.isArray(x) && "view" in x) {
      const view = (x as Record<string, JsonValue>).view;
      if (typeof view === "string" && KNOWN.has(view as SmartView)) {
        stored.push({ view: view as SmartView, visible: (x as Record<string, JsonValue>).visible !== false });
      }
    }
  }
  // Merge with DEFAULT so newly-added smart lists (e.g. Won't Do) always appear.
  const seen = new Set(stored.map((s) => s.view));
  return [...stored, ...DEFAULT.filter((d) => !seen.has(d.view))];
}

/** Ordered, show/hide-able smart-list config (settings-backed). */
export function useSmartLists() {
  const queryClient = useQueryClient();
  const { data } = useQuery({
    queryKey: ["setting", KEY],
    queryFn: async () => parse(await api.getSetting(KEY)),
  });
  const items = data ?? DEFAULT;

  const save = useMutation({
    mutationFn: (next: SmartListItem[]) => api.setSetting(KEY, next as unknown as JsonValue),
    onMutate: (next) => queryClient.setQueryData(["setting", KEY], next),
  });

  const toggle = (view: SmartView) =>
    save.mutate(items.map((i) => (i.view === view ? { ...i, visible: !i.visible } : i)));
  const move = (view: SmartView, dir: -1 | 1) => {
    const idx = items.findIndex((i) => i.view === view);
    const to = idx + dir;
    if (idx < 0 || to < 0 || to >= items.length) return;
    const next = [...items];
    [next[idx], next[to]] = [next[to], next[idx]];
    save.mutate(next);
  };

  return { items, toggle, move };
}
