# Toodoo — Pre-Launch Handoff (v1.0)

> **Updated 2026-07-17, round 3 (`v1.0-fixes`).** Reminders/toasts now PASS on
> the owner's installed build. The remaining hard bug — focus/sticky pop-outs
> opening pure white — was pinned by the round-3 log to
> `WebviewWindowBuilder::build()` **never returning** on that machine (no
> page-load, no beacon, and — the safety regression — no watchdog, because it
> was armed only after build). Round 3 makes the watchdog unbypassable, moves
> creation to the main thread, adds an in-app fallback that keeps focus/sticky
> usable no matter what, redesigns the pop-outs as TickTick-style pills, adds
> the "toodoo" chirp, resizable panes, and fixes the stuck pomodoro duration.
> **No `v1.0.0` tag** until the scripted re-test below passes + the release
> audit (§5).

---

## 1. WHERE WE ARE

- **Branch:** `v1.0-fixes`. Round-3 commits, oldest first:
  - `573a31b` fix(windows): watchdog armed before build + main-thread creation + load instrumentation
  - `46e1d8d` feat(popouts): simple in-app pop-outs toggle + auto-fallback floating panels
  - `16b14a8` feat(popouts): TickTick-style pill windows for focus and stickies
  - `86cb0b2` feat(reminders): synthesized toodoo chirp with sound settings
  - `1c26b92` feat(layout): resizable sidebar / list / detail panes with persistence
  - `9a4550e` fix(focus): idle clock resyncs with config + quick duration picker
- **Automated suites (green at HEAD):** `cargo test` **205 + 1 ignored** (perf
  gate) + clippy clean; `npm test` **146**; `npx playwright test` **19**
  (includes the new pane-resize spec); tsc/build clean.
- **Reference designs:** `docs/design-refs/` (expanded pill, docked bar, the
  white-window bug, Today view) — committed.

## 2. THE POP-OUT BUG — state of evidence and defenses

- **Round-3 log conclusion:** `creating window` with zero page-load / beacon /
  builder-error / watchdog lines ⇒ `build()` hung on the owner's machine.
  The quick-add window (created on the **main thread** by the global-shortcut
  handler) has always worked there; command/tray-context creation is what
  failed. All pop-out creation now runs via `run_on_main_thread`
  (fire-and-forget commands).
- **Watchdog is now unbypassable:** pending registration + 5 s timer are armed
  **before** `build()`; expiry always logs `[window-watchdog]`, destroys the
  window (best-effort if a handle exists), persists a per-kind failure
  counter, emits `popout-failed`, and toasts the main window. The state
  machine is unit-tested. The log also now records the WebView2 runtime
  version, `builder.build() returned` (or FAILED), and per-window navigation
  — silence can no longer be mistaken for anything.
- **Fallback:** after **2 consecutive failures** per kind (or via Settings →
  Desktop → *Use simple in-app pop-outs*), focus/sticky open as **in-app
  floating panels**; a watchdog kill auto-opens the panel immediately. Focus
  and stickies remain fully usable regardless of the native-window outcome.
- If the pills still white-screen on the owner's machine, the new log will say
  whether `build()` returned and whether navigation started — send it; the
  panels keep everything usable meanwhile.

> **RESOLVED (2026-07-18):** the owner confirms pop-outs render with the
> **default pill style**. The build() hang was intermittent/machine-state
> dependent; the pill default stays, protected by the watchdog + auto-fallback
> + style switch (see the 2026-07-18 decisions.md entry). Remaining manual
> checks: pill menu on the latest installer (clip fix), hover/dock/persist,
> sticky resize/color persistence, chirp variant choice, panes, 10-min pomo.

## 2b. ROUND-3b — the owner's log after the round-3 build (evidence update)

The round-3 defenses worked exactly as designed on the owner's machine:
reminders PASS, the watchdog caught both pop-out failures (`[window-watchdog]
… no window handle to destroy (creation likely hung inside build())`). The
decisive differential: **quick-add (Decorated chrome) built and booted in the
same session where the focus/sticky pills (frameless + transparent) hung
inside `build()`** — same binary, same WebView2 150.0.4078.65 as the machine
where pills work. Creation context is exonerated (all main-thread now); the
**window style flags** are the culprit set, transparency the prime suspect
(WebView2 composition init is GPU/driver-sensitive). Also fixed: the
persisted failure counter was being overwritten with the per-launch in-memory
streak (stuck at 1 across restarts), so the ≥2 auto-fallback never engaged —
it now read-increment-writes and resets only on a successful boot.

New tools shipped instead of a guess-fix:
- **`TOODOO_DIAG_WINDOWS=styles`** opens 4 windows (a=decorated,
  b=frameless-opaque, c=frameless-transparent, d=full pill) — the log then
  names the exact flag that hangs. Windows self-clean after ~15 s.
