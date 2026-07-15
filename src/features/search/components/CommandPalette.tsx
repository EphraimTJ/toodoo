import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Command } from "cmdk";
import { api } from "../../../lib/api";
import { useUiStore } from "../../../lib/uiStore";
import { useProjects } from "../../projects/hooks/useProjects";

export function CommandPalette() {
  const { paletteOpen, setPaletteOpen, setView, selectTask } = useUiStore();
  const { data: projects } = useProjects();
  const [query, setQuery] = useState("");

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        setPaletteOpen(!useUiStore.getState().paletteOpen);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [setPaletteOpen]);

  const { data: results } = useQuery({
    queryKey: ["search", query],
    queryFn: () => api.searchTasks(query),
    enabled: paletteOpen && query.trim().length > 0,
  });

  const openTask = (taskId: string, projectId: string) => {
    setView({ kind: "project", projectId });
    selectTask(taskId);
    setPaletteOpen(false);
    setQuery("");
  };

  return (
    <Command.Dialog
      open={paletteOpen}
      onOpenChange={setPaletteOpen}
      shouldFilter={false}
      label="Command palette"
      className="fixed left-1/2 top-24 z-50 w-[36rem] max-w-[90vw] -translate-x-1/2 overflow-hidden rounded-lg border border-border bg-surface shadow-2xl"
    >
      <Command.Input
        value={query}
        onValueChange={setQuery}
        placeholder="Search tasks, jump to lists…"
        className="w-full border-b border-border bg-transparent px-4 py-3 text-sm outline-none placeholder:text-text-muted"
      />
      <Command.List className="max-h-80 overflow-y-auto p-2">
        <Command.Empty className="px-3 py-6 text-center text-sm text-text-muted">
          No results.
        </Command.Empty>

        {(results ?? []).length > 0 && (
          <Command.Group
            heading="Tasks"
            className="text-xs font-semibold uppercase tracking-wide text-text-muted [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1"
          >
            {(results ?? []).map((task) => (
              <Command.Item
                key={task.id}
                value={task.id}
                onSelect={() => openTask(task.id, task.projectId)}
                className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm font-normal normal-case tracking-normal text-text data-[selected=true]:bg-accent/10"
              >
                <span
                  className={`text-xs ${task.status === "COMPLETED" ? "text-green-500" : "text-text-muted"}`}
                >
                  {task.status === "COMPLETED" ? "✓" : "○"}
                </span>
                <span className="truncate">{task.title}</span>
                <span className="ml-auto truncate text-xs text-text-muted">
                  {(projects ?? []).find((p) => p.id === task.projectId)?.name}
                </span>
              </Command.Item>
            ))}
          </Command.Group>
        )}

        {query.trim() === "" && (
          <Command.Group
            heading="Lists"
            className="text-xs font-semibold uppercase tracking-wide text-text-muted [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1"
          >
            {(projects ?? []).map((project) => (
              <Command.Item
                key={project.id}
                value={`list-${project.id}`}
                onSelect={() => {
                  setView({ kind: "project", projectId: project.id });
                  setPaletteOpen(false);
                }}
                className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm font-normal normal-case tracking-normal text-text data-[selected=true]:bg-accent/10"
              >
                <span
                  className="h-2 w-2 rounded-full"
                  style={{ backgroundColor: project.color ?? "var(--color-border)" }}
                />
                {project.name}
              </Command.Item>
            ))}
          </Command.Group>
        )}
      </Command.List>
    </Command.Dialog>
  );
}
