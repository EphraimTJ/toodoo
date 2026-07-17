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
- ❌ Typing a phrase + Enter creates the task (NLP parsing works) and the window
  can be dismissed with Esc. (Everything works but the window does not get dismissed on pressing Esc and also even though the NLP recognizes due in 10 minutes, it doesnt show me that it is due in 10 minutes it shows me its due today. It should she me the time so if i put that task at 7:30pm it should show due at 7:40pm)
- ✅ Changing the hotkey in **Settings → Desktop** re-registers it (old combo
  stops working, new one works). An invalid accelerator is rejected (no crash).

### System tray
- ❌ A tray icon appears; its tooltip shows **"Toodoo — N due today"** and N
  updates within ~1 min as Today tasks change.(it didnt update, i put 1 task due today but it still showed 0 tasks due even after like 3 minutes.)
- ✅ Tray menu: **Quick add** opens the quick-add window · **Open Today** focuses
  the main window on the Today list · **Start focus** opens the focus window · 
  **Show / Hide** toggles the main window · **Quit** exits. 

### Mini focus window + tray countdown
- ❌ **Start focus** opens an always-on-top mini window mirroring the running
  timer; it stays on top of other apps. (Start focus didnt open a mini window that stays on top)
- ❌ (If wired) the tray tooltip reflects the focus countdown during a session. (i dont know how to check this)

### Sticky-note pop-out windows
- ❌ Popping a sticky out opens an always-on-top window showing that sticky's
  title/content with its color. (doesnt pop out of the window, so when the app is minimized i cant see the sticky note)
- ❌ Moving/resizing the pop-out persists position/color (survives reopen). The
  in-app sticky board still works alongside it. (im not able to resize it)

### Launch at login
- ❌ Toggling **Launch Toodoo at login** on, then rebooting, starts Toodoo
  automatically. Toggling off stops it. (im not sure how to check this since i have to do npm run tauri dev to launch the app)

### Notification Complete / Snooze
- ❌ When a reminder fires, a native notification appears. (no reminder came)
- ❌ **Where the OS supports action buttons** (record which): Complete and Snooze
  buttons act correctly. (i am only testing on windows so im not sure what to check)
- ❌ **Everywhere**: an in-app Complete / Snooze toast also appears — Complete
  closes the task, Snooze 10m reschedules it. (This is the reliable path.) (I couldnt test it because a reminder never came)

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
