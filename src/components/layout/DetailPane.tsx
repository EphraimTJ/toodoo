import { TaskDetail } from "../../features/tasks/components/detail/TaskDetail";

export function DetailPane() {
  return (
    <aside
      aria-label="Task detail"
      className="flex w-80 shrink-0 flex-col border-l border-border bg-surface"
    >
      <TaskDetail />
    </aside>
  );
}
