import { useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/daygrid";
import timeGridPlugin from "@fullcalendar/timegrid";
import listPlugin from "@fullcalendar/list";
import interactionPlugin from "@fullcalendar/interaction";
import type { EventInput } from "@fullcalendar/core";
import { api, type CalEvent, type CalItemKind } from "../../../lib/api";
import { useUiStore } from "../../../lib/uiStore";
import { useTags } from "../../tags/hooks/useTags";
import { useProjects } from "../../projects/hooks/useProjects";
import { useCalendar, useCalendarOptions } from "../hooks/useCalendar";
import { EventDialog } from "./EventDialog";
import { UnscheduledPanel } from "./UnscheduledPanel";
import { CalendarSubscriptions } from "./CalendarSubscriptions";

const PRIORITY_FILTERS: [number, string][] = [
  [5, "High"],
  [3, "Medium"],
  [1, "Low"],
  [0, "None"],
];

interface Filters {
  tagId: string | null;
  projectId: string | null;
  priority: number | null;
}
const NO_FILTERS: Filters = { tagId: null, projectId: null, priority: null };

const selectCls =
  "rounded-full border border-border bg-surface px-2.5 py-1 text-xs outline-none focus-visible:border-accent";

function monthWindow(): { from: string; to: string } {
  const now = new Date();
  return {
    from: new Date(now.getFullYear(), now.getMonth(), 1).toISOString(),
    to: new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59).toISOString(),
  };
}

