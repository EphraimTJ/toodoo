import { useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useVirtualizer } from "@tanstack/react-virtual";
import { api, localDateParams, type Task } from "../../../lib/api";
import { useUiStore } from "../../../lib/uiStore";
import { useProjects } from "../../projects/hooks/useProjects";
import { useTaskMutations } from "../../tasks/hooks/useTasks";
import { ViewModeToggle } from "../../tasks/components/ViewModeToggle";
import { addDays, dateToX, toAllDayIso, xToDay, ZOOM_PX_PER_DAY, ZOOMS, type Zoom } from "../lib/timeline";
import { TimelineBar } from "./TimelineBar";
import { UnscheduledTimelinePanel } from "./UnscheduledTimelinePanel";

const AXIS_H = 28;
const ROW_H = 32;
const dateStr = (t: string) => t.slice(0, 10);
const isWeekend = (d: string) => {
  const dow = new Date(`${d}T00:00:00Z`).getUTCDay();
  return dow === 0 || dow === 6;
};

type Row = { kind: "section"; label: string } | { kind: "task"; task: Task };

export function TimelineView({ projectId }: { projectId: string }) {
  const { data: tasks } = useQuery({
    queryKey: ["tasks", `project:${projectId}`],
    queryFn: () => api.listProjectTasks(projectId),
  });
  const { data: sections } = useQuery({
    queryKey: ["sections", projectId],
    queryFn: () => api.listSections(projectId),
  });
  const { data: projects } = useProjects();
  const { updateTask } = useTaskMutations();
  const selectTask = useUiStore((s) => s.selectTask);

  const project = (projects ?? []).find((p) => p.id === projectId);
  const [zoom, setZoom] = useState<Zoom>("day");
  const ppd = ZOOM_PX_PER_DAY[zoom];
  const today = localDateParams().today;
  const scrollRef = useRef<HTMLDivElement>(null);

  const all = tasks ?? [];
  const dated = all.filter((t) => t.status === "ACTIVE" && t.kind !== "NOTE" && (t.startAt || t.dueAt));
  const undated = all.filter((t) => t.status === "ACTIVE" && t.kind !== "NOTE" && !t.startAt && !t.dueAt);

  const { origin, totalDays } = useMemo(() => {
    const dates = [today, ...dated.flatMap((t) => [t.startAt, t.dueAt].filter(Boolean).map((d) => dateStr(d!)))];
    const min = dates.reduce((a, b) => (a < b ? a : b));
    const max = dates.reduce((a, b) => (a > b ? a : b));
    const origin = addDays(min, -3);
    return { origin, totalDays: Math.max(40, dateSpan(origin, addDays(max, 21)) + 1) };
  }, [dated, today]);
  const totalWidth = totalDays * ppd;

  const rows: Row[] = useMemo(() => {
    const bySection = new Map<string | null, Task[]>();
    for (const t of dated) {
      const k = t.sectionId ?? null;
      (bySection.get(k) ?? bySection.set(k, []).get(k)!).push(t);
    }
    const groups: { label: string; tasks: Task[] }[] = [];
    for (const s of sections ?? []) {
      const ts = bySection.get(s.id);
      if (ts?.length) groups.push({ label: s.name, tasks: ts });
    }
    const none = bySection.get(null);
    if (none?.length) groups.push({ label: "No section", tasks: none });

    const out: Row[] = [];
    for (const g of groups) {
      out.push({ kind: "section", label: g.label });
      for (const t of g.tasks) out.push({ kind: "task", task: t });
    }
    return out;
  }, [dated, sections]);

  // eslint-disable-next-line react-hooks/incompatible-library -- virtualizer identity is managed by TanStack Virtual itself
  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_H,
    overscan: 10,
    initialRect: { width: 1200, height: 600 },
  });

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const id = e.dataTransfer.getData("text/task");
    if (!id || !scrollRef.current) return;
    const rect = scrollRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left + scrollRef.current.scrollLeft;
    const day = xToDay(x, origin, ppd);
    updateTask.mutate({ id, patch: { startAt: toAllDayIso(day), dueAt: toAllDayIso(day), isAllDay: true } });
  };

  // Axis ticks: label per zoom (day number / week-start / month name).
  const ticks = useMemo(() => {
    const out: { x: number; label: string; weekend: boolean }[] = [];
    for (let i = 0; i < totalDays; i++) {
      const d = addDays(origin, i);
      const dow = new Date(`${d}T00:00:00Z`).getUTCDay();
      let label = "";
      if (zoom === "day") label = d.slice(8, 10);
      else if (zoom === "week" && dow === 1) label = d.slice(5, 10);
      else if (zoom === "month" && d.slice(8, 10) === "01")
        label = new Date(`${d}T00:00:00Z`).toLocaleString(undefined, { month: "short", timeZone: "UTC" });
      out.push({ x: i * ppd, label, weekend: isWeekend(d) });
    }
    return out;
  }, [origin, totalDays, ppd, zoom]);

  const todayX = dateToX(today, origin, ppd);

  return (
    <div className="flex h-full min-w-0 flex-1 flex-col">
      <header className="flex items-center gap-2 border-b border-border px-4 py-2">
        <h2 className="text-base font-semibold">{project?.name ?? "Timeline"}</h2>
        {project && <ViewModeToggle project={project} />}
        <div className="ml-auto flex items-center gap-1 rounded-md border border-border p-0.5 text-xs">
          {ZOOMS.map((z) => (
            <button
              key={z}
              type="button"
              aria-pressed={zoom === z}
              onClick={() => setZoom(z)}
              className={`rounded px-2 py-0.5 capitalize ${zoom === z ? "bg-accent text-accent-fg" : "text-text-muted"}`}
            >
              {z}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={() => scrollRef.current?.scrollTo({ left: Math.max(0, todayX - 120), behavior: "smooth" })}
          className="rounded-md border border-border px-2 py-1 text-xs hover:border-accent"
        >
          Today
        </button>
      </header>

      <div className="flex min-h-0 flex-1">
        <div
          ref={scrollRef}
          className="relative min-w-0 flex-1 overflow-auto"
          data-testid="timeline-grid"
          onDragOver={(e) => e.preventDefault()}
          onDrop={onDrop}
        >
          <div style={{ width: totalWidth, position: "relative" }}>
            {/* Axis */}
            <div className="sticky top-0 z-10 border-b border-border bg-surface" style={{ height: AXIS_H, width: totalWidth }}>
              {ticks.map((t, i) =>
                t.label ? (
                  <span key={i} className="absolute top-1 text-[10px] text-text-muted" style={{ left: t.x + 2 }}>
                    {t.label}
                  </span>
                ) : null,
              )}
            </div>

            {/* Body: background shading/lines + today marker + virtualized rows. */}
            <div style={{ height: virtualizer.getTotalSize(), position: "relative" }}>
              {zoom !== "month" &&
                ticks.map((t, i) =>
                  t.weekend ? (
                    <div key={i} className="absolute top-0 h-full bg-text-muted/5" style={{ left: t.x, width: ppd }} />
                  ) : null,
                )}
              <div className="absolute top-0 z-10 h-full w-px bg-red-500" style={{ left: todayX }} aria-label="Today" />

              {virtualizer.getVirtualItems().map((vr) => {
                const row = rows[vr.index];
                return (
                  <div
                    key={vr.key}
                    className="absolute left-0"
                    style={{ top: 0, transform: `translateY(${vr.start}px)`, width: totalWidth, height: ROW_H }}
                  >
                    {row.kind === "section" ? (
                      <div className="sticky left-0 flex h-full items-center bg-bg/80 px-2 text-xs font-semibold uppercase tracking-wide text-text-muted">
                        {row.label}
                      </div>
                    ) : (
                      <div className="relative h-full border-b border-border/40">
                        <TimelineBar task={row.task} origin={origin} pxPerDay={ppd} onOpen={selectTask} />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
          {dated.length === 0 && (
            <div className="absolute inset-0 flex items-center justify-center text-sm text-text-muted">
              No dated tasks — drag one from the panel, or set dates in the detail pane.
            </div>
          )}
        </div>

        <UnscheduledTimelinePanel tasks={undated} />
      </div>
    </div>
  );
}

function dateSpan(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}
