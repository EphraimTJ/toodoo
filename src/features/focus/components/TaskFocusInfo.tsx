import { Play } from "lucide-react";
import type { Task } from "../../../lib/api";
import { useUiStore } from "../../../lib/uiStore";
import { useTaskMutations } from "../../tasks/hooks/useTasks";
import { useTaskActuals } from "../hooks/useFocus";

/** Focus block on the task detail pane: start a session, and estimated pomos /
 *  duration vs the actuals accumulated from focus sessions. */
export function TaskFocusInfo({ task }: { task: Task }) {
  const { updateTask } = useTaskMutations();
  const openFocus = useUiStore((s) => s.openFocus);
  const { data: actuals } = useTaskActuals(task.id);

  const actualMin = Math.round((actuals?.actualMs ?? 0) / 60_000);

  return (
    <section className="mt-4">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-text-muted">Focus</h3>
        <button
          type="button"
          onClick={() => openFocus(task.id)}
          className="flex items-center gap-1 rounded-full border border-border px-2.5 py-1 text-xs text-accent hover:bg-accent/10"
        >
          <Play size={11} strokeWidth={2} fill="currentColor" /> Start focus
        </button>
      </div>
      {/* Stacked full-width rows — a 2-column grid overflows and overlaps in the
          narrow detail pane. */}
      <div className="mt-2 flex flex-col gap-2 text-sm">
        <label className="flex items-center gap-2 text-text-muted">
          <span className="w-20 shrink-0">Est. pomos</span>
          <input
            type="number"
            min={0}
            value={task.estPomos ?? ""}
            aria-label="Estimated pomos"
            onChange={(e) =>
              updateTask.mutate({
                id: task.id,
                patch: { estPomos: e.target.value ? Number(e.target.value) : null },
              })
            }
            className="w-14 rounded-md border border-border bg-bg px-1.5 py-0.5 text-text outline-none focus:border-accent"
          />
          <span className="whitespace-nowrap text-text-muted">/ {actuals?.actualPomos ?? 0} done</span>
        </label>
        <label className="flex items-center gap-2 text-text-muted">
          <span className="w-20 shrink-0">Est. min</span>
          <input
            type="number"
            min={0}
            value={task.estDurationMin ?? ""}
            aria-label="Estimated duration minutes"
            onChange={(e) =>
              updateTask.mutate({
                id: task.id,
                patch: { estDurationMin: e.target.value ? Number(e.target.value) : null },
              })
            }
            className="w-14 rounded-md border border-border bg-bg px-1.5 py-0.5 text-text outline-none focus:border-accent"
          />
          <span className="whitespace-nowrap text-text-muted">/ {actualMin}m done</span>
        </label>
      </div>
    </section>
  );
}