export function CalendarView() {
  const queryClient = useQueryClient();
  const selectTask = useUiStore((s) => s.selectTask);
  const { options, setOptions } = useCalendarOptions();
  const [window, setWindow] = useState(monthWindow);
  const { query, createEvent, updateEvent, deleteEvent, moveItem, resizeItem, scheduleTask } =
    useCalendar(window.from, window.to, options.showCompleted);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<CalEvent | null>(null);
  const [defaultStart, setDefaultStart] = useState<string | null>(null);
  const [defaultAllDay, setDefaultAllDay] = useState(true);
  const [subsOpen, setSubsOpen] = useState(false);
  const [showUnscheduled, setShowUnscheduled] = useState(true);
  const [filters, setFilters] = useState<Filters>(NO_FILTERS);
  const fileRef = useRef<HTMLInputElement>(null);

  const { data: tags } = useTags();
  const { data: projects } = useProjects();
  // Calendar items don't carry task metadata, so cross-reference the task list
  // to filter by tag / list / priority.
  const { data: allTasks } = useQuery({ queryKey: ["tasks", "smart:all"], queryFn: () => api.listSmart("all") });
  const taskById = useMemo(() => new Map((allTasks ?? []).map((t) => [t.id, t])), [allTasks]);
  const filterActive = filters.tagId !== null || filters.projectId !== null || filters.priority !== null;

  const events: EventInput[] = useMemo(
    () =>
      (query.data ?? [])
        .filter((i) => {
          if (!filterActive) return true;
          // Filters describe task attributes; plain events can't match, so hide
          // them while any filter is on.
          if (i.kind !== "TASK") return false;
          const t = taskById.get(i.sourceId);
          if (!t) return false;
          if (filters.tagId && !t.tagIds.includes(filters.tagId)) return false;
          if (filters.projectId && t.projectId !== filters.projectId) return false;
          if (filters.priority !== null && t.priority !== filters.priority) return false;
          return true;
        })
        .map((i) => ({
          id: i.id,
          title: i.title,
          start: i.startAt,
          end: i.endAt ?? undefined,
          allDay: i.allDay,
          editable: i.editable,
          color: i.color ?? (i.kind === "TASK" ? "#5d7052" : undefined),
          extendedProps: { kind: i.kind, sourceId: i.sourceId },
        })),
    [query.data, filterActive, filters, taskById],
  );

  const openNewEvent = (startIso: string | null, allDay: boolean) => {
    setEditing(null);
    setDefaultStart(startIso);
    setDefaultAllDay(allDay);
    setDialogOpen(true);
  };

  const onImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    await api.importIcs(await file.text());
    void queryClient.invalidateQueries({ queryKey: ["calendar"] });
    e.target.value = "";
  };
  const onExport = async () => {
    const ics = await api.exportIcs();
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([ics], { type: "text/calendar" }));
    a.download = "toodoo.ics";
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <div className="flex h-full min-w-0 flex-1 flex-col">
      <header data-print-hide className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-2">
        <h2 className="text-base font-semibold">Calendar</h2>
        <div className="ml-auto flex items-center gap-2 text-xs">
          <button type="button" onClick={() => openNewEvent(null, true)} className="rounded-full border border-border px-3 py-1 hover:border-accent">
            + Event
          </button>
          <button type="button" onClick={() => setSubsOpen(true)} className="rounded-full border border-border px-3 py-1 hover:border-accent">
            Subscriptions
          </button>
          <button type="button" onClick={() => fileRef.current?.click()} className="rounded-full border border-border px-3 py-1 hover:border-accent">
            Import
          </button>
          <button type="button" onClick={() => void onExport()} className="rounded-full border border-border px-3 py-1 hover:border-accent">
            Export
          </button>
          <button type="button" onClick={() => globalThis.print()} className="rounded-full border border-border px-3 py-1 hover:border-accent">
            Print
          </button>
          <input ref={fileRef} type="file" accept=".ics,text/calendar" className="hidden" aria-label="Import ICS file" onChange={onImport} />

          <span className="mx-0.5 h-4 w-px bg-border" aria-hidden />

          {/* Filters (tag / list / priority) — cross-referenced against tasks. */}
          <select aria-label="Filter by tag" className={selectCls} value={filters.tagId ?? ""} onChange={(e) => setFilters((f) => ({ ...f, tagId: e.target.value || null }))}>
            <option value="">All tags</option>
            {(tags ?? []).map((t) => (
              <option key={t.id} value={t.id}>#{t.name}</option>
            ))}
          </select>
          <select aria-label="Filter by list" className={selectCls} value={filters.projectId ?? ""} onChange={(e) => setFilters((f) => ({ ...f, projectId: e.target.value || null }))}>
            <option value="">All lists</option>
            {(projects ?? []).map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
          <select aria-label="Filter by priority" className={selectCls} value={filters.priority ?? ""} onChange={(e) => setFilters((f) => ({ ...f, priority: e.target.value === "" ? null : Number(e.target.value) }))}>
            <option value="">Any priority</option>
            {PRIORITY_FILTERS.map(([p, label]) => (
              <option key={p} value={p}>{label}</option>
            ))}
          </select>
          {filterActive && (
            <button type="button" onClick={() => setFilters(NO_FILTERS)} className="rounded-full px-2 py-1 text-accent hover:bg-accent/10" aria-label="Clear filters">
              Clear
            </button>
          )}

          <span className="mx-0.5 h-4 w-px bg-border" aria-hidden />

          <label className="flex items-center gap-1">
            <input type="checkbox" checked={showUnscheduled} onChange={(e) => setShowUnscheduled(e.target.checked)} className="accent-(--color-accent)" />
            Unscheduled
          </label>
          <label className="flex items-center gap-1">
            <input type="checkbox" checked={options.showCompleted} onChange={(e) => setOptions({ showCompleted: e.target.checked })} className="accent-(--color-accent)" />
            Completed
          </label>
          <label className="flex items-center gap-1">
            <input type="checkbox" checked={options.weekends} onChange={(e) => setOptions({ weekends: e.target.checked })} className="accent-(--color-accent)" />
            Weekends
          </label>
          <select
            aria-label="Week starts on"
            value={options.firstDay}
            onChange={(e) => setOptions({ firstDay: Number(e.target.value) })}
            className={selectCls}
          >
            <option value={0}>Sun</option>
            <option value={1}>Mon</option>
          </select>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        <div className="min-w-0 flex-1 p-2">
          <FullCalendar
            plugins={[dayGridPlugin, timeGridPlugin, listPlugin, interactionPlugin]}
            initialView="dayGridMonth"
            headerToolbar={{
              left: "today",
              center: "prev,title,next",
              right: "timeGridDay,timeGridWeek,dayGridMonth,listWeek",
            }}
            firstDay={options.firstDay}
            weekends={options.weekends}
            editable
            selectable
            droppable
            height="100%"
            events={events}
            datesSet={(arg) => setWindow({ from: arg.start.toISOString(), to: arg.end.toISOString() })}
            select={(arg) => openNewEvent(arg.start.toISOString(), arg.allDay)}
            eventDrop={(arg) => {
              const kind = arg.event.extendedProps.kind as CalItemKind;
              const id = arg.event.extendedProps.sourceId as string;
              moveItem.mutate(
                { kind, id, startAt: (arg.event.start ?? new Date()).toISOString(), allDay: arg.event.allDay },
                { onError: () => arg.revert() },
              );
            }}
            eventResize={(arg) => {
              const kind = arg.event.extendedProps.kind as CalItemKind;
              const id = arg.event.extendedProps.sourceId as string;
              if (!arg.event.end) return;
              resizeItem.mutate(
                { kind, id, endAt: arg.event.end.toISOString() },
                { onError: () => arg.revert() },
              );
            }}
            eventReceive={(arg) => {
              const taskId = arg.event.extendedProps.taskId as string | undefined;
              const start = (arg.event.start ?? new Date()).toISOString();
              arg.revert(); // remove the temp event; the refetch shows the scheduled task
              if (taskId) {
                scheduleTask.mutate({
                  taskId,
                  startAt: start,
                  allDay: arg.event.allDay,
                  durationMin: arg.event.allDay ? undefined : 60,
                });
              }
            }}
            eventClick={(arg) => {
              const kind = arg.event.extendedProps.kind as CalItemKind;
              const sourceId = arg.event.extendedProps.sourceId as string;
              if (kind === "TASK") {
                selectTask(sourceId);
              } else if (arg.event.startEditable) {
                void api.getEvent(sourceId).then((ev) => {
                  setEditing(ev);
                  setDialogOpen(true);
                });
              }
            }}
          />
        </div>
        {showUnscheduled && <UnscheduledPanel />}
      </div>

      <EventDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        event={editing}
        defaultStart={defaultStart}
        defaultAllDay={defaultAllDay}
        onCreate={(input) => createEvent.mutate(input)}
        onUpdate={(id, patch) => updateEvent.mutate({ id, patch })}
        onDelete={(id) => deleteEvent.mutate(id)}
      />
      <CalendarSubscriptions open={subsOpen} onOpenChange={setSubsOpen} />
    </div>
  );
}
