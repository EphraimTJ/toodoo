export function ListPane() {
  return (
    <main aria-label="Task list" className="flex min-w-0 flex-1 flex-col">
      <header className="border-b border-border px-6 py-3">
        <h2 className="text-base font-semibold">Inbox</h2>
      </header>
      <div className="flex flex-1 items-center justify-center text-sm text-text-muted">
        No tasks yet — task CRUD ships in Phase 1.
      </div>
    </main>
  );
}
