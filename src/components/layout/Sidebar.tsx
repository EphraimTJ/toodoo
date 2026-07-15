import { useQuery } from "@tanstack/react-query";
import { api } from "../../lib/api";
import { ThemeToggle } from "../../features/settings/components/ThemeToggle";

const SMART_LISTS = ["Today", "Tomorrow", "Next 7 Days", "Inbox", "All", "Completed", "Trash"];

export function Sidebar() {
  const { data: projects } = useQuery({
    queryKey: ["projects"],
    queryFn: api.listProjects,
  });

  return (
    <aside
      aria-label="Sidebar"
      className="flex w-60 shrink-0 flex-col border-r border-border bg-surface"
    >
      <div className="flex items-center justify-between px-4 py-3">
        <h1 className="text-lg font-semibold text-accent">Toodoo</h1>
        <ThemeToggle />
      </div>

      <nav className="flex-1 overflow-y-auto px-2 pb-4">
        <ul>
          {SMART_LISTS.map((name) => (
            <li key={name}>
              <button
                type="button"
                className="w-full rounded-md px-2 py-1.5 text-left text-sm hover:bg-bg"
              >
                {name}
              </button>
            </li>
          ))}
        </ul>

        <h2 className="mt-4 px-2 text-xs font-medium uppercase tracking-wide text-text-muted">
          Lists
        </h2>
        <ul>
          {(projects ?? []).map((project) => (
            <li key={project.id}>
              <button
                type="button"
                className="w-full rounded-md px-2 py-1.5 text-left text-sm hover:bg-bg"
              >
                {project.icon ? `${project.icon} ` : ""}
                {project.name}
              </button>
            </li>
          ))}
        </ul>
      </nav>
    </aside>
  );
}
