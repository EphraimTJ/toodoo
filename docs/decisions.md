# Toodoo — Decisions Log

Records every deliberate deviation from TickTick's observed behavior (and any
ambiguity we resolved by judgment call), with the reasoning. Newest entries at
the top. Never rewrite history — if a decision is reversed, add a new entry
that supersedes the old one.

## 2026-07-15 — Calendar: FullCalendar, live ICS fetch, feed-RRULE expansion (user-approved)

**Decision (deps):** the calendar grid uses **FullCalendar** (`@fullcalendar/react`
+ daygrid/timegrid/list/interaction, all MIT), named in the CLAUDE.md stack.
External ICS subscriptions are fetched live over the network with **reqwest**
(rustls-tls). Both confirmed with the project owner.

**Grid actions:** dragging an item reschedules it — a task's start and due move
together (the gap is preserved); an event's start/end move together. Resizing
sets duration (`tasks.duration_min` / event `end_at`). Drawing on empty grid
creates a new **local** event. Dragging a task from the "Unscheduled" panel onto
the grid schedules it (sets due date + a 60-min block when timed).

**Which tasks appear:** tasks with a due or start date. All-day tasks sit on the
all-day row; timed tasks render as blocks (default 60 min when no duration).
A recurring task shows once at its current occurrence and is not draggable on the
grid (it advances on completion, per Phase 2).

**Subscriptions & recurring events:** subscription events and expanded recurring
occurrences are **read-only** (`editable:false`), keyed `id = sourceId::<startIso>`
so FullCalendar keys stay unique. A refresh **replaces** a subscription's cached
events wholesale. Feed `RRULE`s are expanded across the visible window via the
Phase-2 recurrence engine, honoring `EXDATE`; `RECURRENCE-ID` overrides and full
`VTIMEZONE` parsing (beyond `TZID` lookup) are **out of scope for v1**.

**Import/export:** `.ics` import creates local events; export emits dated tasks
(DTSTART = due date) plus local events — subscription events are not re-exported.
Week-start, weekend shading, and show-completed persist per calendar in settings.

**Why:** FullCalendar de-risks the drag/resize interactions the build plan flags
as a top risk, and the split of ICS parsing (pure, unit-tested) from the network
fetch keeps the hard logic deterministic. The `editable:false` + replace-on-
refresh model keeps read-only overlays from being accidentally mutated.

## 2026-07-15 — Eisenhower Matrix is priority-based; drag sets priority (user-approved)

**Decision:** The four quadrants default to priority rules — Q0 High(5), Q1
Medium(3), Q2 Low(1), Q3 None(0) — so every task lands in exactly one quadrant.
Quadrant rules are editable (any `filter_rule::Rule`); when they overlap, a task
falls into the **first** matching quadrant and tasks matching none are hidden.
Dragging a card into a quadrant sets the task's priority to that quadrant's
"representative priority" (the first Priority value in its rule); if a quadrant's
rule has no priority condition, the drag is a no-op.

**Why:** Matches TickTick's default matrix and keeps the drag action
unambiguous and reversible. Confirmed with the project owner.

## 2026-07-15 — Custom Filter model, text grammar, and result scope (user-approved)

**Decision:** A filter is a flat list of conditions combined with All (AND) or
Any (OR) — nested groups are deferred. Conditions cover list, tag, priority,
due (overdue/today/tomorrow/next7/none/range), keyword (title+notes,
case-insensitive), type, and status. The advanced text grammar:
`list:NAME`/`~NAME`, `tag:NAME`/`#NAME`, `priority:high|medium|low|none`/`!high`,
`due:today|tomorrow|next7|overdue|none`, `is:active|completed|wontdo`,
`type:task|note`, `"quoted phrase"`/bare words → keyword, and a top-level `OR`
flips the combinator to Any (default All). An **empty** filter matches all active
tasks. Results are ACTIVE tasks unless a `Status` condition widens them; TRASHED
is never included.

