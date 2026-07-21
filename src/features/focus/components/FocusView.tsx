import { useState } from "react";
import { ExternalLink } from "lucide-react";
import { openPopout } from "../../../lib/popout";
import { useFocusSettings } from "../hooks/useFocusSettings";
import { AmbientControls } from "./AmbientControls";
import { FocusTimer } from "./FocusTimer";
import { FocusStats } from "./FocusStats";
import { FocusRecords } from "./FocusRecords";
import { FocusSettings } from "./FocusSettings";

type Tab = "timer" | "stats" | "records" | "settings";
const TABS: [Tab, string][] = [
  ["timer", "Timer"],
  ["stats", "Statistics"],
  ["records", "Records"],
  ["settings", "Settings"],
];

export function FocusView() {
  const [tab, setTab] = useState<Tab>("timer");
  const { config } = useFocusSettings();

  return (
    <div className="flex h-full min-w-0 flex-1 flex-col">
      <header className="flex items-center gap-1 border-b border-border px-4 py-2">
        <h2 className="mr-3 text-base font-semibold">Focus</h2>
        {TABS.map(([t, label]) => (
          <button
            key={t}
            type="button"
            aria-pressed={tab === t}
            onClick={() => setTab(t)}
            className={`rounded-md px-3 py-1 text-sm ${tab === t ? "bg-surface font-medium text-accent" : "text-text-muted hover:bg-surface"}`}
          >
            {label}
          </button>
        ))}
        {"__TAURI_INTERNALS__" in window && new URLSearchParams(location.search).get("win") !== "focus" && (
          <button
            type="button"
            aria-label="Pop out focus window"
            title="Open an always-on-top focus window"
            onClick={() => void openPopout({ kind: "focus" })}
            className="ml-auto flex items-center rounded-md px-2 py-1 text-text-muted hover:bg-surface"
          >
            <ExternalLink size={15} strokeWidth={1.75} />
          </button>
        )}
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {tab === "timer" && (
          <>
            <FocusTimer config={config} />
            <AmbientControls />
          </>
        )}
        {tab === "stats" && <FocusStats />}
        {tab === "records" && <FocusRecords />}
        {tab === "settings" && <FocusSettings />}
      </div>
    </div>
  );
}
