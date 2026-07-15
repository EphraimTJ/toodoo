export function DetailPane() {
  return (
    <aside
      aria-label="Task detail"
      className="flex w-80 shrink-0 flex-col border-l border-border bg-surface"
    >
      <div className="flex flex-1 items-center justify-center px-6 text-center text-sm text-text-muted">
        Select a task to see its details.
      </div>
    </aside>
  );
}