**Why:** Covers the §3.2 Custom Filters checklist (rule-based, AND/OR, advanced
text syntax) with a grammar close to TickTick's while staying unambiguous. The
evaluator and parser are duplicated in Rust (source of truth) and TypeScript
(browser stub) and pinned to identical unit tests so they cannot drift.

## 2026-07-15 — Kanban cards are top-level tasks; sectionless tasks get a fixed column

**Decision:** Kanban cards are top-level (parentless) ACTIVE tasks; subtasks are
summarized on the card as `done/total`, not shown as individual cards. Tasks
with no `section_id` live in a fixed leading "No Section" column that cannot be
renamed or deleted. Deleting a column detaches its tasks back to "No Section"
rather than trashing them. WIP is a per-column count badge (no configurable
limit). Column collapse is view-only local state; the List/Kanban choice itself
persists on the list (`projects.view_mode`).

**Why:** Mirrors TickTick's board. Keeping recurrence/subtask semantics off the
board avoids drag ambiguity, and detaching (not deleting) tasks on column delete
is the safe, reversible choice.

## 2026-07-15 — Recurring completion advances in place; subtree not cascaded

**Decision:** Completing a recurring task (one with an `rrule` and a start/due
anchor) does not mark it COMPLETED. Instead it records the finished occurrence
in `task_completions`, rolls the task's `start_at`/`due_at` to the next
occurrence, and leaves it ACTIVE. When an end condition is reached
(`next_occurrence` returns `None` for `COUNT=`/`UNTIL=`), the task completes for
real. Recurrence acts on the task itself only — its subtasks are **not**
cascade-completed on an advance (unlike a normal completion).

**Why:** Matches TickTick, where a recurring task reappears with its next date
rather than disappearing into Completed. Advancing the subtree would fight the
"repeat the whole checklist" model and produce contradictory complete-then-
reopen history; keeping recurrence on the parent is simpler and predictable.

**Notes:** `COUNT=` progress is derived by counting `task_completions` rows
(status `COMPLETED`) for the task, including the occurrence just recorded, and
enforced in the pure `recurrence::next_occurrence` engine. In Phase 2 a
`task_completions` row is written **only** for recurring tasks (the data the
recurrence engine needs); general per-completion history for the Phase 9 stats
engine is deferred to that phase. The `repeat_from = COMPLETION` vs `DUE` basis
and DST wall-clock handling live in `recurrence.rs` and are unit-tested there.

## 2026-07-15 — Reminder scheduler polls every 30s with launch catch-up

**Decision:** A background task polls `reminders::due_reminders` every 30
seconds, fires a native notification per due reminder, then stamps
`last_fired_at` so it never double-fires. The first tick runs immediately on
launch, so reminders whose time passed while the app was closed still fire
(catch-up). All-day tasks' relative reminders anchor at 09:00 local
(`ALL_DAY_REMINDER_TIME`); a completed or trashed task never nags.

**Why:** Desktop apps can't rely on OS-scheduled alarms while closed; a poll
loop plus a catch-up pass is the simplest correct approach and keeps the
fire-time math pure and testable. 30s is well within a minute-granular UX.

## 2026-07-15 — Browser API stub approximates recurrence (no COUNT)

**Decision:** The in-memory browser stub (`src/lib/api.ts`, used by vite dev and
Playwright) advances recurring tasks by `FREQ`/`INTERVAL` and honors `UNTIL`,
but does **not** enforce `COUNT=` — it advances indefinitely. The Rust
repository layer remains the single source of truth for recurrence.

**Why:** The stub exists to exercise UI flows, not to reimplement the engine.
`COUNT` end-counting needs the `task_completions` ledger, which is a backend
concern; duplicating it in the stub would be effort without a UI payoff.

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

**Decision:** A task's _effective date_ is its due date, else its start date.
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
