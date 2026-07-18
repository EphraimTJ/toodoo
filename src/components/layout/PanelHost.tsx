import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../../lib/api";
import { panelKey, useUiStore, type PopoutPanel } from "../../lib/uiStore";
import { FloatingPanel } from "./FloatingPanel";
import { FocusView } from "../../features/focus/components/FocusView";

function StickyPanelBody({ id }: { id: string }) {
  const { data: stickies } = useQuery({ queryKey: ["stickies"], queryFn: api.listStickies });
  const sticky = (stickies ?? []).find((s) => s.id === id);
  return (
    <div
      className="min-h-24 p-3 text-sm"
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

/**
 * Renders the open in-app pop-out panels and auto-opens one whenever the
 * Rust watchdog reports a native pop-out that failed to load
 * (`popout-failed`), so the content stays usable no matter what the native
 * window path does.
 */
export function PanelHost() {
  const panels = useUiStore((s) => s.panels);
  const openPanel = useUiStore((s) => s.openPanel);
  const closePanel = useUiStore((s) => s.closePanel);

  useEffect(() => {
    if (!("__TAURI_INTERNALS__" in window)) return;
    let unlisten: (() => void) | undefined;
    let disposed = false;
    void import("@tauri-apps/api/event").then(({ listen }) =>
      listen<{ label: string; kind: string }>("popout-failed", ({ payload }) => {
        if (payload.kind === "focus") {
          openPanel({ kind: "focus" });
        } else if (payload.kind === "sticky") {
          const id = payload.label.replace(/^sticky-/, "");
          if (id && id !== "diag") openPanel({ kind: "sticky", id });
        }
      }).then((fn) => {
        if (disposed) fn();
        else unlisten = fn;
      }),
    );
    return () => {
      disposed = true;
      unlisten?.();
    };
  }, [openPanel]);

  return (
    <>
      {panels.map((p: PopoutPanel, i) => (
        <FloatingPanel
          key={panelKey(p)}
          title={p.kind === "focus" ? "Focus" : "Sticky"}
          initial={{ x: 80 + i * 32, y: 80 + i * 32 }}
          onClose={() => closePanel(panelKey(p))}
        >
          {p.kind === "focus" ? <FocusView /> : <StickyPanelBody id={p.id} />}
        </FloatingPanel>
      ))}
    </>
  );
}
