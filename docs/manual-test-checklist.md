# Toodoo — Manual Test Checklist (native desktop)

Some native behavior can't run under Playwright (no GUI in CI), per the
2026-07-14 E2E decision. Those pieces are **compile-verified** (`cargo build` /
`clippy`) and must be **manually verified in the packaged/dev Tauri app** on each
OS you ship. Run `npm run tauri dev`, then walk this list. Primary target:
**Windows 11**; note macOS/Linux differences where relevant.

Legend: ⬜ untested · ✅ pass · ❌ fail (file an issue)

## Phase 12D — Native desktop

### Global quick-add hotkey
- ✅ Pressing the configured accelerator (default **Ctrl+Shift+A**) anywhere opens
  the frameless always-on-top **Quick add** window.
- ✅ Typing a phrase + Enter creates the task (NLP parsing works) and the window
  can be dismissed with Esc. 
- ✅ Changing the hotkey in **Settings → Desktop** re-registers it (old combo
  stops working, new one works). An invalid accelerator is rejected (no crash).

### System tray
- ✅ A tray icon appears; its tooltip shows **"Toodoo — N due today"** and N
  updates within ~1 min as Today tasks change. (Passes on the installed build
  after the `15759b6` event-driven refresh; the earlier "stuck at 0" result was
  the dev-mode run before that fix.)
- ✅ Tray menu: **Quick add** opens the quick-add window · **Open Today** focuses
  the main window on the Today list · **Start focus** opens the focus window · 
  **Show / Hide** toggles the main window · **Quit** exits. 

### Mini focus window + tray countdown
- ✅ **Start focus** opens an always-on-top mini window mirroring the running
  timer; it stays on top of other apps. (Round 3b, owner-confirmed: the
  default transparent PILL renders and works. The earlier build() hangs were
  intermittent/machine-state-dependent; the permanent posture is
  defense-in-depth — pre-armed watchdog, ≥2-failures auto-fallback to in-app
  panels, and the Settings → Desktop pop-out style switch. Menu-clipping on
  the pill's "…" fixed by growing the window while the menu is open —
  re-verify the menu on the latest installer. Still to eyeball: hover
  expand/collapse, top-edge dock/undock, position persistence.)
- ⬜ ~~(If wired) the tray tooltip reflects the focus countdown during a session.~~
  **N/A for v1.0** — confirmed not wired; deliberate (see the 2026-07-17
  "Tray focus countdown is not wired in v1.0" decision).

### Sticky-note pop-out windows
- ✅ Popping a sticky out opens an always-on-top window showing that sticky's
  title/content with its color. (Round 3b, owner-confirmed working with the
  default pill style — same resolution as the focus window above.)
- ⬜ Moving/resizing the pop-out persists position/color (survives reopen). The
  in-app sticky board still works alongside it. (Sticky pills have body drag,
  a corner resize grip, hover color swatches, and per-window position/size
  persistence — verify drag/resize/color survive a close + reopen.)

### Launch at login
- ✅ Toggling **Launch Toodoo at login** on, then rebooting, starts Toodoo
  automatically. Toggling off stops it. 

### Notification Complete / Snooze
- ✅ When a reminder fires, a native notification appears. (Round 3 PASS on the
  installed build: log shows notification.show() ok for both seeded
  reminders; test-notification button works.)
- ⬜ **Windows toast action buttons (now wired via WinRT — round 4):**
  - ⬜ A reminder toast shows **Complete** and **Snooze Nm** buttons (N = the
    Settings → Notifications snooze duration). Press **Complete** on the live
    toast → the task completes (recurring: advances one occurrence only), log
    shows `[notify-action]`.
  - ⬜ Let a toast slide into the **notification center (Action Center)**;
    ~2 min later press **Snooze** there → the reminder re-fires after the
    configured minutes. (Only works while Toodoo is running — by design; see
    the 2026-07-18 decisions.md entry.)
  - ⬜ **Body click** (not a button) → main window opens/focuses on that task.
  - ⬜ Toggle "Complete / Snooze buttons" OFF → the next toast has no buttons
    (plain notification).
  - ⬜ Change **Snooze duration** to 30 → both the native button label and the
    in-app toast button read "Snooze 30m" and reschedule by 30 min.
