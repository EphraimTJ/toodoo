import { useUiStore } from "../../lib/uiStore";
import { TaskListView } from "../../features/tasks/components/TaskListView";

export function ListPane() {
  const view = useUiStore((s) => s.view);
  return (
    <main aria-label="Task list" className="flex min-w-0 flex-1 flex-col">
      <TaskListView view={view} />
    </main>
  );
}
