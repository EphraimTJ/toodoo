# Toodoo — Decisions Log

Records every deliberate deviation from TickTick's observed behavior (and any
ambiguity we resolved by judgment call), with the reasoning. Newest entries at
the top. Never rewrite history — if a decision is reversed, add a new entry
that supersedes the old one.

## 2026-07-15 — Completing a parent task completes its subtasks (user-approved)

**Decision:** Checking off a parent marks every open descendant COMPLETED in
the same transaction. Reopening the parent does **not** reopen children.
Completing a mid-level task only cascades downward.

**Why:** Matches current TickTick desktop behavior (which has varied across
versions); confirmed with the project owner at Phase 1 planning.

## 2026-07-15 — Completed tasks show in a collapsed bottom section (user-approved)

**Decision:** Each list shows a collapsible "Completed" section under the
active tasks; expanded state and show/hide are remembered per list
(settings key `viewopts:<view>`). Default: shown, collapsed.

## 2026-07-15 — Subtask nesting capped at 4 levels (user-approved)

**Decision:** `parent_id` supports any depth, but the repository rejects
creating a subtask deeper than 4 levels, like TickTick desktop.

## 2026-07-15 — Smart-list date windows

**Decision:** A task's *effective date* is its due date, else its start date.
Today and Next 7 Days include overdue tasks; Next 7 Days spans today..+6.
All-day tasks compare by stored calendar date; timed tasks convert to the
viewer's local date (frontend passes local date + UTC offset). Matches
TickTick's observed overdue-in-Today behavior.

## 2026-07-15 — Inbox is a fixed, protected project

**Decision:** The Inbox is seeded by migration 0002 with the well-known id
`inbox`; it cannot be deleted, renamed, or moved into a folder (color/view
options may change). Pinned above the smart lists in the sidebar, like
TickTick.

## 2026-07-15 — Deletion semantics for projects, folders, tags

**Decision:** Deleting a project moves its live tasks to the Trash; restoring
such a task re-homes it to the Inbox if its project is still gone. Deleting a
folder ungroups its lists (never deletes them). Deleting a tag removes it from
all tasks; tasks are untouched. Tag names are unique case-insensitively.
All match TickTick's observed behavior.

## 2026-07-14 — E2E runs in a browser against the Vite dev server, not inside Tauri

**Decision:** Playwright E2E tests run against `vite dev` in Chromium, with the
Tauri IPC layer replaced by an in-memory stub (`src/lib/api.ts` falls back to a
browser stub when `window.__TAURI_INTERNALS__` is absent).

**Why:** Playwright cannot attach to the Tauri WebView; true in-Tauri E2E on
Windows requires tauri-driver + WebdriverIO (a different test runner). The
build plan specifies Playwright, so E2E covers the React app end-to-end while
Rust-side behavior (repository layer, changelog, events) is covered by
`cargo test`. Revisit if a phase needs to verify native integration
(tray, global hotkeys, notifications) automatically.

## 2026-07-14 — Task priority stored as 0/1/3/5

**Decision:** `tasks.priority` uses the TickTick Open API values
(0 none, 1 low, 3 medium, 5 high) rather than 0–3.

**Why:** §3.12 requires a TickTick-compatible local REST API; storing the
API's native values avoids a mapping layer and matches TickTick's observed
data model.
