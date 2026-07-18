import { useRef, useState, type ReactNode } from "react";

/**
 * A draggable always-on-top-within-the-app floating panel — the in-app
 * fallback surface for focus/sticky pop-outs (native windows can fail to
 * load their webview on some machines; this cannot).
 */
export function FloatingPanel({
  title,
  onClose,
  children,
  initial,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  initial?: { x: number; y: number };
}) {
  const [pos, setPos] = useState(initial ?? { x: 80, y: 80 });
  const drag = useRef<{ dx: number; dy: number } | null>(null);

  const onPointerDown = (e: React.PointerEvent) => {
    drag.current = { dx: e.clientX - pos.x, dy: e.clientY - pos.y };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!drag.current) return;
    setPos({
      x: Math.max(0, e.clientX - drag.current.dx),
      y: Math.max(0, e.clientY - drag.current.dy),
    });
  };
  const onPointerUp = () => {
    drag.current = null;
  };

  return (
    <div
      className="fixed z-50 w-72 rounded-lg border border-border bg-surface shadow-xl"
      style={{ left: pos.x, top: pos.y }}
      data-testid="floating-panel"
    >
      <div
        className="flex cursor-move items-center gap-2 rounded-t-lg border-b border-border px-3 py-1.5"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
      >
        <span className="min-w-0 flex-1 truncate text-xs font-semibold">{title}</span>
        <button
          type="button"
          aria-label={`Close ${title} panel`}
          className="text-xs text-text-muted hover:text-text"
          onClick={onClose}
        >
          ✕
        </button>
      </div>
      <div className="max-h-96 overflow-auto">{children}</div>
    </div>
  );
}
