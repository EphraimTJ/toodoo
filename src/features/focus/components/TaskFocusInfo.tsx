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
          className="rounded-md border border-border px-2 py-1 text-xs text-accent hover:bg-accent/10"
        >
          ▶ Start focus
        </button>
      </div>
      <div className="mt-2 grid grid-cols-2 gap-2 text-sm">
        <label className="flex items-center gap-2 text-text-muted">
          Est. pomos
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
            className="w-16 rounded border border-border bg-bg px-1 py-0.5 text-text outline-none focus:border-accent"
          />
          <span className="text-text">/ {actuals?.actualPomos ?? 0} done</span>
        </label>
        <label className="flex items-center gap-2 text-text-muted">
          Est. min
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
            className="w-16 rounded border border-border bg-bg px-1 py-0.5 text-text outline-none focus:border-accent"
          />
          <span className="text-text">/ {actualMin}m done</span>
        </label>
      </div>
    </section>
  );
}
