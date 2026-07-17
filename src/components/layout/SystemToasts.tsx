import { useEffect, useState } from "react";

interface AppError {
  message: string;
}

/**
 * Main-window toast stack for backend-raised errors (e.g. the pop-out window
 * watchdog destroying a window whose content never loaded). Listens for the
 * Tauri `app-error` event; a `toodoo-app-error` window CustomEvent lets tests
 * drive it in the browser.
 */
export function SystemToasts() {
  const [items, setItems] = useState<AppError[]>([]);

  useEffect(() => {
    const onCustom = (e: Event) => setItems((prev) => [...prev, (e as CustomEvent<AppError>).detail]);
    window.addEventListener("toodoo-app-error", onCustom);

    let unlisten: (() => void) | undefined;
    let disposed = false;
    if ("__TAURI_INTERNALS__" in window) {
      void import("@tauri-apps/api/event").then(({ listen }) =>
        listen<AppError>("app-error", ({ payload }) => setItems((prev) => [...prev, payload])).then((fn) => {
          if (disposed) fn();
          else unlisten = fn;
        }),
      );
    }
    return () => {
      disposed = true;
      unlisten?.();
      window.removeEventListener("toodoo-app-error", onCustom);
    };
  }, []);

  const dismiss = (idx: number) => setItems((prev) => prev.filter((_, i) => i !== idx));

  if (items.length === 0) return null;

  return (
    <div className="fixed bottom-4 left-4 z-50 flex flex-col gap-2" data-testid="system-toasts">
      {items.map((t, idx) => (
        <div
          key={idx}
          role="alert"
          className="w-80 rounded-lg border border-border bg-surface p-3 shadow-xl"
          data-testid="system-toast"
        >
          <div className="flex items-start gap-2">
            <span aria-hidden>⚠️</span>
            <span className="min-w-0 flex-1 text-sm">{t.message}</span>
            <button
              type="button"
              aria-label="Dismiss error"
              className="text-xs text-text-muted hover:text-text"
              onClick={() => dismiss(idx)}
            >
              ✕
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
