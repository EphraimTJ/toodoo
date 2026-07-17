import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";
import { QuickAddBar } from "../features/quickadd/components/QuickAddBar";
import { FocusView } from "../features/focus/components/FocusView";

/** Close the hosting Tauri window (no-op in the browser). */
function closeWindow() {
  if (!("__TAURI_INTERNALS__" in window)) return;
  void import("@tauri-apps/api/window").then(({ getCurrentWindow }) => getCurrentWindow().close());
}

function QuickAddWindow() {
  return (
    <div className="p-3" data-testid="win-quickadd" onKeyDown={(e) => e.key === "Escape" && closeWindow()}>
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
  if (win === "quickadd") return <QuickAddWindow />;
  if (win === "focus") return <FocusWindow />;
  if (win === "sticky" && id) return <StickyWindow id={id} />;
  return <div className="p-4 text-sm text-text-muted">Unknown window.</div>;
}
