import { useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/daygrid";
import timeGridPlugin from "@fullcalendar/timegrid";
import listPlugin from "@fullcalendar/list";
import interactionPlugin from "@fullcalendar/interaction";
import type { EventInput } from "@fullcalendar/core";
import { api, type CalEvent, type CalItemKind } from "../../../lib/api";
import { useUiStore } from "../../../lib/uiStore";
import { useCalendar, useCalendarOptions } from "../hooks/useCalendar";
import { EventDialog } from "./EventDialog";
import { UnscheduledPanel } from "./UnscheduledPanel";
import { CalendarSubscriptions } from "./CalendarSubscriptions";

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
  const fileRef = useRef<HTMLInputElement>(null);

  const events: EventInput[] = useMemo(
    () =>
      (query.data ?? []).map((i) => ({
        id: i.id,
        title: i.title,
        start: i.startAt,
        end: i.endAt ?? undefined,
        allDay: i.allDay,
        editable: i.editable,
        color: i.color ?? (i.kind === "TASK" ? "#5d7052" : undefined),
        extendedProps: { kind: i.kind, sourceId: i.sourceId },
      })),
    [query.data],
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
      <header className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-2">
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
          <input ref={fileRef} type="file" accept=".ics,text/calendar" className="hidden" aria-label="Import ICS file" onChange={onImport} />
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
            className="rounded border border-border bg-bg px-1 py-1"
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
              left: "prev,next today",
              center: "title",
              right: "timeGridDay,timeGridWeek,dayGridMonth,multiWeek,listWeek",
            }}
            views={{ multiWeek: { type: "dayGrid", duration: { weeks: 3 }, buttonText: "3 wks" } }}
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
        <UnscheduledPanel />
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
