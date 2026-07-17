# Toodoo — Pre-Launch Handoff (v1.0)

> **Updated 2026-07-17, round 2 (`v1.0-fixes`).** Round 1 fixed the five
> adversarial-review findings. The user's re-test of that installer showed
> reminders still silent and the focus/sticky pop-outs still white and
> unclosable — with no way to capture evidence. Round 2 therefore added
> always-on file logging, hard failsafes around the pop-outs, a one-click
> notification test, and a sample-data seed, and re-verified everything
> possible against a **locally silent-installed NSIS build**. What remains is
> the user's scripted re-test below. **No `v1.0.0` tag** until it passes plus
> the release audit (Section 5).

---

## 1. WHERE WE ARE

- **Branch:** `v1.0-fixes`. Round-1 commits fixed adversarial findings 1–5
  (restore safety, completion idempotency, reminder claim/ack, atomic import,
  imported tags). Round-2 commits, oldest first:
  - `8498536` feat(logging): rotating toodoo.log + Settings → Advanced → Open logs folder
  - `e3ffe9c` fix(windows): center pop-outs + boot watchdog destroying dead windows
  - `9068093` feat(reminders): one-click test-notification path + permission logging
  - `ed5c290` feat(seed): guarded, feature-complete sample workspace + first-run prompt
- **Automated suites (green at HEAD):** `cargo test` **200 passed, 1 ignored**
  (search perf gate) + clippy clean; `npm test` **143**; `npx playwright test`
  **18**; `tsc --noEmit` + `npm run build` clean.
- **Installers (unsigned):** rebuild from HEAD →
  `src-tauri/target/release/bundle/nsis/Toodoo_0.1.0_x64-setup.exe` (+ MSI).
- **Logging:** every `[reminders]`, `[window]`, `[notify]` diagnostic and any
  panic goes to a rotating `toodoo.log` (Settings → Advanced → **Open logs
  folder**), always on — a normal double-click launch now produces evidence.

## 2. THE TWO OPEN BUGS — current understanding & what changed

### (a) Focus/sticky pop-outs: white + unclosable (user's machine)
- **Packaged-build evidence (local silent install of the identical build):**
  the webview *does* load — `page load started/finished` on
  `http://tauri.localhost/index.html?win=…` plus both boot beacons in the
  log, and the windows render (screenshot-verified). So the white screen is
  not a deterministic asset/URL/CSP failure of this build.
- **Real bug found while reproducing:** the windows spawned at an OS-default
  position **mostly off-screen at the bottom edge** — visually a broken
  window fragment. Pop-outs are now **centered**.
- **Failsafes now in place (a white window can never strand you again):**
  native title bar + close on every pop-out; **Esc closes any pop-out**; a
  **5 s watchdog** destroys a window whose content never boots, logs it, and
  raises an in-app error toast; window URL + page-load progress + builder
  errors are logged. Closing a pop-out never exits the app.
- If white recurs on the user's machine, `toodoo.log` now pinpoints the stage
  (created → page load started → finished → booted).

### (b) Reminders never fire (user's machine)
- Round-2 result (no toast, no in-app toast, fresh installer) **still
  implicates the scheduler/data path or event delivery** — the in-app toast
  has never depended on native `show()` succeeding.
- New: startup logs the notification **permission state** (never checked
  before) and identifier; **Settings → Advanced → "Send test notification
  now"** runs claim→show→ack style stages immediately (permission check +
  request, native `show()`, in-app toast) and reports each stage inline and
  to the log. The scheduler logs polls, computed fire times, skips
  (including reminders that can never fire), attempts, and outcomes.
- OS-side candidates for the user to check: Windows Settings → System →
  Notifications (Toodoo allowed, notifications on, Focus Assist / Do Not
  Disturb off).
- Design note (documented): **a due date alone never fires a notification** —
  a reminder must be added in the task's Reminders panel. (Default reminders
  à la TickTick are a possible post-1.0 follow-up.)

