# Toodoo — Pre-Launch Handoff (v1.0)

> **START HERE (next session):** You are resuming with **zero conversation
> history**. Before touching any code:
> 1. Read this file top to bottom.
> 2. Read `CLAUDE.md` (project rules) and `docs/decisions.md` (every deliberate
>    decision; newest at top).
> 3. **Ask the user for their installed-build test results** (the open blockers
>    below were *fixed in code this session but are UNVERIFIED on the installed
>    Windows build*). Do **not** change code until you have those results — the
>    fixes may already be correct, or the failures may be dev-mode artifacts.
>
> This document is reconstructed from the repo (git log + docs), not from
> memory. Anything uncertain is tagged **[UNVERIFIED — confirm against repo]**.

---

## 1. WHERE WE ARE

- **Phases 0–12E are complete.** Tags exist `phase-0` … `phase-12E`
  (note: no `phase-2` tag in the list — historical, non-blocking
  **[UNVERIFIED — confirm against repo]**).
- **Branch:** `v-phase-12E`. **HEAD:** `ef08426` (working tree clean).
- **`v1.0.0` is NOT tagged.** (Confirmed: `git tag | grep v1.0.0` → none.)
- **Checkpoint commit:** `019f608` — "release-audit checkpoint" — committed the
  regenerated app icon, the perf-gate test, and the **manual-test-checklist
  results** (the user's ✅/❌ marks + comments live in
  `docs/manual-test-checklist.md`).
- **Fixes committed after the checkpoint (this session), newest first:**
  - `ef08426` fix(perf): restore list virtualization + add 10k frame-time gate
  - `f9d16e9` fix(tasks): show the time on timed due-date chips ("Today 7:40 PM")
  - `15759b6` fix(tray): update Today count on task events, not a 60s poll
  - `2ac96ca` fix(desktop): wire pop-out triggers, window-close permission, resizable windows
  - `1508046` chore(reminders): instrument scheduler poll + notification dispatch
- **Automated suites (all green at HEAD):** `cargo test` **187 passed, 1 ignored**
  (the ignored one is the search perf gate) + `cargo clippy` clean; `npm test`
  **142 passed**; `npx playwright test` **18 passed** (17 phase happy-paths + the
  new perf gate); `tsc --noEmit` clean; `npm run build` clean.

### Installable Windows build (just produced — unsigned)
- **Build command:** `npm run tauri build` (from repo root). Runs
  `beforeBuildCommand` = `npm run build` (tsc + vite), then a Rust **release**
  compile, then WiX (MSI) + NSIS bundlers (Tauri auto-downloads them). ~4 min.
- **Installer outputs** (rebuilt with ALL fixes above):
  - NSIS (recommended): `src-tauri/target/release/bundle/nsis/Toodoo_0.1.0_x64-setup.exe`
  - MSI: `src-tauri/target/release/bundle/msi/Toodoo_0.1.0_x64_en-US.msi`
- **Unsigned** — no code-signing cert is configured in `tauri.conf.json`, so
  Windows SmartScreen warns ("More info → Run anyway"). If the user has a cert,
  wire it into `tauri.conf.json` (`bundle.windows.certificateThumbprint` or a
  `signCommand`) and rebuild.

---

## 2. OPEN BLOCKERS (fix order) — fixes applied, UNVERIFIED on installed build

All four were marked ❌ in `docs/manual-test-checklist.md` (results in `019f608`)
during a **`npm run tauri dev`** run. Code fixes are committed; **none are
verified against the installed build yet.** Re-test on the installer FIRST.

### (a) Notifications / launch-at-login — TEST ON INSTALLED BUILD FIRST
- **Symptoms (dev mode):** no reminder toast ever fired; OS action buttons and
  launch-at-login couldn't be tested.
- **Working theory:** dev-mode Windows toasts are unreliable (unstable
  AppUserModelID / no installed Start-menu shortcut), so **these may not be real
  bugs.** No behavior fix was made to the notification path — only diagnostics.
- **Diagnostics added (`1508046`):** the reminder scheduler in
  `src-tauri/src/lib.rs` (search `[reminders]`, ~lines 1373–1388) now logs on
  **stderr**:
  - `[reminders] poll @ <utc>: <N> due` — every 30 s tick.
  - `[reminders] dispatch notification: reminder=… task=… title=…` — per due item.
  - `[reminders] notification.show() ok` **or** `… FAILED: <err>`.
