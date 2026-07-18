import { useRef } from "react";

/**
 * Draggable, keyboard-accessible divider between panes. Drag resizes; double
 * click (or Enter) resets; arrow keys nudge ±16 px; Home/End jump to min/max.
 */
export function PaneDivider({
  label,
  value,
  min,
  max,
  /** +1 when dragging right grows the pane (sidebar), -1 when it shrinks it (detail). */
  direction,
  onResize,
  onReset,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  direction: 1 | -1;
  onResize: (width: number) => void;
  onReset: () => void;
}) {
  const drag = useRef<{ startX: number; base: number } | null>(null);

  return (
    <div
      role="separator"
      aria-label={label}
      aria-orientation="vertical"
      aria-valuenow={Math.round(value)}
      aria-valuemin={min}
      aria-valuemax={max}
      tabIndex={0}
      className="w-1 shrink-0 cursor-col-resize bg-transparent transition-colors hover:bg-accent/40 focus-visible:bg-accent/60 focus-visible:outline-none"
      data-testid={`divider-${label.toLowerCase().replace(/\s+/g, "-")}`}
      onPointerDown={(e) => {
        drag.current = { startX: e.clientX, base: value };
        (e.target as HTMLElement).setPointerCapture(e.pointerId);
      }}
      onPointerMove={(e) => {
        if (!drag.current) return;
        onResize(drag.current.base + direction * (e.clientX - drag.current.startX));
      }}
      onPointerUp={() => {
        drag.current = null;
      }}
      onDoubleClick={onReset}
      onKeyDown={(e) => {
        if (e.key === "ArrowLeft") onResize(value - 16 * direction);
        else if (e.key === "ArrowRight") onResize(value + 16 * direction);
        else if (e.key === "Home") onResize(min);
        else if (e.key === "End") onResize(max);
        else if (e.key === "Enter") onReset();
        else return;
        e.preventDefault();
      }}
    />
  );
}
