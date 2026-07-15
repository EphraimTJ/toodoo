import { useProjects } from "../../projects/hooks/useProjects";
import { ViewModeToggle } from "../../tasks/components/ViewModeToggle";
import { KanbanBoard } from "./KanbanBoard";

export function KanbanView({ projectId }: { projectId: string }) {
  const { data: projects } = useProjects();
  const project = (projects ?? []).find((p) => p.id === projectId);

  return (
    <div className="flex h-full min-w-0 flex-1 flex-col">
      <header className="flex items-center justify-between border-b border-border px-4 py-2.5">
        <h2 className="text-base font-semibold">{project?.name ?? "…"}</h2>
        {project && <ViewModeToggle project={project} />}
      </header>
      <KanbanBoard projectId={projectId} />
    </div>
  );
}
