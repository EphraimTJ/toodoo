import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { api } from "../../../lib/api";

interface Fired {
  taskId: string;
  reminderId: string;
  title: string;
}

/**
 * In-app Complete / Snooze popover for fired reminders — the reliable action
 * path across OSes (native notification buttons are best-effort). Listens for
 * the backend `reminder-fired` event; a `toodoo-reminder-fired` window
 * CustomEvent lets tests drive it in the browser.
 */
export function ReminderToasts() {
  const queryClient = useQueryClient();
  const [items, setItems] = useState<Fired[]>([]);

  useEffect(() => {
    const onCustom = (e: Event) => setItems((prev) => [...prev, (e as CustomEvent<Fired>).detail]);
    window.addEventListener("toodoo-reminder-fired", onCustom);

    let unlisten: (() => void) | undefined;
    let disposed = false;
    if ("__TAURI_INTERNALS__" in window) {
      void import("@tauri-apps/api/event").then(({ listen }) =>
        listen<Fired>("reminder-fired", ({ payload }) => setItems((prev) => [...prev, payload])).then((fn) => {
          if (disposed) fn();
          else unlisten = fn;
        }),
      );
    }
    return () => {
      disposed = true;
      unlisten?.();
      window.removeEventListener("toodoo-reminder-fired", onCustom);
    };
  }, []);

  const dismiss = (idx: number) => setItems((prev) => prev.filter((_, i) => i !== idx));

  const complete = async (f: Fired, idx: number) => {
    await api.completeTask(f.taskId);
    void queryClient.invalidateQueries({ queryKey: ["tasks"] });
    dismiss(idx);
  };
  const snooze = async (f: Fired, idx: number) => {
    await api.snoozeReminder(f.reminderId, new Date(Date.now() + 10 * 60_000).toISOString());
    dismiss(idx);
  };

  if (items.length === 0) return null;

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2" data-testid="reminder-toasts">
      {items.map((f, idx) => (
        <div
          key={`${f.reminderId}-${idx}`}
          className="w-72 rounded-lg border border-border bg-surface p-3 shadow-xl"
          data-testid="reminder-toast"
        >
          <div className="flex items-start gap-2">
            <span aria-hidden>🔔</span>
            <span className="min-w-0 flex-1 truncate text-sm font-medium">{f.title}</span>
            <button
              type="button"
              aria-label="Dismiss reminder"
              className="text-xs text-text-muted hover:text-text"
              onClick={() => dismiss(idx)}
            >
              ✕
            </button>
          </div>
          <div className="mt-2 flex gap-2">
            <button
              type="button"
              className="rounded-md bg-accent px-2.5 py-1 text-xs text-accent-fg"
              onClick={() => void complete(f, idx)}
            >
              Complete
            </button>
            <button
              type="button"
              className="rounded-md border border-border px-2.5 py-1 text-xs hover:bg-bg"
              onClick={() => void snooze(f, idx)}
            >
              Snooze 10m
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
