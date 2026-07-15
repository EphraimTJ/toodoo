import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, type CalItemKind, type JsonValue, type NewEvent } from "../../../lib/api";

export interface CalendarOptions {
  firstDay: number; // 0=Sun, 1=Mon
  weekends: boolean;
  showCompleted: boolean;
}

const DEFAULT_CAL_OPTS: CalendarOptions = { firstDay: 1, weekends: true, showCompleted: false };

function asCalOpts(v: JsonValue | null): CalendarOptions {
  if (v && typeof v === "object" && !Array.isArray(v)) {
    return { ...DEFAULT_CAL_OPTS, ...(v as Partial<CalendarOptions>) };
  }
  return DEFAULT_CAL_OPTS;
}

/** Per-calendar display options (week start, weekend shading, show completed),
 *  persisted in settings. */
export function useCalendarOptions() {
  const queryClient = useQueryClient();
  const key = "calendar:opts";
  const { data } = useQuery({
    queryKey: ["setting", key],
    queryFn: async () => asCalOpts(await api.getSetting(key)),
  });
  const options = data ?? DEFAULT_CAL_OPTS;
  const mutation = useMutation({
    mutationFn: (next: CalendarOptions) => api.setSetting(key, { ...next }),
    onMutate: (next) => queryClient.setQueryData(["setting", key], next),
  });
  return { options, setOptions: (patch: Partial<CalendarOptions>) => mutation.mutate({ ...options, ...patch }) };
}

/** Calendar items (tasks + events) within a visible window. */
export function useCalendar(from: string, to: string, includeCompleted: boolean) {
  const queryClient = useQueryClient();
  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ["calendar"] });
    void queryClient.invalidateQueries({ queryKey: ["tasks"] });
  };

  const query = useQuery({
    queryKey: ["calendar", from, to, includeCompleted],
    queryFn: () => api.listCalendar(from, to, includeCompleted),
  });

  const createEvent = useMutation({
    mutationFn: (input: NewEvent) => api.createEvent(input),
    onSuccess: invalidate,
  });
  const updateEvent = useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: Parameters<typeof api.updateEvent>[1] }) =>
      api.updateEvent(id, patch),
    onSuccess: invalidate,
  });
  const deleteEvent = useMutation({
    mutationFn: (id: string) => api.deleteEvent(id),
    onSuccess: invalidate,
  });
  const moveItem = useMutation({
    mutationFn: (v: { kind: CalItemKind; id: string; startAt: string; allDay: boolean }) =>
      api.moveCalendarItem(v.kind, v.id, v.startAt, v.allDay),
    onSuccess: invalidate,
  });
  const resizeItem = useMutation({
    mutationFn: (v: { kind: CalItemKind; id: string; endAt: string }) =>
      api.resizeCalendarItem(v.kind, v.id, v.endAt),
    onSuccess: invalidate,
  });
  const scheduleTask = useMutation({
    mutationFn: (v: { taskId: string; startAt: string; allDay: boolean; durationMin?: number }) =>
      api.scheduleTask(v.taskId, v.startAt, v.allDay, v.durationMin),
    onSuccess: invalidate,
  });

  return { query, createEvent, updateEvent, deleteEvent, moveItem, resizeItem, scheduleTask };
}
