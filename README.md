# Toodoo

A **local-first desktop task manager** — a feature-faithful clone of TickTick Pro, built with Tauri 2 (Rust) + React 18 + TypeScript. All data lives in a local SQLite database; no account, no cloud, no telemetry.

## Features

- **Tasks**: subtasks (4 levels), check items, priorities, tags (nested), templates, duplication, Won't-Do, trash with restore, pinning, batch date/priority tools
- **Recurrence**: full RRULE engine (daily/weekly/monthly-by-weekday/yearly/interval/COUNT/UNTIL, repeat-from completion or due), idempotent completion with an occurrence ledger
- **Views**: list, kanban, timeline (Gantt), calendar (FullCalendar: drag, resize, ICS import/export, live ICS subscriptions), Eisenhower matrix, custom filters with a text query grammar
- **Smart lists**: Today, Next 7 Days, Inbox, Won't Do, and more — configurable
- **Search**: FTS5 full-text over tasks, notes, check items, habits, tags; saved + recent searches
- **Focus**: pomodoro + stopwatch with pause tracking, ambient sounds, statistics, TickTick-style always-on-top mini pill window with top-edge docking
- **Habits**: daily/weekday/times-per-week/month frequencies, amount goals, skip-neutral streaks, reminders
- **Notes & stickies**: note lists, countdowns, sticky-note board with always-on-top pill pop-outs
- **Stats**: achievement score, levels, weekly/monthly summaries
- **Reminders**: 30s scheduler with launch catch-up, claim/ack delivery with bounded retry, native Windows toasts with **Complete / Snooze action buttons**, in-app toast fallback with a synthesized "toodoo" chirp
- **Desktop**: system tray (Today count, quick actions), **close-to-tray**, single instance, global quick-add hotkey with NLP parsing ("pay rent tomorrow 5pm #bills !high"), launch-at-login (optionally minimized), `toodoo://` deep links
- **Data safety**: validated + rollback-protected backup/restore (`VACUUM INTO`), hourly auto-backup, atomic CSV import (TickTick/Todoist/generic), full export
- **Local REST API**: opt-in, TickTick-Open-API-shaped, `127.0.0.1` only, bearer-token auth, OpenAPI spec at `/openapi.json`
- **Appearance**: light/dark/auto theme, accent colors, font scaling, i18n scaffolding, keyboard shortcuts with a `?` cheatsheet

## Install (Windows)

Grab the NSIS installer from [Releases](../../releases). The build is currently **unsigned** — SmartScreen will warn on first run (More info → Run anyway).

## Development

```sh
npm install
npm run tauri dev   # run the desktop app
npm test            # frontend tests (vitest)
cargo test          # core tests (run in src-tauri/)
npm run e2e         # Playwright E2E (browser stub)
npm run tauri build # release build (NSIS + MSI)
```

## Architecture

- All data access goes through the Rust repository layer (`src-tauri/src/repo/`); the React app talks to it via Tauri commands (or the REST API). Every mutation emits a domain event and appends to a changelog. UUID keys, soft deletes, append-only migrations.
- E2E runs in a browser against an in-memory API stub; native behavior (tray, windows, notifications) is unit-tested where pure and verified via `docs/manual-test-checklist.md`.
- `docs/feature-inventory.md` is the spec; every deliberate deviation from TickTick's behavior is recorded in `docs/decisions.md`.

## Status

v1.0.0 — Windows is the primary target (macOS/Linux untested). Deferred post-1.0: attachments, MCP server, collaboration/sync, lunar recurrence, location reminders.