- **How to read the log:** the NSIS build launches `Toodoo.exe` with no console.
  Run it from a terminal to see stderr, e.g. PowerShell:
  `& "$env:LOCALAPPDATA\Toodoo\Toodoo.exe"` (install dir is the NSIS target —
  per-user `%LOCALAPPDATA%\Toodoo\` by default **[UNVERIFIED — confirm the exact
  install path]**). Set a reminder ~1–2 min out and watch the lines.
- **Decision tree from the log:**
  - `N due` stays `0` → scheduler/data path — inspect
    `repo::reminders::due_reminders` and how the reminder was stored.
  - `show() FAILED: …` → the `tauri-plugin-notification` call — likely a Windows
    identifier/permission issue; investigate per-OS.
  - `show() ok` but no visible toast → Windows is suppressing it (Focus Assist /
    notifications disabled for the app) — not a code bug; the **in-app
    Complete/Snooze popover** (`ReminderToasts`) is the reliable fallback.
- **In-app fallback already exists:** on every fired reminder the scheduler also
  emits a `reminder-fired` webview event; `src/features/reminders/components/
  ReminderToasts.tsx` shows an in-app Complete/Snooze toast. This is the
  guaranteed path regardless of OS toast support.

### (b) Window-management cluster — FIXED in `2ac96ca` (verify)
- **Symptoms:** mini focus window wouldn't open; sticky pop-out wouldn't open or
  resize; quick-add window wouldn't close on Esc.
- **Diagnosis (this session):**
  - **No UI ever invoked** `api.openStickyWindow` / `api.openFocusWindow` — the
    Rust commands + api methods existed but nothing called them. (The global
    hotkey DID open the quick-add window, proving `desktop::open_or_focus` works.)
  - Windows were built `decorations(false)` → **frameless = no title bar / no
    resize handles** (that's why sticky "couldn't resize").
  - Quick-add Esc: the `div onKeyDown` was unreliable, **and** the webview
    calling `getCurrentWindow().close()` lacked the `core:window:allow-close`
    capability permission.
- **Fixes:**
  - Added a **↗ Pop out** button to each sticky card
    (`src/features/sticky/components/StickyBoard.tsx`) and to the Focus header
    (`src/features/focus/components/FocusView.tsx`), Tauri-only, calling the
    open-window commands.
  - `desktop::open_or_focus` now takes a `decorations` flag: focus + sticky get a
    title bar (movable, resizable); quick-add stays frameless.
  - Quick-add Esc → a window-level `keydown` listener in
    `src/windows/WindowRoot.tsx`; added `core:window:allow-close` (+ show/hide/
    set-focus/start-dragging/set-always-on-top) to
    `src-tauri/capabilities/default.json`.
- **Note:** the pop-out/mini windows load the SAME SPA via `index.html?win=<kind>`
  which `src/main.tsx` branches on (`WindowRoot`). The **browser stub is
  per-page**, so this only truly works in the Tauri app — must be verified there.

### (c) Tray Today-count tooltip — FIXED in `15759b6` (verify)
- **Symptom:** added a task due today; tooltip kept showing 0 after ~3 min.
- **Diagnosis:** it was a 60 s poll, and Windows can hold a stale tray tooltip
  until you re-hover.
- **Fix:** now **event-bus driven** — `desktop::refresh_tray_tooltip` runs at
  startup and from the domain-event forwarder (`src/lib.rs`) on every
  task-affecting event (create/update/complete/trash/restore/delete/move/seed).
  A slow 10-min fallback only covers midnight date-rollover.
- **`smart_counts.today` is correct** (well-tested) — the value was never the
  issue, the refresh timing was.

### (d) NLP "in 10 minutes" — FIXED in `f9d16e9` (root cause was DISPLAY, not the parser)
- **Symptom:** "in 10 minutes" produced a task shown as "due today" with no time.
- **Diagnosis:** the **parser was already correct** — chrono marks "in 10
  minutes" as `hourCertain=true`, so `parseQuickAdd` produced `isAllDay=false`
  with the right timestamp. The bug was **display**: `dueChip` in
  `src/features/tasks/lib/sortGroup.ts` always rendered `"Today"`/`"Tomorrow"`/
  `"MMM d"` and never the time.
- **Fix:** `dueChip` now appends the clock time for timed tasks
  (`"Today 7:40 PM"`) and computes overdue against the actual instant (not just
  the calendar day). All-day tasks unchanged.
- **The requested failing test case is already committed** in
  `src/features/quickadd/lib/parse.test.ts`:
  ```ts
  it("parses 'in N minutes' as a timed due (not all-day)", () => {
    // REF is 09:00 local, so +10 min → 09:10 local, timed.
    const r = parseQuickAdd("Call back in 10 minutes", REF);
    expect(r.isAllDay).toBe(false);
    expect(r.dueAt).not.toBeNull();
    const d = new Date(r.dueAt!);
    expect(d.getHours()).toBe(9);
    expect(d.getMinutes()).toBe(10);
    expect(r.title).toBe("Call back");
  });
  ```
  Plus `src/features/tasks/lib/dueChip.test.ts` covers the display fix.

---

## 3. HOW TO VERIFY EACH (installed build)

Install the NSIS `.exe`, **uninstall any prior Toodoo first**, then:

- **Reminders:** launch `Toodoo.exe` from a terminal (see 2a) to see `[reminders]`
  logs. Add a task, set a reminder ~1–2 min out. Confirm the native toast AND the
  in-app Complete/Snooze toast; test both actions. Capture the log lines and use
  the 2a decision tree.
- **OS toast action buttons vs. in-app fallback:** on Windows, note whether the
  toast shows Complete/Snooze *buttons*. **Either outcome must get a
  `decisions.md` entry:** if native buttons work → record "Windows notification
  action buttons supported"; if not → record "Windows uses the in-app popover
  fallback; OS buttons unsupported/best-effort." (The 12D decision already
  frames buttons as best-effort — extend it with the observed Windows result.)
- **Launch at login:** Settings → Desktop → toggle **on**. Then open **Task
  Manager → Startup apps** and confirm "Toodoo" is listed/Enabled. Reboot →
  confirm it auto-starts. Toggle **off** → confirm it leaves Startup. (This only
  works from the *installed* build, never `tauri dev`.)
- **Sticky pop-out:** Sticky Notes view → **↗** on a card → an always-on-top
  window opens; **minimize the main app** and confirm the sticky stays visible;
  **drag its edges to resize**; reopen and confirm position/color persisted.
- **Mini focus window:** Focus header **↗** (or tray → Start focus) → an
  always-on-top, movable, resizable focus window that mirrors the timer.
- **Tray countdown / Today count:** hover the tray icon (Windows refreshes the
  tooltip on hover) → confirm "Toodoo — N due today"; add/complete a task due
  today → hover again → N updated. During a focus session the tooltip is expected
  to reflect the countdown **[UNVERIFIED — confirm whether the focus countdown is
  actually wired into the tooltip; the 12D checklist listed it as "if wired"]**.
- **Quick-add Esc:** press the global hotkey (default **Ctrl+Shift+A**) → Quick
  add window opens → **Esc closes it**.
- **Timed due display:** quick-add `call in 10 minutes` → the task's chip reads
  **"Today H:MM PM"** (turns red once past), not just "Today".

---

## 4. REMAINING OPS

- **Frame-time perf audit on the 10k fixture.** Two artifacts already exist:
  - **Automated proxy (green):** `e2e/perf.spec.ts` seeds 10k (browser stub
    `seedDemoData` now generates the fixture) and asserts the list stays
    virtualized (~30 rows in the DOM, was 10,000 before the `ef08426` fix) with
    no catastrophic scroll frame (generous CI bound).
  - **Rust search gate (green):** `cargo test --lib -- --ignored --nocapture
    search_under_50ms_on_10k` — last run ~27 ms / ~19 ms (debug build), < 50 ms.
  - **Still manual:** the strict **< 16 ms/frame** and **cold start < 2 s** in a
    **release build** — measure with the packaged app + DevTools Performance /
    the Ctrl+Shift+F9 dev fixture. Record the numbers.
- **Signing** (if a cert is available) and confirming the **final app icon** in
  the installed build (icon was regenerated in `019f608` from
  `Assets/ios/AppIcon-1024.png`).

---

## 5. RELEASE PROCEDURE — full v1.0 checklist (execute standalone)

Run in order. Do **not** tag until every step passes.

1. **Inventory audit.** Every unchecked box in `docs/feature-inventory.md` must
   be a sanctioned deferral (each has a `decisions.md` entry — see the
   "2026-07-16 — v1.0 sanctioned deferrals" and "MCP deferred" entries).
   Sanctioned unchecked items:
   - **§3.13** (collaboration/assignees, cross-device sync, mobile/Siri/Health,
     AI) — out of scope.
   - **Lunar-calendar recurrence** and **Location reminders** — stretch/mobile.
   - **Assigned to Me** smart list (deferred with collaboration) — which is why
     the **"Smart Lists"** parent box also reads unchecked.
   - **"Recurring tasks"** parent box — unchecked ONLY because its lunar child is.
   - **Attachments + per-task gallery** — deferred post-12E.
   - **MCP server** — post-1.0.
   Flag anything unchecked that is NOT on this list, and anything checked that
   lacks tests.
2. **Automated suites all green:**
   - `cd src-tauri && cargo test` (expect 187 + 1 ignored) and
     `cargo clippy --lib --tests` (clean).
   - `npm test` (vitest, expect ~142), `npx tsc --noEmit` (clean),
     `npm run build` (clean).
   - `npx playwright test` (expect 18).
3. **Backup → restore gate.** Verified by cargo tests
   `repo::backup::{create_backup_writes_an_openable_db, stage_and_apply_swaps_the_database,
   prune_keeps_the_newest}`. **Important:** attachments are deferred, so v1.0
   backup is **DB-file-only** — there is **no attachments dir**. The DoD phrase
   "including attachments" is N/A for v1.0 (recorded in the sanctioned-deferrals
   decision). Do NOT block the release on an attachments backup.
4. **Search < 50 ms on 10k:** `cd src-tauri && cargo test --lib -- --ignored
   --nocapture search_under_50ms_on_10k` → both timings < 50 ms.
5. **Manual checklist** (`docs/manual-test-checklist.md`) executed on the
   **installed** build (Section 3 here). All native items ✅. Record OS
   notification-button behavior in `decisions.md`.
6. **Ops:** release-build frame-time / cold-start recorded; app icon confirmed;
   installer signed (or explicitly accept "unsigned for v1.0" as a decision).
7. **README:** write/refresh `README.md` with the v1.0 feature list and
   build/dev/test/package instructions (`npm run tauri dev`, `npm test`,
   `cargo test`, `npx playwright test`, `npm run tauri build`). **[UNVERIFIED —
   confirm whether a README already exists and what it contains.]**
8. **Commit** the README + any release edits, then **`git tag v1.0.0`**.
   (Decide with the user whether to merge `v-phase-12E` → `main` first; the
   phase branches were tagged but the merge/branch strategy to `main` is
   **[UNVERIFIED — confirm against repo]**.)

---

## Key file map (for the next session)
- Reminder scheduler + instrumentation, tray wiring, tray refresh, all
  `#[tauri::command]`s, window plugins/tray setup: `src-tauri/src/lib.rs`.
- Native helpers (config, `valid_accelerator`, `open_or_focus`,
  `refresh_tray_tooltip`): `src-tauri/src/desktop.rs`.
- Capability permissions (window/plugin allow-lists):
  `src-tauri/capabilities/default.json`.
- Pop-out/mini window shells + `?win=` entry: `src/windows/WindowRoot.tsx`,
  `src/main.tsx`.
- In-app reminder popover: `src/features/reminders/components/ReminderToasts.tsx`.
- Desktop settings panel: `src/features/settings/components/DesktopSettings.tsx`.
- Due-chip display + tests: `src/features/tasks/lib/sortGroup.ts`,
  `.../lib/dueChip.test.ts`.
- Quick-add NLP parser + tests: `src/features/quickadd/lib/parse.ts`,
  `parse.test.ts`.
- List virtualization (the perf-critical flex chain): `src/features/tasks/
  components/TaskListView.tsx`; perf gate: `e2e/perf.spec.ts`.
