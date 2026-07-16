import { useRef, useState } from "react";
import type { StickyView } from "../../../lib/api";
import { useTaskMutations } from "../../tasks/hooks/useTasks";
import { useSticky } from "../hooks/useSticky";

const COLORS = ["#ffd97d", "#a3e4b7", "#a7c7ff", "#f7a8c4", "#d7bde2", "#e0e0e0"];

function StickyCard({
  sticky,
  onMove,
  onColor,
  onClose,
}: {
  sticky: StickyView;
  onMove(id: string, x: number, y: number): void;
  onColor(id: string, color: string): void;
  onClose(id: string): void;
}) {
  const { updateTask } = useTaskMutations();
  const [pos, setPos] = useState({ x: sticky.x, y: sticky.y });
  const drag = useRef<{ dx: number; dy: number } | null>(null);

  const onPointerDown = (e: React.PointerEvent) => {
    drag.current = { dx: e.clientX - pos.x, dy: e.clientY - pos.y };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!drag.current) return;
    setPos({ x: Math.max(0, e.clientX - drag.current.dx), y: Math.max(0, e.clientY - drag.current.dy) });
  };
  const onPointerUp = () => {
    if (!drag.current) return;
    drag.current = null;
    onMove(sticky.id, pos.x, pos.y);
  };

  return (
    <div
      data-testid="sticky-card"
      className="absolute flex flex-col rounded-md shadow-md"
      style={{ left: pos.x, top: pos.y, width: sticky.w, height: sticky.h, backgroundColor: sticky.color ?? "#ffd97d" }}
    >
      <div
        className="flex cursor-grab items-center gap-1 rounded-t-md px-2 py-1"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        role="toolbar"
        aria-label={`Sticky ${sticky.title}`}
      >
        <div className="flex gap-1">
          {COLORS.map((c) => (
            <button
              key={c}
              type="button"
              aria-label={`Color ${c}`}
              onClick={() => onColor(sticky.id, c)}
              className="h-3 w-3 rounded-full border border-black/20"
              style={{ backgroundColor: c }}
            />
          ))}
        </div>
        <button
          type="button"
          aria-label={`Close ${sticky.title}`}
          onClick={() => onClose(sticky.id)}
          className="ml-auto text-xs text-black/50 hover:text-black"
        >
          ✕
        </button>
      </div>
      <textarea
        defaultValue={sticky.title}
        aria-label="Sticky text"
        onBlur={(e) => {
          const title = e.target.value.trim();
          if (title && title !== sticky.title) updateTask.mutate({ id: sticky.noteId, patch: { title } });
        }}
        className="flex-1 resize-none rounded-b-md bg-transparent p-2 text-sm text-black outline-none"
      />
    </div>
  );
}

export function StickyBoard() {
  const { query, newSticky, updateSticky, closeSticky } = useSticky();
  const stickies = query.data ?? [];

  return (
    <div className="flex h-full min-w-0 flex-1 flex-col">
      <header className="flex items-center gap-2 border-b border-border px-4 py-2.5">
        <h2 className="text-base font-semibold">Sticky Notes</h2>
        <button
          type="button"
          onClick={() => newSticky.mutate("New note")}
          className="ml-auto rounded-md border border-border px-2 py-1 text-xs hover:border-accent"
        >
          + New sticky
        </button>
      </header>

      <div className="relative min-h-0 flex-1 overflow-auto bg-bg" data-testid="sticky-board">
        {stickies.map((s) => (
          <StickyCard
            key={s.id}
            sticky={s}
            onMove={(id, x, y) => updateSticky.mutate({ id, patch: { x, y } })}
            onColor={(id, color) => updateSticky.mutate({ id, patch: { color } })}
            onClose={(id) => closeSticky.mutate(id)}
          />
        ))}
        {stickies.length === 0 && (
          <div className="flex h-40 items-center justify-center text-sm text-text-muted">
            No sticky notes — add one above, or “Pop out” a task.
          </div>
        )}
      </div>
    </div>
  );
}
