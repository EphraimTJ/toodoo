import { TaskDetail } from "../../features/tasks/components/detail/TaskDetail";

export function DetailPane({ width }: { width?: number }) {
  return (
    <aside
      aria-label="Task detail"
      data-detail-pane
      className="flex shrink-0 flex-col border-l border-border bg-surface"
      style={{ width: width ?? 320 }}
    >
      <TaskDetail />
    </aside>
  );
}
