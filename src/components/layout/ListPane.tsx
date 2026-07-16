import { useUiStore } from "../../lib/uiStore";
import { useProjects } from "../../features/projects/hooks/useProjects";
import { TaskListView } from "../../features/tasks/components/TaskListView";
import { KanbanView } from "../../features/kanban/components/KanbanView";
import { FilterResultsView } from "../../features/filters/components/FilterResultsView";
import { MatrixView } from "../../features/matrix/components/MatrixView";
import { CalendarView } from "../../features/calendar/components/CalendarView";
import { FocusView } from "../../features/focus/components/FocusView";
import { HabitsView } from "../../features/habits/components/HabitsView";
import { CountdownView } from "../../features/countdown/components/CountdownView";
import { NoteListView } from "../../features/notes/components/NoteListView";
import { StickyBoard } from "../../features/sticky/components/StickyBoard";
import { TimelineView } from "../../features/timeline/components/TimelineView";

export function ListPane() {
  const view = useUiStore((s) => s.view);
  const { data: projects } = useProjects();

  let content;
  if (view.kind === "countdown") {
    content = <CountdownView />;
  } else if (view.kind === "habits") {
    content = <HabitsView />;
  } else if (view.kind === "focus") {
    content = <FocusView />;
  } else if (view.kind === "calendar") {
    content = <CalendarView />;
  } else if (view.kind === "matrix") {
    content = <MatrixView />;
  } else if (view.kind === "filter") {
    content = <FilterResultsView filterId={view.filterId} />;
  } else if (view.kind === "sticky") {
    content = <StickyBoard />;
  } else if (view.kind === "project") {
    const project = (projects ?? []).find((p) => p.id === view.projectId);
    content =
      project?.kind === "NOTE" ? (
        <NoteListView projectId={view.projectId} />
      ) : project?.viewMode === "KANBAN" ? (
        <KanbanView projectId={view.projectId} />
      ) : project?.viewMode === "TIMELINE" ? (
        <TimelineView projectId={view.projectId} />
      ) : (
        <TaskListView view={view} />
      );
  } else {
    content = <TaskListView view={view} />;
  }

  return (
    <main aria-label="Task list" className="flex min-w-0 flex-1 flex-col">
      {content}
    </main>
  );
}
