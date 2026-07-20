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

// Nav rows are soft moss pills — active fills gently, hover warms with stone.
const navBase =
  "flex w-full items-center justify-between gap-2 rounded-full px-3 py-1.5 text-left text-sm transition-colors";
const navCls = (active: boolean): string =>
  `${navBase} ${active ? "bg-accent/12 font-semibold text-accent" : "text-text hover:bg-muted"}`;

export function Sidebar({ width }: { width?: number } = {}) {
  const { t } = useTranslation();
  const { view, setView } = useUiStore();
  const { data: counts } = useSmartCounts();
  const { items: smartLists } = useSmartLists();

  return (
    <aside
      aria-label="Sidebar"
      className="flex shrink-0 flex-col border-r border-border bg-surface"
      style={{ width: width ?? 240 }}
    >
      <div className="flex items-center justify-between px-4 py-3">
        <div className="flex items-center gap-2">
          <span
            aria-hidden="true"
            className="flex h-8 w-8 items-center justify-center bg-accent text-accent-fg shadow-soft"
            style={{ borderRadius: "62% 38% 45% 55% / 58% 52% 48% 42%" }}
          >
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M11 20A7 7 0 0 1 4 13c0-3 2-6 7-9 5 3 7 6 7 9a7 7 0 0 1-7 7Z" />
              <path d="M11 20v-8" />
            </svg>
          </span>
          <h1 className="font-display text-xl font-semibold text-text">Toodoo</h1>
        </div>
        <div className="flex items-center gap-1">
          <SettingsDialog />
          <ThemeToggle />
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto px-2 pb-4">
        <ul className="flex flex-col gap-0.5">
          <li>
            <button
              type="button"
              onClick={() => useUiStore.getState().openSearch()}
              className={navCls(view.kind === "search")}
            >
              <span className="flex items-center gap-2">🔍 Search</span>
            </button>
          </li>
          <li>
            <button
              type="button"
              onClick={() => setView({ kind: "project", projectId: "inbox" })}
              className={navCls(view.kind === "project" && view.projectId === "inbox")}
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
                    className={navCls(active)}
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
            <button type="button" onClick={() => setView({ kind: "calendar" })} className={navCls(view.kind === "calendar")}>
              Calendar
            </button>
          </li>
          <li>
            <button type="button" onClick={() => setView({ kind: "focus" })} className={navCls(view.kind === "focus")}>
              Focus
            </button>
          </li>
          <li>
            <button type="button" onClick={() => setView({ kind: "habits" })} className={navCls(view.kind === "habits")}>
              Habits
            </button>
          </li>
          <li>
            <button type="button" onClick={() => setView({ kind: "countdown" })} className={navCls(view.kind === "countdown")}>
              Countdown
            </button>
          </li>
          <li>
            <button type="button" onClick={() => setView({ kind: "sticky" })} className={navCls(view.kind === "sticky")}>
              Sticky Notes
            </button>
          </li>
          <li>
            <button type="button" onClick={() => setView({ kind: "matrix" })} className={navCls(view.kind === "matrix")}>
              Matrix
            </button>
          </li>
          <li>
            <button type="button" onClick={() => setView({ kind: "stats" })} className={navCls(view.kind === "stats")}>
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