## 3. RE-TEST SCRIPT (user, against the NEW installer)

**Setup:** uninstall Toodoo → install the freshly built
`Toodoo_0.1.0_x64-setup.exe` → launch normally (no terminal needed — the log
file records everything).

1. **Sample data:** on first launch with an empty workspace a card offers
   "Load sample data" — accept it (or Settings → Advanced → Load sample
   data…). Expect lists (Work kanban with sections, Personal, Reading Notes),
   tasks in every date bucket, tags, habits with streaks, stickies, filters,
   templates, countdowns, non-empty stats — and **two reminders that fire
   within ~3–5 minutes** of seeding.
2. **Notification test:** Settings → Advanced → **Send test notification
   now**. Expect: a native Windows toast AND an in-app toast bottom-right;
   the button prints a stage report (e.g. `permission: Granted; native
   show(): ok`).
3. **Scheduled reminder:** wait for the seeded "Stand-up call" /
   "Stretch break" reminders (~3–5 min after seeding), or add your own 2 min
   out via a task's Reminders panel. Expect native + in-app toast; test
   **Complete** and **Snooze 10m** on the in-app one.
4. **Focus pop-out:** Focus header **↗**. Expect a centered, titled,
   resizable always-on-top window showing the timer — or, if content fails,
   it closes itself within ~5 s and an error toast appears in the main
   window. **Either way, no stuck white window.**
5. **Sticky pop-out:** **↗** on a sticky card. Same expectations; check
   move/resize persists after closing and reopening.
6. **If anything fails:** Settings → Advanced → **Open logs folder** → send
   `toodoo.log` (and say which step failed). The log contains the
   stage-by-stage evidence this diagnosis needs.
7. Also confirm Windows Settings → Notifications: Toodoo allowed, Focus
   Assist off during the test.

## 4. REMAINING OPS (unchanged)

- Release-build perf audit on the 10k fixture (< 16 ms/frame scroll, < 2 s
  cold start) — record numbers; automated proxies are green.
- Signing (or an explicit "unsigned for v1.0" decision) + final icon check.

## 5. RELEASE PROCEDURE — unchanged

1. Inventory audit (sanctioned deferrals in decisions.md).
2. Automated suites green (cargo 200+1 ignored, vitest 143, playwright 18,
   tsc/build/clippy clean).
3. Backup → restore gate (repo::backup tests, incl. corrupt rejection +
   rollback).
4. Search < 50 ms on 10k (ignored perf test).
5. Manual checklist all native items ✅ on the installed build; record OS
   notification-button behavior in decisions.md.
6. Ops: perf numbers, icon, signing decision.
7. README written/refreshed.
8. Commit, merge strategy to `main`, then `git tag v1.0.0`.

## Key file map

- Logging: `tauri-plugin-log` init + panic hook in `src-tauri/src/lib.rs`;
  `open_logs_folder` command; Settings → Advanced panel
  (`src/features/settings/components/AdvancedSettings.tsx`).
- Pop-outs: `src-tauri/src/desktop.rs` (`open_or_focus`: center, decorations,
  page-load logging, watchdog, `WindowWatch`); beacon command
  `log_window_error` in `lib.rs`; shells + error boundary + beacon in
  `src/windows/WindowRoot.tsx`; error toasts in
  `src/components/layout/SystemToasts.tsx`. Diag hooks:
  `TOODOO_DIAG_WINDOWS=1|watchdog`, `TOODOO_DIAG_NOTIFY=1`.
- Reminders: dispatch state machine `src-tauri/src/repo/reminders.rs`;
  `send_test_notification` in `lib.rs`; in-app toasts
  `src/features/reminders/components/ReminderToasts.tsx`.
- Sample data: `src-tauri/src/repo/seed.rs::seed_sample_data`; first-run card
  `src/components/layout/SampleDataPrompt.tsx`; Advanced action.
