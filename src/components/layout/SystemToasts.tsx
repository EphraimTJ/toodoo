import { useEffect, useState } from "react";
import { AlertTriangle, Check, X } from "lucide-react";

interface ToastItem {
  message: string;
  kind: "error" | "info";
}

/**
 * Main-window toast stack. Backend errors arrive on the Tauri `app-error` event;
 * lightweight action confirmations arrive on the `toodoo-toast` window
 * CustomEvent (see `src/lib/toast.ts`). `toodoo-app-error` also drives errors in
 * tests without a Tauri backend. Info toasts auto-dismiss; errors stay until closed.
 */
export function SystemToasts() {
  const [items, setItems] = useState<ToastItem[]>([]);

  useEffect(() => {
    const push = (item: ToastItem) => {
      setItems((prev) => [...prev, item]);
      if (item.kind === "info") {
        window.setTimeout(() => setItems((prev) => prev.slice(1)), 2600);
      }
    };
    const onError = (e: Event) =>
      push({ message: (e as CustomEvent<{ message: string }>).detail.message, kind: "error" });
    const onInfo = (e: Event) =>
      push({ message: (e as CustomEvent<{ message: string }>).detail.message, kind: "info" });
    window.addEventListener("toodoo-app-error", onError);
    window.addEventListener("toodoo-toast", onInfo);

    let unlisten: (() => void) | undefined;
    let disposed = false;
    if ("__TAURI_INTERNALS__" in window) {
      void import("@tauri-apps/api/event").then(({ listen }) =>
        listen<{ message: string }>("app-error", ({ payload }) =>
          push({ message: payload.message, kind: "error" }),
        ).then((fn) => {
          if (disposed) fn();
          else unlisten = fn;
        }),
      );
    }
    return () => {
      disposed = true;
      unlisten?.();
      window.removeEventListener("toodoo-app-error", onError);
      window.removeEventListener("toodoo-toast", onInfo);
    };
  }, []);

  const dismiss = (idx: number) => setItems((prev) => prev.filter((_, i) => i !== idx));

  if (items.length === 0) return null;

  return (
    <div className="fixed bottom-4 left-4 z-50 flex flex-col gap-2" data-testid="system-toasts">
      {items.map((t, idx) => (
        <div
          key={idx}
          role={t.kind === "error" ? "alert" : "status"}
          className="w-80 rounded-lg border border-border bg-surface p-3 shadow-xl"
          data-testid="system-toast"
        >
          <div className="flex items-start gap-2">
            <span aria-hidden className={t.kind === "error" ? "text-destructive" : "text-accent"}>
              {t.kind === "error" ? (
                <AlertTriangle size={15} strokeWidth={1.75} />
              ) : (
                <Check size={15} strokeWidth={2} />
              )}
            </span>
            <span className="min-w-0 flex-1 text-sm">{t.message}</span>
            <button
              type="button"
              aria-label="Dismiss"
              className="text-xs text-text-muted hover:text-text"
              onClick={() => dismiss(idx)}
            >
              <X size={13} strokeWidth={2} />
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
