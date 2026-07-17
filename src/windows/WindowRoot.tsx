import { Component, useEffect, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";
import { QuickAddBar } from "../features/quickadd/components/QuickAddBar";
import { FocusView } from "../features/focus/components/FocusView";

/** Close the hosting Tauri window (no-op in the browser). */
function closeWindow() {
  if (!("__TAURI_INTERNALS__" in window)) return;
  void import("@tauri-apps/api/window").then(({ getCurrentWindow }) => getCurrentWindow().close());
}

/** Forward a pop-out window's error to the Rust log (stderr), so a packaged
 *  build's white screen becomes a diagnosable `[window-error]` line. */
function reportWindowError(message: string) {
  console.error(`[window-error] ${message}`);
  if (!("__TAURI_INTERNALS__" in window)) return;
  void import("@tauri-apps/api/core").then(({ invoke }) =>
    invoke("log_window_error", { message, win: location.search }).catch(() => {}),
  );
}

/** A crash in a pop-out window renders the error instead of a white screen. */
class WindowErrorBoundary extends Component<{ children: ReactNode }, { error: string | null }> {
  state = { error: null as string | null };
  static getDerivedStateFromError(err: unknown) {
    return { error: err instanceof Error ? `${err.name}: ${err.message}` : String(err) };
  }
  componentDidCatch(err: unknown) {
    reportWindowError(err instanceof Error ? (err.stack ?? err.message) : String(err));
  }
  render() {
    if (this.state.error) {
      return (
        <div className="p-4 text-sm">
          <div className="font-semibold text-red-600">This window hit an error.</div>
          <div className="mt-1 break-words text-text-muted">{this.state.error}</div>
        </div>
      );
    }
    return this.props.children;
  }
}

function QuickAddWindow() {
  return (
    <div className="p-3" data-testid="win-quickadd">
      <h1 className="mb-1 px-1 text-xs font-semibold uppercase tracking-wide text-text-muted">Quick add</h1>
      <QuickAddBar defaults={{ projectId: "inbox" }} />
    </div>
  );
}

function FocusWindow() {
  return (
    <div className="h-full" data-testid="win-focus">
      <FocusView />
    </div>
  );
}

function StickyWindow({ id }: { id: string }) {
  const { data: stickies } = useQuery({ queryKey: ["stickies"], queryFn: api.listStickies });
  const sticky = (stickies ?? []).find((s) => s.id === id);
  return (
    <div
      className="h-screen w-screen overflow-auto p-3 text-sm"
      data-testid="win-sticky"
      style={{ background: sticky?.color ?? "var(--color-surface)" }}
    >
      {sticky ? (
        <>
          <div className="mb-1 font-semibold">{sticky.title}</div>
          <div className="whitespace-pre-wrap">{sticky.contentPlain}</div>
        </>
      ) : (
        <div className="text-text-muted">Sticky not found.</div>
      )}
    </div>
  );
}

/** Minimal shells for the always-on-top pop-out/mini windows, selected by the
 *  `?win=` query the app was launched with. */
export function WindowRoot({ win, id }: { win: string; id: string | null }) {
  // Surface uncaught errors/rejections too — render errors go through the
  // boundary, but a failed async import or event handler would otherwise
  // leave a silent white window.
  useEffect(() => {
    const onError = (e: ErrorEvent) => reportWindowError(e.message);
    const onRejection = (e: PromiseRejectionEvent) =>
      reportWindowError(`unhandled rejection: ${String(e.reason)}`);
    // Esc closes every pop-out window (belt-and-braces beside the title-bar
    // close button); a window-level listener works regardless of focus.
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeWindow();
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);
    // Boot beacon: proves the SPA loaded in this window — a white screen
    // without this log line means the page itself never loaded. `win=nobeacon`
    // suppresses it deliberately so the Rust watchdog path can be exercised.
    if ("__TAURI_INTERNALS__" in window && win !== "nobeacon") {
      void import("@tauri-apps/api/core").then(({ invoke }) =>
        invoke("log_window_error", { message: "booted ok", win: location.search }).catch(() => {}),
      );
    }
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejection);
    };
  }, []);

  let body = <div className="p-4 text-sm text-text-muted">Unknown window.</div>;
  if (win === "quickadd") body = <QuickAddWindow />;
  if (win === "focus") body = <FocusWindow />;
  if (win === "sticky" && id) body = <StickyWindow id={id} />;
  return <WindowErrorBoundary>{body}</WindowErrorBoundary>;
}
