import { useEffect } from "react";
import { Sidebar } from "./Sidebar";
import { ListPane } from "./ListPane";
import { DetailPane } from "./DetailPane";
import { CommandPalette } from "../../features/search/components/CommandPalette";
import { api } from "../../lib/api";
import { useDomainEvents } from "../../lib/useDomainEvents";

export function AppShell() {
  useDomainEvents();

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
  return (
    <div className="flex h-full">
      <Sidebar />
      <ListPane />
      <DetailPane />
      <CommandPalette />
    </div>
  );
}
