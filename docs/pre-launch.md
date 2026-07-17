# Toodoo — Pre-Launch Handoff (v1.0)

> **Updated 2026-07-17 (v1.0-fixes branch).** All five adversarial-review
> findings are fixed and committed; the window-management cluster is
> instrumented and could not be reproduced at HEAD (details below). What
> remains before `v1.0.0` is the **user's manual re-verification** against the
> freshly rebuilt installer (Section 3) and the release audit (Section 5).
> Do **not** tag until both pass.

---

## 1. WHERE WE ARE

- **Phases 0–12E complete** (tags `phase-0` … `phase-12E`).
- **Branch:** `v1.0-fixes` (off `v-phase-12E`). **`v1.0.0` is NOT tagged.**
- **This branch's commits, oldest first:**
  - `175fdc8` docs(checklist): record installed-build manual test results
  - `b38225a` fix(backup): validate staged restores + rollback until the new db opens *(finding 1)*
  - `9e734d8` fix(tasks): recurring completion idempotent under retry *(finding 2)*
  - `ae3c38e` fix(reminders): claim/ack dispatch with bounded retry *(finding 5)*
  - `535618b` fix(import): whole CSV import in one transaction *(finding 3)*
  - `1d2f35d` feat(import): attach parsed tags in the import transaction *(finding 4, user-approved)*
  - `1fc97e7` fix(windows): error boundary + boot beacon for pop-outs; diag hook
- **All three adversarial proof tests are live and passing** (were `#[ignore]`d);
  see `docs/adversarial-review-findings.md` for the original findings and
  `docs/decisions.md` (five new 2026-07-17 entries) for the contracts.
- **Automated suites (all green at HEAD):** `cargo test` **199 passed, 1
  ignored** (the search perf gate) + clippy clean; `npm test` **143 passed**;
  `npx tsc --noEmit` clean; `npm run build` clean; `npx playwright test`
  **18 passed**.
- **Installers (unsigned, rebuilt from this branch — install THIS one):**
  - NSIS: `src-tauri/target/release/bundle/nsis/Toodoo_0.1.0_x64-setup.exe`
  - MSI: `src-tauri/target/release/bundle/msi/Toodoo_0.1.0_x64_en-US.msi`
- New migrations **0008** (completion-ledger unique index) and **0009**
  (reminder dispatch claim state) apply on first launch.

## 2. WHAT WAS FIXED / WHAT THE EVIDENCE SAYS

### (a) Adversarial-review findings — all fixed
1. **Restore safety:** staging validates the snapshot as SQLite (integrity
   check + schema sanity), fsyncs, renames atomically; apply re-validates and
   parks the live db at `toodoo.db.rollback` until the restored db opens and
   migrates; a failed open rolls back automatically.
2. **Recurring completion idempotency:** in-transaction re-read guard + an
   optional `expectedOccurrence` key (the UI sends it); a stale retry is a
   no-op returning `[]`; the completion ledger has a per-occurrence unique
   index. REST stays keyless (race-guarded only) — documented.
3. **Notifications:** claim-before-attempt / ack-only-on-success with backoff
   30/60/120/300 s, give-up after 5 attempts, stale-claim recovery; the in-app
   toast fires once per fire time on the first attempt regardless of native
   delivery. Unit-tested via an injectable notification backend.
4. **Import atomicity:** one transaction, events after commit, all-or-nothing.
5. **Import tags:** now attached (resolved/created case-insensitively) inside
   the import transaction — user-approved scope upgrade.

### (b) "Reminders never fire" — root cause still NEEDS the user's log capture
The checklist showed **neither the native toast nor the in-app toast** ever
appeared. The in-app `reminder-fired` emit never depended on native `show()`
success, so finding 5 (ack-on-failure) **cannot be the root cause** — the
failure is upstream: either `due_reminders` finds nothing (scheduler/data
path) or the emit/toast wiring. No `[reminders]` log lines were captured on
the installed build, so this is unresolved. The scheduler now also logs
reminders that can never fire (a REL trigger on a task with no due/start
anchor — a silent no-op before). **Re-test per Section 3 with a terminal so
the logs decide it.**

### (c) Focus/sticky white screens — NOT reproducible at HEAD; suspect a stale installer
With a boot beacon added to every pop-out window, the **release build** logs
`[window] ?win=focus: booted ok` / `?win=sticky…: booted ok` and renders both
windows (verified by launching the release exe with `TOODOO_DIAG_WINDOWS=1`,
which auto-opens them). The reported "can't resize" also matches the
pre-`2ac96ca` frameless windows — so the tested installer most likely
predated the window fixes. If a white screen recurs on the new installer, it
is no longer silent: run from a terminal and the window either renders its
error or logs a `[window-error]` line.