- ✅ **Everywhere**: an in-app Complete / Snooze toast also appears — Complete
  closes the task, Snooze 10m reschedules it. (Round 3 PASS: in-app toasts
  fire reliably. New: the "toodoo" chirp plays on the in-app toast —
  configurable in Settings → Desktop.)

### Per-OS notes
- Windows 11: _record notification action-button support + any quirks here._
- macOS: _record LaunchAgent autostart + notification behavior here._
- Linux: _record tray/notification behavior here._

## Phase 12E — Appearance & release polish

### Themes (auto-tested for the DOM effect; verify the *look* by eye)
- ✅ **Auto** theme flips light↔dark when you change the OS appearance while the
  app is open (no restart).
- ✅ Each accent preset + a **custom** hex applies immediately; text on accent
  buttons stays legible (foreground auto-contrast).
- ✅ Font-size S/M/L scales the whole UI without breaking layouts.

### Release polish (ops — not done in CI)
- ⬜ **Perf audit** on the 10k fixture (Ctrl+Shift+F9): list scrolls at
  < 16 ms/frame; cold start < 2 s.
- ✅ **App icon** swapped to the final artwork (`src-tauri/icons/`).
- ⬜ **Packaging/signing** for your OS produces an installable, signed build.
- ✅ Empty states read well across list / search / stats / habits.

## Round-3b final re-test (2026-07-18) — run on the LATEST installer

> Uninstall Toodoo first, then install the newest
> `src-tauri/target/release/bundle/nsis/Toodoo_0.1.0_x64-setup.exe`
> (it contains the pill-menu clip fix). Launch normally — logging is always
> on; if anything fails: Settings → Advanced → **Open logs folder** → send
> `toodoo.log` and note which item failed.

### Focus pill (pop-outs confirmed rendering; these are the detail checks)
- ⬜ **Menu fix:** click the pill's **…** → the full menu (Open Toodoo /
  Switch mode / Stop session / Close) appears below the pill, no clipping;
  the window shrinks back when it closes.
- ⬜ Hover the pill → controls fade in (~200 ms); mouse away → they fade out
  after a short delay.
- ⬜ Drag the pill by its body; drag it to touch the **top screen edge** → it
  docks into the slim progress bar; hover the bar → the pill slides back out.
- ⬜ Close the pill (Esc or menu) and reopen via Focus ↗ → it reopens at the
  position you left it.
- ⬜ Start a session in the main window → the pill's ring + countdown mirror
  it; pause/resume/stop from the pill controls the main timer.

### Sticky pill
- ⬜ Drag by body; resize via the bottom-right corner grip; change color from
  the hover swatches → close (✕ or Esc) and reopen → position, size, and
  color all survived.

### Notification sound ("toodoo" chirp)
- ⬜ Settings → Desktop → Notification sound → **Preview** each of the three
  variants; adjust volume. **Note your chosen default variant here: ____**
- ⬜ Set a reminder ~2 min out → native toast (system sound) + in-app toast
  (chirp at your volume). Toggle sound off → in-app toast is silent.

### Resizable panes
- ⬜ Drag the divider right of the sidebar and the one left of the detail
  pane; double-click one → resets; restart the app → widths persisted.
- ⬜ Quick glance at calendar / kanban / timeline / matrix at extreme pane
  widths — nothing structurally broken.

### Pomodoro durations
- ⬜ Focus → click the idle **25:00** clock → pick **10** → idle clock shows
  10:00 immediately → Start → session runs 10 minutes end-to-end (or verify
  the countdown pace and stop early).
- ⬜ Change Work minutes in Focus → Settings → idle clock follows; start a
  session, then change the setting → the RUNNING countdown does NOT change
  (by design).
- ⬜ The mini pill's ring reflects the picked duration.

### Remaining release ops (unchanged)
- ⬜ OS toast action buttons: record observed Windows behavior (buttons or
  not) — either result gets a decisions.md entry.
- ⬜ Perf audit + signing decision (see Release polish above).
