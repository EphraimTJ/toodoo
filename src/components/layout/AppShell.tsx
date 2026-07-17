import { useEffect } from "react";
import { Sidebar } from "./Sidebar";
import { ListPane } from "./ListPane";
import { DetailPane } from "./DetailPane";
import { CommandPalette } from "../../features/search/components/CommandPalette";
import { ReminderToasts } from "../../features/reminders/components/ReminderToasts";
import { SystemToasts } from "./SystemToasts";
import { SampleDataPrompt } from "./SampleDataPrompt";
import { ShortcutCheatsheet } from "../../features/shortcuts/components/ShortcutCheatsheet";
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

  return (
    <div className="flex h-full">
      <Sidebar />
      <ListPane />
      <DetailPane />
      <CommandPalette />
      <ReminderToasts />
      <SystemToasts />
      <SampleDataPrompt />
      <ShortcutCheatsheet />
    </div>
  );
}
