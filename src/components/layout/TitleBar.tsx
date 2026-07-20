import { useEffect, useState } from "react";

const IS_TAURI = "__TAURI_INTERNALS__" in window;

async function appWindow() {
  const { getCurrentWindow } = await import("@tauri-apps/api/window");
  return getCurrentWindow();
}

const ctrl =
  "flex h-full w-11 items-center justify-center text-text-muted transition-colors hover:bg-muted hover:text-text";

/**
 * Custom window chrome for the frameless main window (decorations: false). A
 * draggable strip with minimize / maximize / close, themed like the app instead
 * of a native OS title bar. Inert (renders, no-ops) outside Tauri.
 */
export function TitleBar() {
  const [maximized, setMaximized] = useState(false);

  useEffect(() => {
    if (!IS_TAURI) return;
    let unlisten: (() => void) | undefined;
    let disposed = false;
    void appWindow().then(async (w) => {
      const sync = async () => setMaximized(await w.isMaximized());
      await sync();
      const fn = await w.onResized(sync);
      if (disposed) fn();
      else unlisten = fn;
    });
    return () => {
      disposed = true;
      unlisten?.();
    };
  }, []);

  const minimize = () => void appWindow().then((w) => w.minimize());
  const toggleMax = () => void appWindow().then((w) => w.toggleMaximize());
  const close = () => void appWindow().then((w) => w.close());

  return (
    <div
      data-tauri-drag-region
      className="flex h-9 shrink-0 select-none items-center justify-end border-b border-border bg-bg"
    >
      <div className="flex h-full">
        <button type="button" aria-label="Minimize" className={ctrl} onClick={minimize}>
          <svg width="11" height="11" viewBox="0 0 11 11" aria-hidden>
            <rect x="1" y="5" width="9" height="1" fill="currentColor" />
          </svg>
        </button>
        <button type="button" aria-label={maximized ? "Restore" : "Maximize"} className={ctrl} onClick={toggleMax}>
          {maximized ? (
            <svg width="11" height="11" viewBox="0 0 11 11" fill="none" stroke="currentColor" strokeWidth="1" aria-hidden>
              <rect x="1.5" y="3" width="6" height="6" />
              <path d="M3.5 3V1.5h6v6H8" />
            </svg>
          ) : (
            <svg width="11" height="11" viewBox="0 0 11 11" fill="none" stroke="currentColor" strokeWidth="1" aria-hidden>
              <rect x="1.5" y="1.5" width="8" height="8" />
            </svg>
          )}
        </button>
        <button
          type="button"
          aria-label="Close"
          className="flex h-full w-11 items-center justify-center text-text-muted transition-colors hover:bg-destructive hover:text-white"
          onClick={close}
        >
          <svg width="11" height="11" viewBox="0 0 11 11" aria-hidden>
            <path d="M1 1l9 9M10 1l-9 9" stroke="currentColor" strokeWidth="1.1" />
          </svg>
        </button>
      </div>
    </div>
  );
}

type Dir = "North" | "South" | "East" | "West" | "NorthEast" | "NorthWest" | "SouthEast" | "SouthWest";
const EDGES: { dir: Dir; cls: string }[] = [
  { dir: "North", cls: "left-2 right-2 top-0 h-1 cursor-ns-resize" },
  { dir: "South", cls: "left-2 right-2 bottom-0 h-1 cursor-ns-resize" },
  { dir: "West", cls: "top-2 bottom-2 left-0 w-1 cursor-ew-resize" },
  { dir: "East", cls: "top-2 bottom-2 right-0 w-1 cursor-ew-resize" },
  { dir: "NorthWest", cls: "top-0 left-0 h-2 w-2 cursor-nwse-resize" },
  { dir: "NorthEast", cls: "top-0 right-0 h-2 w-2 cursor-nesw-resize" },
  { dir: "SouthWest", cls: "bottom-0 left-0 h-2 w-2 cursor-nesw-resize" },
  { dir: "SouthEast", cls: "bottom-0 right-0 h-2 w-2 cursor-nwse-resize" },
];

/** Invisible edge/corner grips that restore resize on the frameless window. */
export function ResizeEdges() {
  if (!IS_TAURI) return null;
  const start = (dir: Dir) => (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    void appWindow().then((w) => w.startResizeDragging(dir as never));
  };
  return (
    <>
      {EDGES.map(({ dir, cls }) => (
        <div key={dir} className={`fixed z-[70] ${cls}`} onPointerDown={start(dir)} aria-hidden />
      ))}
    </>
  );
}
