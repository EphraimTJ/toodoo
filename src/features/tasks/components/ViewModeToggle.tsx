import type { Project } from "../../../lib/api";
import { useProjectMutations } from "../../projects/hooks/useProjects";

const MODES: [Project["viewMode"], string][] = [
  ["LIST", "List"],
  ["KANBAN", "Kanban"],
  ["TIMELINE", "Timeline"],
];

/** Switch a project between List and Kanban; the choice persists on the project
 *  (view_mode), so it is remembered per list. */
export function ViewModeToggle({ project }: { project: Project }) {
  const { updateProject } = useProjectMutations();

  return (
    <div className="flex items-center rounded-md border border-border p-0.5 text-xs" role="group" aria-label="View mode">
      {MODES.map(([mode, label]) => (
        <button
          key={mode}
          type="button"
          aria-pressed={project.viewMode === mode}
          onClick={() => updateProject.mutate({ id: project.id, patch: { viewMode: mode } })}
          className={`rounded px-2 py-0.5 ${
            project.viewMode === mode ? "bg-accent text-accent-fg" : "text-text-muted hover:text-text"
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
