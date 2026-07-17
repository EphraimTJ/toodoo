import { useTranslation } from "react-i18next";
import type { SmartView } from "../../lib/api";
import { useUiStore } from "../../lib/uiStore";
import { ThemeToggle } from "../../features/settings/components/ThemeToggle";
import { SettingsDialog } from "../../features/settings/components/SettingsDialog";
import { SidebarProjects } from "../../features/projects/components/SidebarProjects";
import { SidebarTags } from "../../features/tags/components/SidebarTags";
import { SidebarFilters } from "../../features/filters/components/SidebarFilters";
import { useSmartCounts } from "../../features/tasks/hooks/useTasks";
import { useSmartLists } from "../../features/tasks/hooks/useSmartLists";

const SMART_META: Record<SmartView, { label: string; countKey?: "today" | "tomorrow" | "next7" }> = {
  today: { label: "Today", countKey: "today" },
  tomorrow: { label: "Tomorrow", countKey: "tomorrow" },
  next7Days: { label: "Next 7 Days", countKey: "next7" },
  all: { label: "All" },
  completed: { label: "Completed" },
  wontDo: { label: "Won't Do" },
  trash: { label: "Trash" },
};

export function Sidebar() {
  const { t } = useTranslation();
  const { view, setView } = useUiStore();
  const { data: counts } = useSmartCounts();
  const { items: smartLists } = useSmartLists();

  return (
    <aside
      aria-label="Sidebar"
      className="flex w-60 shrink-0 flex-col border-r border-border bg-surface"
    >
      <div className="flex items-center justify-between px-4 py-3">
        <h1 className="text-lg font-semibold text-accent">Toodoo</h1>
        <div className="flex items-center gap-1">
          <SettingsDialog />
          <ThemeToggle />
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto px-2 pb-4">
        <ul>
          <li>
            <button
              type="button"
              onClick={() => useUiStore.getState().openSearch()}
              className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-bg ${
                view.kind === "search" ? "bg-bg font-medium text-accent" : ""
              }`}
            >
              🔍 Search
            </button>
          </li>
          <li>
            <button
              type="button"
              onClick={() => setView({ kind: "project", projectId: "inbox" })}
              className={`flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-sm hover:bg-bg ${
                view.kind === "project" && view.projectId === "inbox"
                  ? "bg-bg font-medium text-accent"
                  : ""
              }`}
            >
              {t("app.inbox")}
              {(counts?.inbox ?? 0) > 0 && (
                <span className="text-xs text-text-muted">{counts?.inbox}</span>
              )}
            </button>
          </li>
          {smartLists
            .filter((s) => s.visible)
            .map((smart) => {
              const meta = SMART_META[smart.view];
              const active = view.kind === "smart" && view.view === smart.view;
              const count = meta.countKey ? counts?.[meta.countKey] : undefined;
              return (
                <li key={smart.view}>
                  <button
                    type="button"
                    onClick={() => setView({ kind: "smart", view: smart.view })}
                    className={`flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-sm hover:bg-bg ${
                      active ? "bg-bg font-medium text-accent" : ""
                    }`}
                  >
                    {t(`smart.${smart.view}`)}
                    {count !== undefined && count > 0 && (
                      <span className="text-xs text-text-muted">{count}</span>
                    )}
                  </button>
                </li>
              );
            })}
          <li>
            <button
              type="button"
              onClick={() => setView({ kind: "calendar" })}
              className={`flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-sm hover:bg-bg ${
                view.kind === "calendar" ? "bg-bg font-medium text-accent" : ""
              }`}
            >
              Calendar
            </button>
          </li>
          <li>
            <button
              type="button"
              onClick={() => setView({ kind: "focus" })}
              className={`flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-sm hover:bg-bg ${
                view.kind === "focus" ? "bg-bg font-medium text-accent" : ""
              }`}
            >
              Focus
            </button>
          </li>
          <li>
            <button
              type="button"
              onClick={() => setView({ kind: "habits" })}
              className={`flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-sm hover:bg-bg ${
                view.kind === "habits" ? "bg-bg font-medium text-accent" : ""
              }`}
            >
              Habits
            </button>
          </li>
          <li>
            <button
              type="button"
              onClick={() => setView({ kind: "countdown" })}
              className={`flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-sm hover:bg-bg ${
                view.kind === "countdown" ? "bg-bg font-medium text-accent" : ""
              }`}
            >
              Countdown
            </button>
          </li>
          <li>
            <button
              type="button"
              onClick={() => setView({ kind: "sticky" })}
              className={`flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-sm hover:bg-bg ${
                view.kind === "sticky" ? "bg-bg font-medium text-accent" : ""
              }`}
            >
              Sticky Notes
            </button>
          </li>
          <li>
            <button
              type="button"
              onClick={() => setView({ kind: "matrix" })}
              className={`flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-sm hover:bg-bg ${
                view.kind === "matrix" ? "bg-bg font-medium text-accent" : ""
              }`}
            >
              Matrix
            </button>
          </li>
          <li>
            <button
              type="button"
              onClick={() => setView({ kind: "stats" })}
              className={`flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-sm hover:bg-bg ${
                view.kind === "stats" ? "bg-bg font-medium text-accent" : ""
              }`}
            >
              Stats
            </button>
          </li>
        </ul>

        <SidebarProjects />
        <SidebarTags />
        <SidebarFilters />
      </nav>
    </aside>
  );
}
