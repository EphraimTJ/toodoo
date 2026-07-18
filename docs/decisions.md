# Toodoo — Decisions Log

Records every deliberate deviation from TickTick's observed behavior (and any
ambiguity we resolved by judgment call), with the reasoning. Newest entries at
the top. Never rewrite history — if a decision is reversed, add a new entry
that supersedes the old one.

## 2026-07-17 — Pomodoro durations: idle clock resyncs; quick picker; no mid-session changes

Root cause of "timer stuck at 25:00": `usePomodoro` seeded its countdown once
from the default config **before** the persisted `focus:config` resolved, and
nothing resynced the idle display afterwards (Start actually used the real
value — a display/wiring failure, not persistence). The idle clock now resyncs
whenever the config or phase changes **while idle**; a running countdown is
never touched — **settings and the quick picker apply to the next session,
never mid-session** (deliberate: silently stretching/shrinking a running pomo
would corrupt the session's meaning). Clicking the idle clock opens a
TickTick-style quick picker (15/25/45/60/custom 1–180) that sets a transient
override applied immediately to the idle display and the next Start; Settings
remain the durable default. The pill mirrors the active duration via the
`focus-state` broadcast. Regression-tested (config→display resync, override,
mid-session immunity). Sibling Phase-5 settings (short/long break, interval,
auto-start, goal) were re-checked: they are read at phase transitions via
`configRef` and were never affected by the seeding bug.

## 2026-07-17 — Notification sound: synthesized "toodoo" chirp, in-app only

A signature two-note descending birdlike **"too-doo" motif (~0.5 s)** is
procedurally synthesized (`scripts/gen-chirp.mjs`, same original/license-free
approach as the ambient loops) in three variants; the variant, volume, and
on/off live in the `notif.sound` setting (Settings → Desktop, with Preview).
**Split:** the chirp plays on the **in-app reminder toast** (HTMLAudio);
**native Windows toasts keep the system default sound** — custom loose-file
toast audio is unreliable for non-MSIX (NSIS) apps, so it is not attempted for
v1.0. The asset URLs are swappable in `useNotifSound.ts` for a real recording
later. The give-up/log-only reminder path emits no toast and therefore no
sound.

## 2026-07-17 — Sample data: guarded, feature-complete, repo-driven

A packaged build now ships a **"Load sample data"** flow so manual testing is
realistic (user request, round-2 retest):

- `repo::seed::seed_sample_data` builds a deterministic example workspace
  **through the normal repository functions** (invariants/changelog/events all
  hold): every date bucket and priority, timed/all-day/duration tasks, subtask
  nesting, check items, nested tags, recurring daily / weekly / monthly-last-
  Friday, reminders minutes out, templates, comments, a KANBAN project with
  sections, a NOTE list, stickies, filters, habits with back-dated streaks,
  focus history, countdowns, saved/recent searches, and completions that feed
  stats. **Attachments are N/A** — the deferred feature has no repo layer, so
  nothing is faked.
- **Never auto-seeds:** a first-run card offers it only when the workspace is
  empty (no tasks, Inbox-only) and can be dismissed (persisted
  `seed.promptDismissed`); Settings → Advanced offers it behind an explicit
  confirm (`force=true`, appends on top of existing data; tags
  resolve-or-create so a re-run can't collide with unique names). The repo
  function refuses a non-empty workspace without `force`.
- Available in release builds — unlike the dev-only 10k perf fixture
  (`seed_demo_data`), which is unchanged.
- Coverage is pinned by
  `repo::seed::tests::sample_data_exercises_every_feature_and_guards_non_empty`.

## 2026-07-17 — Tray focus countdown is not wired in v1.0

The 12D checklist carries a conditional item — "(If wired) the tray tooltip
reflects the focus countdown during a session." Confirmed against the code:
`desktop::refresh_tray_tooltip` shows only the Today due-count; no focus-session
state reaches the tray. **Decision: stays unwired for v1.0** (the mini focus
window is the countdown surface); the checklist item is N/A, not a failure.
Revisit post-1.0 if the mini window proves insufficient.

## 2026-07-17 — Imported tags are attached (supersedes the 2026-07-16 "tags parsed but not attached" line)

User-approved scope upgrade for adversarial-review finding 4: a "successful"
import silently dropped all tag organization. Within the atomic import
transaction, every parsed tag is now **resolved or created by name**
(case-insensitive, matching the tag-uniqueness rule) and assigned to its task
via `task_tags`; each tag is created at most once per import. The browser stub
mirrors the behavior. The rest of the 2026-07-16 Import decision (append-only,
priority mapping, list-by-name) is unchanged.

## 2026-07-17 — CSV import is atomic (all-or-nothing failure mode)

Response to adversarial-review finding 3 (non-atomic portion): a row failing
mid-import used to leave every earlier task/project persisted while the command
reported an error. `import_tasks` now runs the **whole import in a single
transaction** (via tx-aware `create_task_core` / `create_project_core` /
`complete_imported_core`), and domain events are queued and emitted **after
commit**. **User-visible failure-mode change:** a failed import now imports
*nothing* (previously: an unlabeled prefix of the file). The 2026-07-16
"imports append, no dedupe" behavior is unchanged — re-running a *successful*
import still appends duplicates by design.

## 2026-07-17 — Reminder dispatch: claim/ack with bounded retry (supersedes the 2026-07-15 scheduler entry's fire-then-stamp step)

Response to adversarial-review finding 5: the scheduler acknowledged
(`mark_fired`) every reminder unconditionally after `show()`, so a transient OS
notification failure suppressed the reminder forever, while an ack failure
after a successful show re-nagged every 30 s.

New dispatch state machine (`repo::reminders::dispatch_due`, migration 0009
adds `fire_attempts`/`fire_claimed_at`):

- **Claim before attempt:** a persisted claim (`fire_claimed_at`, attempt
  counter incremented) precedes every delivery attempt.
- **Ack only on success:** `mark_fired` (which also clears the claim and resets
  the attempt budget) runs only when `show()` succeeded — or on give-up.
- **Bounded backoff:** failed attempts retry after **30 s, 60 s, 120 s, 300 s**
  (tick-granular; the 30 s poll is unchanged). After **5 total attempts** the
  reminder is acked anyway with a logged warning, so a permanently-broken
  native path can't nag forever.
- **Stale-claim recovery:** a claim whose holder crashed becomes reclaimable
  after its backoff window — at worst one duplicate notification, never a
  permanently lost reminder.
- **In-app toast decoupled:** the `reminder-fired` event (in-app
  Complete/Snooze popover, the reliable path) is emitted exactly once per fire
  time, on the **first** attempt, regardless of native delivery. Snooze resets
  the attempt budget for the new fire time.
- The backend is injectable (`NotificationBackend` trait), so the state machine
  is unit-tested with a scripted fake (success ack, backoff retry, bounded
  give-up, crash recovery, snooze reset).

The 30 s poll + launch catch-up from the 2026-07-15 decision stay; only the
fire→stamp ordering is superseded. Diagnosis logging added for reminders with
no computable fire time (e.g. a REL trigger on a task without due/start).

## 2026-07-17 — Completion idempotency contract (recurring advance + ledger)

Response to adversarial-review finding 2: retrying `complete_task` on a
recurring task double-advanced the occurrence and double-awarded points.

The contract, enforced **inside the completion transaction** (`repo/tasks.rs`):

- **Race guard (all callers, no API change):** `advance_recurrence` re-reads the
  task within the transaction and compares to the caller's pre-transaction
  snapshot. If the dates/status moved in between (overlapping duplicate calls —
  double-click, concurrent REST requests), the later call is a **safe no-op
  returning `[]`** (the same shape as "series continues": nothing newly
  COMPLETED). No ledger row, no points, no advance.
- **Retry guard (occurrence key):** callers may pass `expected_occurrence` (the
  task's due-else-start **as the client rendered it**). If it no longer matches
  the persisted occurrence, the call is the same safe no-op. The Tauri
  `complete_task` command accepts optional `expectedOccurrence` and the UI
  passes the rendered task, so a double-click or a repeat of a stale request
  cannot skip occurrences. The **REST complete endpoint stays keyless**
  (TickTick Open API shape): concurrent duplicates are covered by the race
  guard; a *sequential* keyless repeat is indistinguishable from deliberately
  completing the next occurrence and advances it — documented limitation.
- **Ledger uniqueness (migration 0008):** a partial unique index allows at most
  one live COMPLETED `task_completions` row per `(task_id, occurrence_at)`;
  inserts use `ON CONFLICT DO NOTHING`. A conflicting recurring completion
  no-ops; a non-recurring reopen → re-complete with unchanged dates flips
  status but records **no duplicate ledger row and no duplicate points** (also
  closes the reopen/complete point-farming loophole). The migration
  soft-deletes pre-existing duplicates (keeping the earliest per occurrence)
  before creating the index.

The browser stub mirrors the occurrence-key no-op so UI tests exercise the same
contract. Covered by `complete_task_retried_on_recurring_task_double_advances_
and_double_awards` (previously `#[ignore]`d, now live) and
`recomplete_after_reopen_records_no_duplicate_ledger_or_points`.

## 2026-07-17 — Restore is validated and rollback-protected (supersedes the 2026-07-16 staged-restore mechanism)

Response to adversarial-review finding 1 (critical): the previous staged restore
treated mere existence of `pending-restore.db` as validity, deleted the live db,
and renamed the staged file into place — a corrupt/partial staged file (disk
full, interrupted copy, antivirus) could destroy the database.

New mechanism (`repo/backup.rs`):
- **Staging:** the snapshot is copied to `pending-restore.db.tmp`, validated as
  SQLite (opens + `PRAGMA integrity_check` = ok + `tasks`/`projects` tables
  present), fsynced, then **atomically renamed** to `pending-restore.db`. An
  invalid snapshot errors out and never becomes a pending restore.
- **Apply (next launch, before the pool opens):** the staged file is
  **re-validated** (a corrupt one is discarded, live db untouched); the live db
  is **renamed to `toodoo.db.rollback`** — never deleted; the staged file is
  renamed into place (a rename failure puts the rollback straight back).
- **Confirmation:** only after the restored db opens **and migrates** is the
  rollback removed (`finalize_restore`). If the open fails, startup parks the
  bad file at `toodoo.db.failed-restore` and reinstates the rollback
  (`undo_failed_restore`), then reconnects to the original db.

The "applied on next launch, before the pool opens" property of the 2026-07-16
Data Safety decision is unchanged; only the swap's safety mechanics are
superseded. Covered by `repo::backup` tests, including the previously-ignored
`apply_pending_restore_rejects_a_truncated_corrupt_file` (now live) and
`rollback_survives_failed_apply`.

## 2026-07-16 — v1.0 sanctioned deferrals (release audit)

Consolidates every feature-inventory box left **unchecked** at v1.0, so each is
backed by a decision (the release-audit requirement). All are intentional; none
block v1.0.

- **Lunar-calendar recurrence** (§3.1) — a stretch item; the Gregorian RRULE
  engine ships. Revisit only if there's real demand.
- **Location reminders** (§3.1) — even the adapted manual "arrive/leave" trigger
  adds a location model with little desktop value (TickTick's is mobile-only).
  Deferred; revisit if a mobile companion appears.
- **Assigned to Me** smart list (§3.2) — meaningless without multi-user
  assignees; deferred **with collaboration** (below). Its parent "Smart Lists"
  box therefore also reads unchecked, purely because of this one child.
- **"Recurring tasks"** parent box (§3.1) reads unchecked **only** because its
  lunar child is; every other recurrence capability is shipped and checked.
- **Attachments + per-task gallery** (§3.1) — deferred to a post-12E slice
  (native fs/thumbnails); backup stays DB-file-only for v1.0 (see the 12B and
  Data-Safety entries). This is why the release "backup incl. attachments" gate
  is **DB-only** at v1.0 — there is no attachments dir yet.
- **MCP server** (§3.12) — post-1.0 (separate entry).
- **§3.13 Adapted/Deferred** — collaboration UI, cross-device sync, mobile/Siri/
  Health, and AI features are all out of v1.0 scope per build-plan §9.
- **Full i18n string extraction** — v1.0 ships react-i18next scaffolding + a
  representative set; the rest migrate incrementally (12E entry).

## 2026-07-16 — MCP server deferred to post-v1.0 (user-approved)

Slice **12F (MCP server) is skipped for v1.0** and becomes the **first post-1.0
item**. It's optional in the build plan, nothing in v1.0 depends on it, and the
REST API it would wrap already ships (Phase 10) — so it can be added later
without rework. The §3.12 MCP checkbox stays unchecked with this note; the v1.0
Definition of Done (docs/phase-12-plan.md) lists it among the explicitly-deferred
items.

## 2026-07-16 — Themes, i18n, shortcuts, polish (Phase 12E, user-approved)

The last feature slice before v1.0 (frontend-only; no schema, no Rust).

**Themes:** mode **light/dark/auto** + accent (an 8-swatch palette + a custom hex
picker) + font-size **S/M/L**, all persisted in `settings`
(`theme.mode`/`theme.accent`/`theme.fontSize`). Applied by `AppearanceProvider`
(mounted once at the root, so pop-out windows are themed too): toggles the root
`.dark` class — **`auto` follows `prefers-color-scheme` live** — sets
`--color-accent`/`--color-accent-fg` (foreground auto-picked for contrast via a
luminance threshold tuned to the accent-button convention, `theme.ts`), and sets
the root `font-size`. The sidebar `ThemeToggle` is now a light/dark quick-toggle
over the same store.

**i18n is scaffolding + a representative string set** (react-i18next + `en.json` +
a language switcher). English is the only shipped locale; a visible subset
(sidebar labels, settings headings) uses `t()`, and the rest follow the same
pattern **incrementally** — a deliberate partial close of the item, not a full
extraction (confirmed with the user).

**Shortcuts:** a `registry.ts` map + `useShortcuts` (single-key + `g`-prefix set:
`n` add-bar, `/` palette, `t` theme, `g i`/`g t` navigation, `?` cheatsheet) and a
`?` **cheatsheet overlay**. ⌘K remains owned by the command palette.

**Share image** uses **`html-to-image`** → PNG (client-side render of an offscreen
card, blob download), **superseding the 12D "image deferred" note** — the §3.11
share box is now fully checked (task text/markdown/image; list text/markdown).

**Ops polish is release/manual work, not this slice:** perf-audit targets
(list < 16 ms/frame, cold start < 2 s on the 10k fixture), packaging/signing, and
the app-icon swap live on `docs/manual-test-checklist.md` — none are CI-verifiable
here (no GUI/packaging/certs), so they are not claimed as done.

New deps: `i18next`, `react-i18next`, `html-to-image`. The 12B attachments-
deferred / DB-only-backup decisions remain untouched.

## 2026-07-16 — Native desktop integration (Phase 12D, user-approved)

Ships the native desktop surface: global quick-add hotkey, system tray (Today
count + quick actions), always-on-top mini windows (focus + sticky pop-outs),
launch-at-login, notification Complete/Snooze, and share-as-text/markdown.

**Verifiability (important):** the Rust/Tauri wiring — tray, `global-shortcut`,
`autostart` plugin, always-on-top `WebviewWindow`s, OS notification buttons — is
**compile-verified (`cargo build`/`clippy`) and hand-checked via the NEW
`docs/manual-test-checklist.md`**. It **cannot be Playwright-verified here** (no
GUI), per the 2026-07-14 E2E decision. The auto-tested slice is: the `shareText`
builders, `valid_accelerator`, the Desktop settings panel (stub-mirrored config),
the `?win=` window-mode shells, and the in-app reminder popover.

**Notifications:** the **reliable, tested path is an in-app Complete/Snooze
popover** (`ReminderToasts`) driven by a `reminder-fired` event the scheduler
emits. **OS notification action buttons are best-effort** — the current
`tauri-plugin-notification` action-button support is limited/inconsistent per-OS,
so they are not wired this slice; per-OS behavior is recorded in the checklist.
The §3.11 "native notifications with action buttons" box is checked on the
strength of the popover providing Complete/Snooze.

**Pop-out / mini windows reuse the SPA** via an `index.html?win=<kind>[&id=…]`
query that `main.tsx` branches on (`WindowRoot`) — no second bundle. In the
**browser stub these render but don't share state across windows** (each page is
a fresh in-memory store); cross-window persistence is a Tauri-only (shared DB)
behavior on the manual checklist.

**Config** (`hotkey.quickAdd`, `autostart.enabled`, `notif.actions`) lives in
`settings`; no schema. The tray tooltip shows the live Today count.

**Share ships text + markdown** (Blob download / clipboard, browser-tested);
**image/PNG is deferred to 12E** (needs a DOM-to-image dep), so the §3.11 *Share
task/list* box stays **unchecked** this slice.

The 12B attachments-deferred / DB-only-backup decisions are **untouched** (12D
adds nothing to backups).

## 2026-07-16 — NLP quick-add (Phase 12C, user-approved)

**Pure frontend, no schema/commands.** Parsing lives in
`src/features/quickadd/lib/parse.ts` (`chrono-node` for dates/times + a custom
`every …` grammar + the filter-grammar tokens `#tag`/`~list`/`!priority`); the
parsed result flows through the normal `createTask` path. No Rust mirror (per the
2026-07-14 E2E decision — the parser is frontend-only and unit-tested directly).

**Recurrence phrases emit RRULEs via `composeRrule`** (12B) — `every day`,
`every 2 weeks`, `every friday`/`every mon, wed` (WEEKLY BYDAY), and the bare
adverbs `daily|weekly|monthly|yearly`. The emitted string round-trips through
`parseRrule`, so the Phase-2 engine accepts it. Recurrence is matched **before**
chrono so "every friday" isn't consumed as a one-off date.

**Resolution on submit:** `#tag` **auto-creates** the tag if missing (matches
TickTick); `~list` **matches an existing list by name** (case-insensitive) and,
if none matches, the `~name` **stays literal** in the title — a quick-add never
silently creates a project.

**Highlights = a removable chip row** under a plain-text input (each chip's ✕
strips that token's exact substring from the text), a deliberate, fully-testable
simplification of TickTick's inline colored-span field (a contenteditable was
rejected as fiddly/hard to test). This is what closes "inline highlights with
tap-to-dismiss".

The 12B attachments-deferred / DB-only-backup decisions are untouched (12C adds
nothing native; no `manual-test-checklist.md` this slice).

## 2026-07-16 — Task & Organization completeness (Phase 12B, user-approved)

Closes the §3.1/§3.2/§3.3 long tail — almost entirely UI over the existing
migration-0001 schema (`is_all_day`, `duration_min`, `status='WONT_DO'`, the
`comments`/`attachments` tables, `tags.parent_id`, `templates`). **No migration.**

**Attachments deferred** to a dedicated slice (native fs/thumbnails/open-with-OS,
not CI-testable). Consequently the 2026-07-16 "**backups = DB file only**"
decision **remains in force** — it is superseded only when attachments ship, not
here. No `manual-test-checklist.md` this slice (nothing native shipped).

**Task ↔ check-item conversion is lossy downward.** check-item → subtask always
(carries title + done). subtask → check-item drops the subtask's children (its
subtree is trashed), tags, priority, dates, and notes — a check item holds only
title + done. The UI shows a confirm dialog when there is anything to lose.

**Won't-Do on a recurring occurrence advances in place** (records a `WONT_DO`
`task_completions` row and rolls to the next occurrence, no points awarded),
mirroring the completion decision (2026-07-15). Non-recurring Won't-Do sets
`status='WONT_DO'` on the single task (no cascade) + a ledger row; `reopen_task`
already returns WONT_DO → ACTIVE. Won't-Do tasks render in a flat status view
(like Completed/Trash), not the active list.

**Duplication** deep-copies structure + check items + tag assignments + reminders;
it does **not** copy activity, completions, or pin, and the root title gains
" (copy)".

**Tag merge** re-points `task_tags` from source→target (dropping duplicates),
re-parents the source's children under the target, then soft-deletes the source.
**Delete** re-parents children to the root (mirrors the task-deletion decision).
`set_tag_parent` rejects self-parenting and cycles.

**Templates** are captured from a task via `save_task_as_template` (core fields +
check-item titles; reminders not snapshotted in v1); repo CRUD already existed.

**Custom RRULEs**: the picker now exposes **monthly-by-weekday** (`BYDAY=-1FR`
etc.), yearly, and interval — the engine already accepted them; the round-trip is
covered by the `rrule.ts` table test.

**Settings-backed, no schema:** smart-list **visibility/order**
(`smartlists.config`) and per-view **detail density** (`viewopts:<view>.density`)
live in `settings`. A **Won't Do** smart list was added.

## 2026-07-16 — Search (Phase 12A, user-approved)

**Dedicated Search view**, not a two-mode ⌘K palette. The palette stays the
quick task-jump + list-jump surface and gains a "Search everything for '<q>'"
item that hands off to the full Search view (query box + list/tag/date/status
facets + result groups + recent + saved). Filters/recent/saved need more room
than a palette dropdown affords.

**FTS5 for habits and tags** via migration **0007** (external-content virtual
tables + insert/update/delete triggers, mirroring the tasks/check-items pattern
from 0002), **backfilled** from existing rows since habits/tags may predate the
migration. Chosen over a LIKE query for consistency with the rest of search.

**Coverage note:** the §3.9 "global search" box is checked for every entity that
exists today — tasks, descriptions, check items, notes (which are NOTE-kind
tasks, already in `tasks_fts`), habits, and tags. **Comments and attachment
filenames are NOT yet searchable**; those tables/features arrive in 12B, which
will add their FTS triggers. This is an intentional partial close of the box.

**Recent searches = settings ring buffer** (`search.recent`, capped at 12, pure
`push_recent`: trim/blank-skip/case-insensitive-dedupe/newest-first/cap — unit
-tested with a TS mirror `recent.ts`). **Saved searches = the `saved_searches`
table** (from migration 0001; no new table), query + `filters_json`.

**Live search:** task mutations now invalidate the `["search"]` query key so
results update when a matched task is completed/edited/trashed (previously only
`["tasks"]`/`["smartCounts"]`/`["stats"]`).

**Stub does substring; FTS relevance/ranking is Rust-only** (consistent with the
2026-07-14 E2E decision). Playwright drives the Search UI against the stub;
FTS-specific behavior (prefix/porter stemming, injection safety) is covered by
Rust tests. No native behavior in this slice, so no `manual-test-checklist.md`
entry (that file is first created in 12D).

## 2026-07-16 — Data Safety & Import/Export (user-approved)

**Backups are the DB file only** (no zip). Attachments (§3.1) aren't implemented,
so a "full backup" is the single SQLite file. Snapshots use **`VACUUM INTO`** —
which yields a clean, consistent copy even though the DB runs in **WAL** mode (a
plain file copy could miss `-wal` contents). `VACUUM INTO` also silently no-ops on
an in-memory source, so the backup unit test uses an on-disk source DB.

**Restore is staged and applied on next launch.** `restore_backup` copies the
chosen snapshot to `app_data_dir/pending-restore.db`; on startup, **before the
pool opens**, `apply_pending_restore` swaps it onto `toodoo.db` (clearing stale
`-wal`/`-shm`). This avoids reconnecting a live pool mid-session. The UI tells the
user to relaunch.

**Auto-backup is ON by default** — an hourly scheduler pass takes at most **one
snapshot per local day** (deduped via `backup.lastAt`) and prunes to
**`backup.keep` = 10**. Config lives in `settings` (no migration).

**Imports append.** Each CSV row becomes a new task in the list named by its row
(created if missing via `get_or_create_by_name`, case-insensitive; empty/"inbox"
→ Inbox). No dedupe/merge. Tags are parsed but **not attached** on import (kept
minimal; not required by the inventory).

**Priority mapping:** TickTick 0/1/3/5 pass through (already our storage); Todoist
CSV 4/3/2/1 → 5/3/1/0; generic accepts 0/1/3/5 or high/medium/low/none.

**No Tauri fs/dialog plugin.** Exports move through the existing **Blob-download**
path (`src/lib/download.ts`) and imports through a `<input type="file">`, both of
which work in the Tauri webview *and* the vite-dev browser — so the exporters,
importers, and the Playwright happy-path run against the browser stub. Backups
(server-side snapshots) are **desktop-only**; the stub keeps an in-memory list so
the Data panel still renders. New dep: **`csv`**. `importers.ts` mirrors the Rust
parsers and is pinned to the same tests.

## 2026-07-16 — Local API, URL Scheme, MCP (user-approved)

**MCP deferred.** The build plan marks MCP "optional"; it ships later as a thin
wrapper over the REST API (no rework needed). This phase delivers the REST server
+ `toodoo://` scheme. The §3.12 MCP checkbox stays unchecked.

**Server is off by default**, enabled from **Settings → API & Integrations**, and
binds **127.0.0.1 only** (never `0.0.0.0`). Rationale: a localhost service should
not open a port unless the user opts in. Default port **7420**.

**Single bearer token in `settings`** (`api.token`, plaintext) — **no migration**.
The DB is local and single-user, so a plaintext token in `settings` is adequate;
a multi-token `api_tokens` table was considered and rejected as over-engineering.
The token is a UUID with dashes stripped. **Regeneration is live** — the running
server holds the token behind an `Arc<RwLock<String>>`, so a new token takes
effect without a restart, and the old one is invalidated immediately.

**Auth path:** the pure `bearer_ok` check is unit-tested; an Axum middleware
guards everything under `/open/v1`. `/ping` and `/openapi.json` are public.

**TickTick fidelity is an approximation** of Open API v1, not byte-compat:
`priority` passes through unchanged (already stored as TickTick's 0/1/3/5, per the
2026-07-14 entry); `status` maps ACTIVE↔0 / COMPLETED↔2; JSON is camelCase; dates
pass through as stored RFC3339-millis. Exact parity with TickTick's cloud server
is a non-goal (we have no way to verify it).

**OpenAPI** is a **hand-authored static** `openapi.json` served by the API, chosen
over a proc-macro generator (utoipa) to avoid a heavy build-time dependency.

**Toodoo extensions** live under `/open/v1/toodoo/*` (habits, focus stats over the
last 30 days, filters) — read-only, delegating to the existing repo functions.

**Testing:** the REST layer can't run in the browser stub, so it's verified by a
Rust integration test (spawn Axum on `127.0.0.1:0`, drive with `reqwest`: auth +
create/complete/delete). The stub mirrors only the config + `copyTaskLink`;
Playwright covers the Settings panel and the copy-link action. Deep-link OS
registration is desktop-only and not exercised in CI — the **parser**
(`parse_deep_link`) is unit-tested instead.

## 2026-07-16 — Stats, Achievement & Summary (user-approved)

**Scoring:** completing a task earns **+2** when done on or before its due day,
**+1** when late or when it has no due date (day-granular). Each open task past
its due date loses **−1 per day**, capped at **−3/day** overall. Level tiers
(cumulative score): **Novice 0 / Rising 100 / Focused 500 / Pro 2000 /
Master 10000**. (User-chosen thresholds; TickTick's exact curve is unpublished.)

**Award path — deliberate deviation:** points are awarded **inline inside
`tasks::complete_task`'s transaction** (via `stats::award_completion`), not from
an event-bus consumer. Rationale: the award commits atomically with the
completion (no double-count on replay, deterministic in tests). Overdue penalties
come from an **hourly scheduler pass** (`stats::overdue_penalty_pass`) that is
**idempotent per day** — dedup key is an `achievements.reason` of
`overdue:<taskId>`, so re-running the hour (or day) never double-penalizes.

**Universal completion ledger:** `complete_task` now records a `task_completions`
row for **every** completion (previously only the recurring path did). This ledger
— plus `focus_sessions` — is the sole source for the summary. The recurring path
awards once **per occurrence**.

**Completion rate = due-in-period basis:** rate = tasks completed ÷ tasks whose
**due date** falls in the period (not ÷ all completions), matching how TickTick
frames "on-time" performance. NOTE-kind items are excluded from all counts.

**Local-time dating:** the `achievements.date` ledger key and all summary
day/weekday/hour bucketing use the **user's local timezone** (tz offset passed
into `complete_task` and `stats_summary`; the scheduler uses server local time),
so a completion lands on the local day the user experienced.

**No migration:** `achievements` (0001) and `task_completions` (0003) already
exist; the phase adds `repo/stats.rs` + three commands + one scheduler pass only.

**Browser stub parity:** the stub mirrors scoring and the summary from in-memory
`achievements`/`taskCompletions`, but has **no scheduler**, so overdue penalties
are **Tauri-only**. `score.ts` is pinned to the same unit tests as the Rust
scoring so the two can't drift.

## 2026-07-15 — Timeline (Gantt) view (user-approved)

**Placement:** the Timeline is a **per-project view mode** (List / Kanban /
**Timeline**), reusing `projects.view_mode = TIMELINE` and the existing
`ViewModeToggle` + `ListPane` routing (mirroring Kanban). Lanes are grouped by the
project's **sections** (a "No section" lane for the rest). Undated and NOTE tasks
are excluded from bars.

**Bars & drag:** a task with a start and due renders a bar spanning start→due
inclusively; a **single-date task** (only start or only due) renders a **one-day
bar**. Body-drag moves both dates (keeping the span); the left/right edge handles
set `start_at`/`due_at` independently — resizing an edge of a single-date task
fills in the missing date. All snapping is **day-granular** (all-day); persistence
is via `update_task`.

**Unscheduled panel:** the project's dateless tasks are HTML5-draggable onto the
grid; dropping schedules the task at the dropped day (`start_at = due_at`).

**No backend work:** the timeline reuses `tasks::list_project_tasks` (read) and
`tasks::update_task` (move/resize/schedule) — **no new repo functions, commands,
or migration**. The tricky logic is the pure geometry in
`src/features/timeline/lib/timeline.ts` (date↔pixel, zoom, bar span), unit-tested;
rows are virtualized with `@tanstack/react-virtual`.

## 2026-07-15 — Countdown / Notes / Sticky Notes (user-approved)

**Sticky notes:** ship as an **in-app board** this phase (draggable colored
cards, position/color persisted); the always-on-top **pop-out Tauri window** is
**deferred to Phase 12** (with the Phase-5 mini focus window + tray). A standalone
quick sticky is a **NOTE-kind task** (its text) in the Inbox plus a `sticky_notes`
row; the note is hidden from task views by the NOTE-exclusion rule below.

**Countdown mode:** auto-derived — a future target counts **down** ("in N days"),
a past target counts **since** ("N days since"), and an annual-repeat target
points at the **next anniversary** (Feb 29 clamps to Feb 28 off leap years). An
explicit **count-up toggle** (stored in `style_json` alongside the cover color)
forces the "since" view for fixed past-date milestones. The date math is pure
(`countdowns::countdown_view`) and mirrored in `countdown.ts` to parity.

**Notes:** NOTE-kind items are excluded from **smart lists** (and the Inbox
count) and from **TASK-list views**; they appear only in note lists and, for a
sticky's backing note, on the board. **Convert note↔task** flips `tasks.kind`
(`set_task_kind`). A note list is a project with `kind = NOTE`, rendered by
`NoteListView` (rich text in the shared detail pane, no checkbox/date).

**No migration:** `countdowns`, `sticky_notes`, and the `kind` columns all exist
in 0001; countdown color + count-up live in `style_json`.

## 2026-07-15 — Habits: skip-neutral/period streaks, reminders fire, focus link (user-approved)

**Streaks (the main testable logic):** a Skip is **neutral** — it preserves a
streak without extending it. Daily/weekday habits streak on consecutive
*scheduled* days marked DONE, with a still-incomplete **today** treated as grace
(it neither counts nor breaks). "X per week/month" habits streak on consecutive
**periods** (ISO weeks / calendar months) whose DONE count met the target; the
in-progress period counts only once it is met (else grace). The pure logic lives
in `repo::habits` and is mirrored in `src/features/habits/lib/streak.ts`, pinned
to identical unit tests so the two can't drift.

**Frequency model** (`freq_json`): `{kind:"daily"}`, `{kind:"weekdays",
days:[1..7]}` (ISO Mon=1), `{kind:"weekly"|"monthly", times:n}`. Weekly/monthly
habits appear every day until the period target is met (progress shown "2/3").

**Amount habits**: a day is DONE once cumulative `value ≥ goal_amount`, else
PARTIAL. **Reminders** fire via the existing scheduler when their local time has
passed and the habit isn't checked in yet that day; dedup is in-memory per
habit+day (a restart may re-fire once). **Presets** are a static bundled list
that prefills the create dialog (no schema).

**Focus link:** with habits now real, a focus session can attach to a habit
(`focus_sessions.habit_id`), closing the Phase-5 "attach to a task **or habit**"
item. **No migration** was needed — `habits`, `habit_checkins`, and
`focus_sessions.habit_id` all exist in 0001.

**Why:** skip-neutral + period-based streaks match TickTick's observed behavior;
keeping the streak math pure makes the tricky edge cases (grace, skip, periods)
exhaustively testable on both sides of the IPC boundary.

## 2026-07-15 — Focus/Pomodoro: frontend timer, Recharts, bundled ambient (user-approved)

**Decision (deps & scope):** the focus statistics dashboard uses **Recharts**
(in the CLAUDE.md stack). Ambient sound ships as **bundled audio tracks** —
procedurally-generated white/pink/brown noise loops (`scripts/gen-ambient.mjs`),
so the files are original and license-free. The always-on-top **mini focus
window** and the **tray countdown** are **deferred to Phase 12** (desktop-polish),
which already owns tray menu + launch-at-login; this keeps Phase 5 testable.
All confirmed with the project owner.

**Timer model:** the countdown runs in the **frontend**; the backend persists
sessions. A RUNNING row is written on start (so it survives a reload — restored
via `active_session`); pause time is tracked client-side by wall clock and saved
as `pause_ms` on completion. A session's effective focus time is
`ended - started - pause_ms`.

**What counts:** a "pomo" is one **DONE `POMO`** session; stopwatch sessions add
focus duration but not to the pomo count. The daily goal is the count of DONE
pomos today. Break phases are timers only — not persisted sessions. Defaults:
work 25 / short 5 / long 15 min, long break every 4 pomos, auto-start off (all
editable in settings).

**Attachment:** sessions attach to a **task** this phase; habit attachment waits
for Phase 6 (habits don't exist yet), leaving `focus_sessions.habit_id` null.
Focus statistics here are focus-specific; the global achievement score and
weekly/monthly summary remain **Phase 9**.

**Why:** a frontend timer + backend persistence is the simplest correct split
for a local single-user app, keeps the cycle logic (`lib/pomodoro.ts`) and the
stats aggregation (`repo/focus.rs`) pure and unit-testable, and avoids native
window/tray plumbing that can't be exercised by the stub/Playwright.

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
