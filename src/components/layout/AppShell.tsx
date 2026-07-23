import { useEffect } from "react";
import { Sidebar } from "./Sidebar";
import { ListPane } from "./ListPane";
import { DetailPane } from "./DetailPane";
import { CommandPalette } from "../../features/search/components/CommandPalette";
import { ReminderToasts } from "../../features/reminders/components/ReminderToasts";
import { SystemToasts } from "./SystemToasts";
import { SampleDataPrompt } from "./SampleDataPrompt";
import { PanelHost } from "./PanelHost";
import { FocusProvider } from "../../features/focus/FocusProvider";
import { PaneDivider } from "./PaneDivider";
import { PANE_LIMITS, usePaneWidths } from "./usePaneWidths";
import { ShortcutCheatsheet } from "../../features/shortcuts/components/ShortcutCheatsheet";
import { AppDialogs } from "../ui/AppDialogs";
import { ResizeEdges, TitleBar } from "./TitleBar";
import { useShortcuts } from "../../features/shortcuts/useShortcuts";
import { api } from "../../lib/api";
import { useUiStore } from "../../lib/uiStore";
import { useDomainEvents } from "../../lib/useDomainEvents";
import { useDeepLinks } from "../../lib/useDeepLinks";

export function AppShell() {
  useDomainEvents();
  useDeepLinks();
  useShortcuts();

  // Dev-only perf fixture (§8 budget): Ctrl+Shift+F9 seeds 10k tasks.
  // The backend command refuses to run in release builds.
  useEffect(() => {
    if (!import.meta.env.DEV) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "F9" && e.ctrlKey && e.shiftKey) void api.seedDemoData(10_000);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Tray "Open Today" focuses the window and switches to the Today list.
  useEffect(() => {
    if (!("__TAURI_INTERNALS__" in window)) return;
    let unlisten: (() => void) | undefined;
    let disposed = false;
    void import("@tauri-apps/api/event").then(({ listen }) =>
      listen("open-view", () => useUiStore.getState().setView({ kind: "smart", view: "today" })).then((fn) => {
        if (disposed) fn();
        else unlisten = fn;
      }),
    );
    return () => {
      disposed = true;
      unlisten?.();
    };
  }, []);

  const { widths, setPane, resetPane } = usePaneWidths();
  // The detail pane is a focused surface: it appears only while a task is
  // selected and slides away when selection clears (e.g. `setView` on any
  // sidebar/menu click resets `selectedTaskId`).
  const selectedTaskId = useUiStore((s) => s.selectedTaskId);

  // Click-away: clicking anything that isn't the pane itself, a selectable
  // task surface (row / kanban card / calendar), or floating UI (menus,
  // popovers, dialogs) deselects the task and closes the pane. Selectable
  // surfaces re-select on their own click handlers, which run after this.
  useEffect(() => {
    if (!selectedTaskId) return;
    const KEEP =
      '[data-detail-pane], [data-testid="task-row"], [data-testid="kanban-card"], ' +
      '[aria-label="Resize detail pane"], [data-radix-popper-content-wrapper], ' +
      '[role="dialog"], [role="menu"], [role="listbox"], .fc';
    const onDown = (e: MouseEvent) => {
      const el = e.target as HTMLElement | null;
      if (el?.closest(KEEP)) return;
      useUiStore.getState().selectTask(null);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [selectedTaskId]);

  return (
    <FocusProvider>
      <div className="flex h-full flex-col">
        <TitleBar />
        <div className="flex min-h-0 flex-1">
          <Sidebar width={widths.sidebar} />
          <PaneDivider
            label="Resize sidebar"
            value={widths.sidebar}
            min={PANE_LIMITS.sidebar.min}
            max={PANE_LIMITS.sidebar.max}
            direction={1}
            onResize={(w) => setPane("sidebar", w)}
            onReset={() => resetPane("sidebar")}
          />
          <ListPane />
          {selectedTaskId && (
            <>
              <PaneDivider
                label="Resize detail pane"
                value={widths.detail}
                min={PANE_LIMITS.detail.min}
                max={PANE_LIMITS.detail.max}
                direction={-1}
                onResize={(w) => setPane("detail", w)}
                onReset={() => resetPane("detail")}
              />
              <DetailPane width={widths.detail} />
            </>
          )}
        </div>
        <CommandPalette />
        <ReminderToasts />
        <SystemToasts />
        <SampleDataPrompt />
        <PanelHost />
        <ShortcutCheatsheet />
        <AppDialogs />
        <ResizeEdges />
      </div>
    </FocusProvider>
  );
}