- **Settings → Desktop → Pop-out window style** (Pill / Solid / Windowed) —
  switch to whatever the bisect proves works, no rebuild needed.

## 3. RE-TEST SCRIPT (owner, against the NEW installer)

**Setup:** uninstall Toodoo → install the fresh
`src-tauri/target/release/bundle/nsis/Toodoo_0.1.0_x64-setup.exe` → launch
normally (file logging is always on).

1. **Style bisect (do this FIRST — it decides everything):** run once from a
   terminal:
   `$env:TOODOO_DIAG_WINDOWS="styles"; & "$env:LOCALAPPDATA\Toodoo\Toodoo.exe"`
   → four small windows try to open (decorated / frameless / +transparent /
   full pill); hung ones are watchdog-killed; all close within ~20 s. Then
   **send toodoo.log** — it will name the exact chrome flag that hangs on
   your machine. Meanwhile set **Settings → Desktop → Pop-out window style**
   to the fanciest level that booted (likely **Solid** if transparency is the
   culprit) and re-run the pop-out tests below with it.
1b. **Watchdog proof** (optional, already proven by the bisect):
   `$env:TOODOO_DIAG_WINDOWS="watchdog"` → the Diag window self-closes ≤ ~5 s
   with an error toast and a `[window-watchdog]` log line.
2. **Focus pill:** Focus view → **↗**. Expect a small dark rounded pill
   (ring + mm:ss). Hover → pause/…-menu controls expand. Drag it around;
   drag it to touch the **top screen edge** → it docks into a slim progress
   bar; hover the bar → the pill slides back out. Esc or menu → Close.
   Reopen → position remembered.
   *If it opens white:* it should self-close in ~5 s with a toast; after two
   failures the ↗ opens an in-app panel instead. Either way, send toodoo.log.
3. **Sticky pill:** Sticky Notes → **↗** on a card. Expect a color-filled
   rounded pill: drag by body, resize via the corner grip, change color from
   the hover swatches, close with ✕ or Esc; reopen → size/position/color kept.
4. **Chirp:** Settings → Desktop → Notification sound → **Preview** (try the
   three variants, pick your favorite — tell me which to make default).
   Then set a reminder 2 min out: native toast (system sound) + in-app toast
   (chirp).
5. **Panes:** drag the divider right of the sidebar and left of the detail
   pane; double-click one to reset; restart the app → widths persist. Glance
   at calendar/kanban/timeline/matrix at extreme widths for anything broken.
6. **Pomodoro:** Focus → click the idle **25:00** clock → pick **10** (or
   custom) → the idle clock updates immediately → Start → runs a 10-minute
   session end-to-end. Also set Work minutes in Focus → Settings → idle clock
   follows. Confirm a *running* session ignores settings changes (by design).
7. **Anything fails:** Settings → Advanced → **Open logs folder** → send
   `toodoo.log` + which step.

## 4. REMAINING OPS (unchanged)

- Release-build perf audit (10k fixture; < 16 ms/frame, < 2 s cold start).
- Signing (or explicit "unsigned for v1.0" decision) + icon check.
- OS notification action-button behavior → decisions.md entry (either way).

## 5. RELEASE PROCEDURE — unchanged

1. Inventory audit → 2. suites green (cargo 205+1, vitest 146, playwright 19)
→ 3. backup/restore gate → 4. search perf gate → 5. manual checklist ✅ on the
installed build → 6. ops recorded → 7. README → 8. merge strategy + `git tag
v1.0.0`.

## Key file map (round-3 additions)

- Watchdog + creation: `src-tauri/src/desktop.rs` (`WatchState`,
  `request_popout`, `open_or_focus`, `PopoutStyle`); diag hooks
  `TOODOO_DIAG_WINDOWS=1|watchdog`, `TOODOO_DIAG_NOTIFY=1`.
- Fallback: `src/lib/popout.ts`, `src/components/layout/{FloatingPanel,PanelHost}.tsx`,
  Settings toggle in `DesktopSettings.tsx` (`popout.simple`).
- Pills: `src/windows/{pills.tsx,pillUtils.ts}`, `WindowRoot.tsx`;
  timer ownership + broadcast: `src/features/focus/FocusProvider.tsx`
  (`focus-state` / `focus-cmd`); persistence keys `popout:*`.
- Chirp: `scripts/gen-chirp.mjs`, `src/features/reminders/{assets/chirp/,hooks/useNotifSound.ts}`.
- Panes: `src/components/layout/{usePaneWidths.ts,PaneDivider.tsx}`,
  `e2e/panes.spec.ts` (`layout:panes` setting).
- Pomodoro: `src/features/focus/hooks/usePomodoro.ts` (idle resync, override,
  totalSec), quick picker in `FocusTimer.tsx`.
