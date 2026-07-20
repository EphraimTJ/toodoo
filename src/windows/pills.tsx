import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";
import type { FocusBroadcast } from "../features/focus/FocusProvider";
import { formatClock } from "../features/focus/lib/pomodoro";
import {
  IS_TAURI,
  closeThisWindow,
  emitFocusCmd,
  pinWindowTop,
  setWindowSize,
  usePersistedWindowBox,
  useWindowBackground,
} from "./pillUtils";

/** "transparent" only when the window chrome is the true transparent pill. */
function usePillBackground(solidColor: string): string {
  const { data: cfg } = useQuery({ queryKey: ["desktopConfig"], queryFn: api.desktopConfig });
  return cfg && cfg.popoutStyle !== "pill" ? solidColor : "transparent";
}

const STICKY_COLORS = ["#ffd97d", "#a3e4b7", "#a7c7ff", "#f7a8c4", "#d7bde2", "#e0e0e0"];

/** Pill sizes (logical px). */
const PILL_W = 210;
const PILL_H = 64;
const DOCK_W = 220;
const DOCK_H = 12;
/** Extra window height while the overflow menu is open (it can't overflow
 *  the OS window, so the window grows to fit it). */
const MENU_H = 130;

const pillTransition =
  "transition-[opacity,transform] duration-200 motion-reduce:transition-none";

function useFocusState(): FocusBroadcast | null {
  const [state, setState] = useState<FocusBroadcast | null>(null);
  useEffect(() => {
    if (!IS_TAURI) return;
    let unlisten: (() => void) | undefined;
    let disposed = false;
    void import("@tauri-apps/api/event").then(({ listen }) =>
      listen<FocusBroadcast>("focus-state", ({ payload }) => setState(payload)).then((fn) => {
        if (disposed) fn();
        else unlisten = fn;
      }),
    );
    emitFocusCmd("ping");
    return () => {
      disposed = true;
      unlisten?.();
    };
  }, []);
  return state;
}

/** Circular progress ring per the TickTick reference: thin track, accent arc. */
function Ring({ progress, size = 40 }: { progress: number; size?: number }) {
  const r = (size - 5) / 2;
  const c = 2 * Math.PI * r;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden data-tauri-drag-region>
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke="rgba(255,255,255,0.16)"
        strokeWidth="2.5"
        pointerEvents="none"
      />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke="var(--color-accent, #5d7052)"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeDasharray={c}
        strokeDashoffset={c * (1 - Math.min(1, Math.max(0, progress)))}
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
        pointerEvents="none"
      />
    </svg>
  );
}

/**
 * The TickTick-style mini focus pill: dark rounded pill, ring + mm:ss;
 * hovering expands the controls; dragging it to the top screen edge docks it
 * into a slim progress bar, hovering the bar slides the pill back out.
 */