### (d) Tray focus countdown — N/A by decision
Not wired in v1.0 (2026-07-17 decision); the checklist's "(if wired)" item is
closed as N/A, not a failure.

## 3. MANUAL RE-VERIFICATION (user, against the NEW installer)

**First: uninstall any existing Toodoo, then install the freshly built NSIS
setup.exe from Section 1** (this is critical — the white-screen evidence says
the previous test likely ran an older build).

Launch from a terminal so stderr is visible:
`& "$env:LOCALAPPDATA\Toodoo\Toodoo.exe"`

1. **Reminders:** add a task; task detail → Reminders panel → set one ~2 min
   out. Watch for: `[reminders] poll … N due` (does N go to 1?), `dispatch
   notification (attempt 1)`, `show() ok/FAILED`, and any `skip: … no
   computable fire time` line. Expect the native toast AND the in-app
   Complete/Snooze toast. Test both actions (Complete closes the task; Snooze
   10m re-fires). **Capture the log lines either way** — they pick the branch
   of the decision tree if it still fails.
2. **OS toast action buttons:** note whether the native toast shows
   Complete/Snooze buttons; record the observed Windows behavior in
   `decisions.md` (either outcome gets an entry, per the 12D decision).
3. **Focus pop-out:** Focus header **↗** → always-on-top window with the
   timer, movable, **resizable**. (If white: the window now shows the error
   text, and stderr has `[window]` lines — send them.)
4. **Sticky pop-out:** **↗** on a card → always-on-top window with
   title/content/color, resizable; position/color persist after reopen.
5. **Restore:** Settings → Data → Back up now → Restore that backup →
   relaunch → data intact. (Corrupt-file/rollback safety is covered by
   automated tests — no need to simulate corruption by hand.)
6. **Recurring double-click:** double-click complete on a daily recurring
   task → it advances exactly one day, one completion recorded, points once.
7. **Import:** import a CSV containing tags → tags are attached; import a CSV
   with one malformed row (e.g. priority `2`) → the import fails and imports
   **nothing** (new all-or-nothing failure mode).
8. **Regression spot-check (previously ✅ on the installed build):** global
   hotkey, quick-add Esc, tray tooltip count updates, launch-at-login,
   timed due chip ("Today H:MM PM").

## 4. REMAINING OPS (unchanged)

- **Release-build perf audit** on the 10k fixture (Ctrl+Shift+F9): list
  scroll < 16 ms/frame, cold start < 2 s — record the numbers. Automated
  proxies are green (virtualization gate in `e2e/perf.spec.ts`; Rust search
  gate `search_under_50ms_on_10k`).
- **Signing** (or record "unsigned for v1.0" as a decision) and confirm the
  app icon in the installed build.

## 5. RELEASE PROCEDURE — unchanged from the previous handoff

1. Inventory audit (sanctioned deferrals listed in decisions.md).
2. Automated suites green (expected: cargo 199+1 ignored, vitest 143,
   playwright 18, tsc/build/clippy clean).
3. Backup → restore gate (cargo `repo::backup` tests — now 6, incl. corrupt
   rejection + rollback).
4. Search < 50 ms on 10k (`cargo test --lib -- --ignored --nocapture
   search_under_50ms_on_10k`).
5. Manual checklist all native items ✅ on the installed build; record OS
   notification-button behavior in decisions.md.
6. Ops: perf numbers recorded, icon confirmed, signing decided.
7. README written/refreshed.
8. Commit, decide the merge strategy to `main`, then `git tag v1.0.0`.

## Key file map

- Reminder scheduler + dispatch state machine: `src-tauri/src/lib.rs`
  (scheduler loop), `src-tauri/src/repo/reminders.rs` (`dispatch_due`,
  `NotificationBackend`).
- Restore safety: `src-tauri/src/repo/backup.rs` (validate/rollback), startup
  wiring in `lib.rs`.
- Completion idempotency: `src-tauri/src/repo/tasks.rs`
  (`complete_task_with`, `advance_recurrence`), migration 0008.
- Atomic import + tags: `src-tauri/src/repo/importers.rs` (+ tx cores in
  `tasks.rs`/`projects.rs`/`tags.rs`).
- Pop-out shells + error boundary/beacon: `src/windows/WindowRoot.tsx`;
  window opening: `src-tauri/src/desktop.rs::open_or_focus`; diag hook:
  `TOODOO_DIAG_WINDOWS=1` (lib.rs setup).
- Capabilities: `src-tauri/capabilities/default.json`.