export function FocusPillWindow() {
  useWindowBackground(usePillBackground("#1f1e1a"));
  const state = useFocusState();
  const [hover, setHover] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [docked, setDocked] = useState(false);
  const collapseTimer = useRef<number | undefined>(undefined);
  const dockedRef = useRef(docked);
  dockedRef.current = docked;

  usePersistedWindowBox(
    "popout:focus",
    (y) => {
      // Touching the top screen edge docks the pill into the slim bar.
      if (y <= 0 && !dockedRef.current) {
        setDocked(true);
        setMenuOpen(false);
        void setWindowSize(DOCK_W, DOCK_H);
        void pinWindowTop(0);
      }
    },
    // The pill manages its own size (menu expansion, docking) — persist
    // position only, or a menu-open height would stick across reopens.
    { positionOnly: true },
  );

  // The OS window is exactly pill-height, so a dropdown can't overflow it —
  // grow the window while the menu is open and shrink back after.
  useEffect(() => {
    if (dockedRef.current) return;
    void setWindowSize(PILL_W, PILL_H + (menuOpen ? MENU_H : 0));
  }, [menuOpen]);

  const undock = () => {
    setDocked(false);
    void setWindowSize(PILL_W, PILL_H);
    void pinWindowTop(0);
  };

  const onEnter = () => {
    window.clearTimeout(collapseTimer.current);
    if (dockedRef.current) undock();
    else setHover(true);
  };
  const onLeave = () => {
    collapseTimer.current = window.setTimeout(() => {
      setHover(false);
      setMenuOpen(false);
    }, 400);
  };

  const clock =
    state == null
      ? "--:--"
      : state.mode === "pomo"
        ? formatClock(state.remaining)
        : formatClock(state.elapsed);
  const progress =
    state && state.mode === "pomo" && state.totalSec > 0
      ? 1 - state.remaining / state.totalSec
      : 0;

  if (docked) {
    return (
      <div
        className="flex h-screen w-screen items-center overflow-hidden rounded-b-md bg-[#1f1e1a]/95 px-1"
        data-testid="focus-pill-docked"
        onMouseEnter={onEnter}
      >
        <div className="h-1 w-full rounded-full bg-white/10">
          <div
            className="h-1 rounded-full"
            style={{ width: `${Math.round(progress * 100)}%`, background: "var(--color-accent, #4f9cf9)" }}
          />
        </div>
      </div>
    );
  }

  return (
    <div
      className="flex h-screen w-screen flex-col overflow-hidden select-none"
      onMouseEnter={onEnter}
      onMouseLeave={onLeave}
    >
      <div
        className="flex shrink-0 items-center rounded-full bg-[#1f1e1a]/95 px-2.5 text-white"
        style={{ height: PILL_H - 4, marginTop: 2 }}
        data-testid="focus-pill"
        data-tauri-drag-region
      >
        <div className="relative flex shrink-0 items-center justify-center" data-tauri-drag-region>
          <Ring progress={progress} />
          <span
            className="absolute font-mono text-[11px] tabular-nums"
            data-tauri-drag-region
            style={{ pointerEvents: "none" }}
          >
            {clock}
          </span>
        </div>

        <div
          className={`ml-2 flex items-center gap-1 ${pillTransition} ${hover ? "opacity-100" : "opacity-0"}`}
        >
          {state?.running ? (
            <button
              type="button"
              aria-label="Pause"
              className="rounded-full p-1.5 text-accent hover:bg-white/10"
              onClick={() => emitFocusCmd("pause")}
            >
              <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor" aria-hidden>
                <rect x="1.5" y="1" width="3.2" height="10" rx="1" />
                <rect x="7.3" y="1" width="3.2" height="10" rx="1" />
              </svg>
            </button>
          ) : (
            <button
              type="button"
              aria-label={state?.active ? "Resume" : "Start"}
              className="rounded-full p-1.5 text-accent hover:bg-white/10"
              onClick={() => emitFocusCmd(state?.active ? "resume" : "start")}
            >
              <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor" aria-hidden>
                <path d="M2.5 1.2v9.6L10.6 6z" />
              </svg>
            </button>
          )}
          <button
            type="button"
            aria-label="More"
            className="rounded-full p-1.5 hover:bg-white/10"
            onClick={() => setMenuOpen((o) => !o)}
          >
            <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor" aria-hidden>
              <circle cx="2" cy="6" r="1.2" />
              <circle cx="6" cy="6" r="1.2" />
              <circle cx="10" cy="6" r="1.2" />
            </svg>
          </button>
          <button
            type="button"
            aria-label="Close focus pill"
            className="rounded-full p-1.5 hover:bg-white/10 hover:text-[#e88b7d]"
            onClick={closeThisWindow}
          >
            <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden>
              <path d="M2 2l8 8M10 2l-8 8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
            </svg>
          </button>
        </div>
      </div>

      {/* The menu renders below the pill in the window space grown for it —
          an absolutely-positioned dropdown would be clipped at the window
          edge (the window is otherwise exactly pill-sized). */}
      {menuOpen && (
        <div
          className="ml-auto mr-2 mt-1 w-36 rounded-md border border-white/10 bg-neutral-800 py-1 text-xs text-white shadow-xl"
          data-testid="focus-pill-menu"
        >
          <button
            type="button"
            className="block w-full px-3 py-1 text-left hover:bg-white/10"
            onClick={() => void api.showMainWindow()}
          >
            Open Toodoo
          </button>
          <button
            type="button"
            className="block w-full px-3 py-1 text-left hover:bg-white/10 disabled:opacity-40"
            disabled={state?.active}
            onClick={() => emitFocusCmd("toggle-mode")}
          >
            Switch mode
          </button>
          {state?.active && (
            <button
              type="button"
              className="block w-full px-3 py-1 text-left hover:bg-white/10"
              onClick={() => emitFocusCmd("stop")}
            >
              Stop session
            </button>
          )}
          <button
            type="button"
            className="block w-full px-3 py-1 text-left hover:bg-white/10"
            onClick={closeThisWindow}
          >
            Close
          </button>
        </div>
      )}
    </div>
  );
}

/**
 * Sticky pill: the sticky's text on its color, frameless and rounded, body
 * drag, corner-grip resize, hover menu with color swatches.
 */
export function StickyPillWindow({ id }: { id: string }) {
  usePersistedWindowBox(`popout:sticky-${id}`);
  const [hover, setHover] = useState(false);
  const grip = useRef<{ startX: number; startY: number; w: number; h: number } | null>(null);
  const { data: stickies, refetch } = useQuery({ queryKey: ["stickies"], queryFn: api.listStickies });
  const sticky = (stickies ?? []).find((s) => s.id === id);
  useWindowBackground(usePillBackground(sticky?.color ?? "#ffd97d"));

  const onGripDown = (e: React.PointerEvent) => {
    grip.current = {
      startX: e.screenX,
      startY: e.screenY,
      w: window.innerWidth,
      h: window.innerHeight,
    };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };
  const onGripMove = (e: React.PointerEvent) => {
    if (!grip.current) return;
    const w = Math.max(160, grip.current.w + (e.screenX - grip.current.startX));
    const h = Math.max(120, grip.current.h + (e.screenY - grip.current.startY));
    void setWindowSize(w, h);
  };
  const onGripUp = () => {
    grip.current = null;
  };

  const setColor = async (color: string) => {
    if (!sticky) return;
    await api.updateSticky(sticky.id, { color });
    void refetch();
  };

  return (
    <div
      className="relative flex h-screen w-screen flex-col overflow-hidden rounded-xl text-sm text-neutral-900 select-none"
      style={{ background: sticky?.color ?? "#ffd97d" }}
      data-testid="sticky-pill"
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      <div className="flex items-center gap-1 px-3 pt-2" data-tauri-drag-region>
        <span className="min-w-0 flex-1 truncate font-semibold" data-tauri-drag-region>
          {sticky?.title ?? "Sticky"}
        </span>
        <div className={`flex items-center gap-1 ${pillTransition} ${hover ? "opacity-100" : "opacity-0"}`}>
          {STICKY_COLORS.map((c) => (
            <button
              key={c}
              type="button"
              aria-label={`Color ${c}`}
              className="h-3.5 w-3.5 rounded-full border border-black/20"
              style={{ background: c }}
              onClick={() => void setColor(c)}
            />
          ))}
          <button
            type="button"
            aria-label="Open Toodoo"
            className="ml-1 rounded p-0.5 text-neutral-700 hover:bg-black/10"
            onClick={() => void api.showMainWindow()}
          >
            ⌂
          </button>
          <button
            type="button"
            aria-label="Close sticky"
            className="rounded p-0.5 text-neutral-700 hover:bg-black/10"
            onClick={closeThisWindow}
          >
            ✕
          </button>
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-auto whitespace-pre-wrap px-3 pb-3 pt-1" data-tauri-drag-region>
        {sticky ? sticky.contentPlain : "Sticky not found."}
      </div>
      <div
        aria-label="Resize sticky"
        className="absolute bottom-0 right-0 h-4 w-4 cursor-nwse-resize"
        onPointerDown={onGripDown}
        onPointerMove={onGripMove}
        onPointerUp={onGripUp}
      >
        <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden className="text-black/30">
          <path d="M15 9v6H9zM15 3v3h-3z" fill="currentColor" />
        </svg>
      </div>
    </div>
  );
}
