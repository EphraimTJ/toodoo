# Toodoo — Build Plan
### A local-first, feature-complete TickTick Pro clone, built with Claude Code

---

## 1. Vision & Ground Rules

**Toodoo** is a desktop application that replicates the full TickTick Pro feature set, running entirely on your local machine. No accounts, no cloud, no subscription — your data lives in a local SQLite database you own.

**Guiding principles:**

- **Local-first.** All data stored locally; the app works fully offline. Sync is a future optional layer, not a dependency.
- **Feature parity with TickTick Pro**, adapted for single-user desktop use (see §3 for the complete inventory and §9 for the few features that only make sense with a cloud server, and how we adapt them).
- **API-compatible.** Toodoo ships a local REST API modeled on TickTick's Open API (`/open/v1` style endpoints for projects and tasks), so scripts, CLIs, and MCP integrations built for TickTick can be pointed at Toodoo with minimal changes.
- **Built incrementally with Claude Code**, one vertical slice at a time, with tests and git checkpoints at every phase.

---

## 2. Recommended Tech Stack

| Layer | Choice | Why |
|---|---|---|
| App shell | **Tauri 2** | Small binaries, native performance, real OS integration (tray, global hotkeys, notifications, multi-window for sticky notes). Electron is a fine fallback if you prefer an all-JS stack. |
| Frontend | **React 18 + TypeScript + Vite** | Ecosystem depth for the complex views (Kanban, Gantt/Timeline, Calendar). |
| State | **Zustand** (UI state) + **TanStack Query** (data layer over local API) | Simple, predictable, fast. |
| Styling | **Tailwind CSS** + Radix UI primitives | Rapid, accessible, themeable (light/dark/custom themes). |
| Database | **SQLite** (via `tauri-plugin-sql` or a Rust `sqlx` layer) + **FTS5** for full-text search | Single-file, durable, fast, easy to back up. |
| Recurrence | **rrule** (RFC 5545 RRULE) | Same standard TickTick uses internally; handles "every 3rd weekday of month" style rules. |
| Calendar rendering | **FullCalendar** (or custom) | Day/week/month/multi-week/agenda views out of the box. |
| Drag & drop | **dnd-kit** | Kanban columns, list reordering, calendar drag-to-reschedule. |
| Timeline/Gantt | **Custom SVG/canvas component** (Phase 8) | Nothing off-the-shelf matches TickTick's lightweight Gantt well; build it. |
| Charts (stats) | **Recharts** | Focus stats, habit stats, achievement trends. |
| Rich text (notes/description) | **TipTap** | Markdown-ish editing, checklists, images. |
| NLP date parsing | **chrono-node** + custom grammar | "tomorrow 5pm !high #errands every friday" → structured task. |
| Local API server | **Axum (Rust, inside Tauri)** or a Node sidecar | Serves the TickTick-compatible REST API on `localhost`. |
| Audio | Bundled white-noise loops + Web Audio API | Pomodoro ambience. |
| Testing | Vitest + React Testing Library + Playwright (E2E) + Rust unit tests | Claude Code writes tests per phase. |

> **Decision point before Phase 0:** Tauri (recommended) vs. Electron vs. plain local web app (`npm run dev` + browser). Tauri gives you global quick-add hotkeys, system tray, native notifications, and sticky-note windows — all features TickTick Pro has on desktop. A browser-only app loses those.

---

## 3. Complete Feature Inventory (TickTick Pro parity)

This is the checklist the whole project is graded against. Everything below ships in Toodoo.

### 3.1 Tasks
- Task CRUD: title, rich-text description/notes, priority (None/Low/Medium/High), tags (multi, nestable, colored), list/project assignment, sort order
- **Subtasks** (nested tasks) and **check items** (lightweight checklists inside a task) — both modes, like TickTick's "task vs. check item" toggle
- Start date, due date, all-day vs. timed, **task duration** (time spans on calendar)
- **Multiple reminders per task** (absolute + relative: "5 min before", "1 day before at 9am"), snooze
- **Recurring tasks**: daily/weekly/monthly/yearly, custom RRULEs (e.g., "last Friday of month"), lunar-calendar option (stretch), "repeat after completion" vs. fixed schedule, end conditions (never/after N/until date)
- **Smart date recognition (NLP quick-add)**: parse dates, times, recurrence, priority (`!high`), tags (`#tag`), and list (`~list`) from natural language as you type, with tap-to-dismiss highlights
- Task **templates**
- **Attachments** (files, images, audio) stored locally with per-task gallery
- Task **activity log** (created, completed, edited history)
- Comments on tasks (single-user: works as a running note/log thread)
- Pin tasks, "Won't Do" status, task duplication, convert note↔task, batch edit (multi-select: move, tag, date, priority, delete)
- Copy task link (`toodoo://task/<id>` URL scheme)
- **Location reminders** — see §9 (adapted: desktop geofencing isn't practical; we ship the data model + a manual "arrive/leave" trigger and mark true geofencing out of scope)

### 3.2 Lists, Folders & Organization
- Inbox + unlimited **lists/projects** (TickTick Pro cap is 299 — we won't cap)
- **Folders** to group lists; list colors, icons/emojis, view-type memory per list
- **Smart Lists**: Today, Tomorrow, Next 7 Days, Assigned to Me (adapted), All, Completed, Trash, Won't Do; show/hide/reorder smart lists
- **Custom Filters** (Pro): rule-based smart lists combining list, tag, priority, date range, keyword, task type, with AND/OR logic and advanced text syntax
- **Tags**: nested tags, tag colors, tag manager (rename/merge/delete), filter by tag
- Sorting: by date, priority, title, tag, custom (manual drag); **grouping** by list, date, priority, tag, none
- Completed tasks: show/hide per list, completed-by-date browsing; **Trash** with restore

### 3.3 Views
- **List view** (classic)
- **Kanban view** per list: custom columns/sections, drag between columns, column WIP display, collapse
- **Timeline (Gantt) view** (Pro): tasks as bars across dates, drag to reschedule/resize, group lanes, zoom day/week/month
- **Calendar views** (Pro): Day, Week (5/7-day), Month, **Multi-week**, Agenda/List-by-day; drag-and-drop scheduling from an "unscheduled tasks" arrange panel; time-block by dragging on the grid
- **Eisenhower Matrix** (Pro): 4 quadrants with **editable quadrant rules** (each quadrant is a saved filter), drag between quadrants to re-prioritize
- Per-view display options (show/hide completed, detail density, weekend shading, week start day)

### 3.4 Calendar Platform Features
- **Calendar subscriptions** (Pro): subscribe to external ICS/iCal URLs (read-only overlay), refresh interval, per-calendar color/visibility
- Import `.ics` files; **export lists/calendar as ICS**
- Local "calendar events" as first-class items alongside tasks (TickTick distinguishes tasks vs. events)

### 3.5 Focus / Pomodoro (Pro)
- **Pomo timer**: configurable work/short-break/long-break durations, long-break interval, auto-start options, daily pomo goal
- **Stopwatch mode** (count-up focus)
- Attach a focus session to a task or habit; **focus notes** per session
- **White noise / ambient sounds** during focus
- Mini floating focus window + tray countdown
- **Focus statistics** (Pro): daily/weekly/monthly focus duration, pomo counts, per-task/per-tag focus distribution, trend charts, focus record timeline (with manual add/edit of records)
- Estimated pomos / estimated duration per task, vs. actual

### 3.6 Habits (Pro)
- Habit CRUD: name, icon, color, quote/motivation, goal type (simple check-in / target amount with units, e.g. "8 glasses"), frequency (daily, specific weekdays, X days per week/month), reminders, habit sections (Morning/Afternoon/Night/custom), start date
- Check-in flows: check, partial progress, skip, log with note; retroactive check-ins
- **Streaks**, monthly grid, habit calendar heatmap, per-habit statistics (total check-ins, streak best/current, completion rate)
- Habit log/journal; archive/restore habits; habit library of presets

### 3.7 Countdown (Pro)
- Countdown items: event name, target date, repeat (annual birthdays/anniversaries), cover styles/colors
- Days-since (count-up) mode; pin countdowns; countdown detail cards

### 3.8 Notes & Sticky Notes
- **Note-type items** (a list can be a "note list"; notes have no due date semantics, support rich text)
- **Desktop Sticky Notes**: pop any note/task out as an always-on-top mini window, with color options

### 3.9 Search
- Global full-text search across tasks, descriptions, check items, notes, comments, attachments' names, habits, tags
- Search filters (list, tag, date, completed), recent searches, saved searches

### 3.10 Statistics & Gamification
- **Achievement score** with level tiers, score history (earn for completing on time, lose for overdue)
- **Weekly/monthly summary** reports: completion rate, tasks completed, focus time, best day/hour heatmaps
- Daily/weekly completion charts, procrastination stats

### 3.11 Desktop UX (the "feel" of TickTick)
- **Global quick-add hotkey** (system-wide), full in-app shortcut map, command palette (⌘K)
- System tray with today count + quick actions; launch at login; native notifications with action buttons (Complete / Snooze)
- **Themes** (Pro): light/dark/auto + color themes + custom accent; font size options
- Multi-language-ready i18n scaffolding (English first)
- Drag task → email-style "share as text/markdown/image" export of a task or list

### 3.12 Data, Import/Export, Integration
- **Backup/restore**: one-click full backup (SQLite snapshot + attachments), scheduled auto-backup
- **Import**: TickTick backup CSV, Todoist export, generic CSV; **Export**: CSV, JSON, ICS, Markdown
- **Local REST API (TickTick Open API compatible)**: OAuth-less local token auth; endpoints mirroring `GET /open/v1/project`, `GET /open/v1/project/{id}/data`, `POST /open/v1/task`, `POST /open/v1/task/{id}`, `POST /open/v1/project/{pid}/task/{tid}/complete`, `DELETE …` — plus Toodoo extensions for habits, focus, filters
- `toodoo://` URL scheme (open task/list, quick add)
- Optional **MCP server** exposing Toodoo to Claude and other AI agents (huge quality-of-life win since you're already using Claude Code)

### 3.13 Adapted / Deferred (see §9)
- Collaboration (shared lists, assignees, roles) — data model included, UI deferred; meaningless without multi-user sync
- Cross-device cloud sync — architecture leaves room (see §4.4), not in scope
- Mobile widgets, Siri, Apple Health import — platform-specific, out of scope
- AI features — optional stretch phase using a local or API LLM

---

## 4. Architecture

### 4.1 High-level shape

```
┌────────────────────────────────────────────────────┐
│ Tauri App                                          │
│  ┌──────────────┐   IPC / localhost HTTP           │
│  │ React UI     │◄────────────────────────┐        │
│  │ (views,      │                         │        │
│  │  quick-add,  │                  ┌──────┴──────┐ │
│  │  sticky wins)│                  │ Rust Core   │ │
│  └──────────────┘                  │  - SQLite   │ │
│         ▲                          │  - Scheduler│ │
│         │ native APIs              │  - RRULE    │ │
│  ┌──────┴───────┐                  │  - FTS      │ │
│  │ Tray, hotkey,│                  │  - Local    │ │
│  │ notifications│                  │    REST API │ │
│  └──────────────┘                  └──────┬──────┘ │
└───────────────────────────────────────────┼────────┘
                                            │ localhost:7420
                              scripts / MCP / CLI / anything
                              that speaks the TickTick API
```

### 4.2 Core subsystems
- **Repository layer** (Rust): all reads/writes go through typed repository functions; the UI never touches SQL directly. This is what makes the local REST API and the UI share one source of truth.
- **Scheduler daemon** (background thread): wakes for reminders, recurring-task materialization, habit reminders, ICS refresh, auto-backup. Persistent job queue table so reminders survive restarts; on launch, fire "missed while closed" notifications.
- **Recurrence engine**: recurring tasks store an RRULE + "repeat from completion vs. due date" flag. Only the *current* occurrence is materialized; completing it computes and writes the next one (this is how TickTick behaves).
- **Search**: SQLite FTS5 virtual tables kept in sync via triggers.
- **Event bus**: every mutation emits an event (task.updated, habit.checked…) consumed by the UI (live updates), the stats engine, and the activity log.

### 4.3 Data model (first cut)

```
folders(id, name, color, sort_order)
projects(id, folder_id, name, color, icon, kind[TASK|NOTE], view_mode, muted, sort_order, closed)
sections(id, project_id, name, sort_order)               -- kanban columns
tasks(id, project_id, section_id, parent_id, title, content_rich, kind[TASK|CHECKLIST|NOTE],
      status[ACTIVE|COMPLETED|WONT_DO|TRASHED], priority, start_at, due_at, is_all_day,
      duration_min, time_zone, rrule, repeat_from, pinned, est_pomos, est_duration_min,
      completed_at, created_at, updated_at, sort_orders_json)
check_items(id, task_id, title, done, sort_order, start_at)
tags(id, name, color, parent_id, sort_order)      task_tags(task_id, tag_id)
reminders(id, task_id, trigger_kind[ABS|REL], at, offset_min, snoozed_until)
attachments(id, task_id, path, mime, size, created_at)
comments(id, task_id, body, created_at)
activity(id, entity_kind, entity_id, action, payload_json, at)
filters(id, name, rule_json, sort_order)                  -- custom smart lists
matrix_config(quadrant, rule_json)                        -- editable Eisenhower rules
habits(id, name, icon, color, quote, goal_kind, goal_amount, unit, freq_json,
       section, reminders_json, start_date, archived, sort_order)
habit_checkins(id, habit_id, date, value, status[DONE|PARTIAL|SKIP], note)
focus_sessions(id, task_id?, habit_id?, kind[POMO|STOPWATCH], started_at, ended_at,
               pause_ms, note, status)
countdowns(id, title, target_date, repeat_annual, style_json, pinned)
cal_subscriptions(id, url, name, color, visible, refresh_min, last_fetch)
cal_events(id, subscription_id?, uid, title, start_at, end_at, all_day, location, notes)
settings(key, value_json)   sticky_notes(id, task_id?, note_id?, x, y, w, h, color, open)
achievements(date, score_delta, reason)    saved_searches(id, query, filters_json)
```

### 4.4 Future-proofing for sync (do now, cheap)
- Every row: `uuid` primary keys, `updated_at`, soft-delete `deleted_at`
- All mutations append to a `changelog` table → later a sync layer (or CRDT) can replay it. Costs almost nothing today; saves a rewrite tomorrow.

---

## 5. Phased Build Plan (Claude Code roadmap)

Each phase is a self-contained vertical slice: schema → repository → API → UI → tests → git tag. Do them in order; every phase leaves the app shippable. Estimated sessions assume focused Claude Code sessions of 1–3 hours.

### Phase 0 — Scaffold & Foundations (1–2 sessions)
**Ship:** empty Tauri+React app that boots, with DB migrations, theming shell, CI, and CLAUDE.md.
- `npm create tauri-app` → React-TS template; Tailwind + Radix; ESLint/Prettier; Vitest + Playwright wiring
- SQLite migration system (e.g., `sqlx migrate` or refinery); migration 0001 = full schema from §4.3
- Repository crate with 2–3 example functions + unit tests; event bus skeleton
- App chrome: sidebar / main pane / detail pane 3-column layout, light+dark theme toggle
- Write `CLAUDE.md` (see §6) and commit

### Phase 1 — Core Tasks & Lists (2–3 sessions)
**Ship:** a genuinely usable todo app.
- Projects/folders CRUD in sidebar (drag to reorder, colors, icons)
- Task list view: add, complete (with satisfying animation), edit-in-place, priorities, drag reorder
- Task detail pane: rich-text description (TipTap), check items, subtasks, tags, dates
- Smart lists: Inbox, Today, Tomorrow, Next 7 Days, All, Completed, Trash
- Sorting & grouping menus; batch multi-select operations
- FTS5 search with ⌘K command palette

### Phase 2 — Dates, Reminders, Recurrence (2–3 sessions)
**Ship:** the scheduling brain.
- Date picker parity: start/due, all-day vs timed, duration, time zone
- RRULE engine + custom repeat editor UI; repeat-from-completion mode; end conditions
- Scheduler daemon + native notifications with Complete/Snooze actions; missed-reminder catch-up
- **NLP quick-add**: global hotkey opens a floating quick-add window; chrono-node grammar for dates/`!priority`/`#tag`/`~list`/`every …` with inline highlight chips
- Task templates; pin; Won't Do; activity log

### Phase 3 — Kanban & Custom Filters (1–2 sessions)
- Sections/columns per list; Kanban view with dnd-kit; per-list view-mode memory
- Custom Filters builder UI (rule JSON → smart list), advanced query syntax parser
- Eisenhower Matrix view with editable quadrant rules + drag-between-quadrants

### Phase 4 — Calendar (2–3 sessions)
- Day/Week/Multi-week/Month/Agenda views; drag-to-create, drag-to-move, resize-to-extend duration
- "Arrange tasks" side panel (drag unscheduled tasks onto the grid)
- ICS subscriptions (fetch on interval, read-only overlay) + .ics import/export
- Calendar events as first-class local items

### Phase 5 — Focus / Pomodoro (1–2 sessions)
- Pomo + stopwatch, per-task attachment, settings, daily goal
- White noise player; mini always-on-top focus window; tray countdown
- Focus records (manual add/edit) + statistics dashboards (Recharts)
- Estimated vs actual pomos on tasks

### Phase 6 — Habits (1–2 sessions)
- Habit CRUD with goal types, frequencies, sections, reminders, preset library
- Check-in interactions (tap, amount progress, skip, retro-log with note)
- Streaks, monthly grid, heatmap, per-habit stats; archive

### Phase 7 — Countdown, Notes, Sticky Notes (1 session)
- Countdown module with annual repeat + styles
- Note-kind lists/items; convert note↔task
- Sticky notes: pop-out always-on-top Tauri windows, position/color persisted

### Phase 8 — Timeline (Gantt) View (1–2 sessions)
- Custom timeline component: rows grouped by section/list, bars from start→due, drag to move, edge-drag to resize, zoom levels, today marker
- Virtualized rendering for large lists

### Phase 9 — Stats, Achievement, Summary (1 session)
- Achievement score engine (event-bus consumer) + level tiers + history chart
- Weekly/monthly summary screens: completion rate, best day/hour heatmap, focus totals, procrastination stats

### Phase 10 — Local API, URL Scheme, MCP (1–2 sessions)
- Axum server on `localhost:7420`, bearer-token auth, TickTick-compatible endpoints (§3.12) + Toodoo extensions; OpenAPI spec generated
- `toodoo://` deep links (open/add)
- Optional: thin MCP server wrapping the API so Claude can manage your tasks

### Phase 11 — Data Safety & Import/Export (1 session)
- One-click + scheduled backups (DB snapshot + attachments zip), restore flow
- Importers: TickTick backup CSV, Todoist, generic CSV; exporters: CSV/JSON/ICS/Markdown

### Phase 12 — Polish Pass (1–2 sessions)
- Full keyboard-shortcut map + cheatsheet overlay; launch-at-login; tray menu
- Theme gallery (accent colors), font sizing, animation/perf audit (10k-task test fixture)
- Onboarding seed data; app icon; packaging/signing for your OS; auto-update optional

**Total: roughly 16–24 focused Claude Code sessions.**

---

## 6. CLAUDE.md — drop this in the repo root at Phase 0

```markdown
# Toodoo — TickTick Pro clone (local-first desktop app)

## Stack
Tauri 2 (Rust core) + React 18 + TypeScript + Vite + Tailwind + Radix.
SQLite via sqlx; FTS5 for search; rrule for recurrence; dnd-kit; FullCalendar; TipTap; Recharts.

## Architecture rules
- ALL data access goes through the Rust repository layer (src-tauri/src/repo/).
  The React app calls Tauri commands or the local REST API — never raw SQL.
- Every mutation emits an event on the event bus AND appends to `changelog`.
- UUID PKs, `updated_at`, soft deletes everywhere. Migrations are append-only.
- Recurring tasks: store RRULE, materialize only the current occurrence;
  completing computes the next occurrence (respect repeat_from = COMPLETION|DUE).

## Conventions
- TypeScript strict; no `any`. Rust: clippy clean, thiserror for errors.
- Feature folders: src/features/<feature>/{components,hooks,api,tests}.
- Every phase: write tests first for repo logic, component tests for UI,
  one Playwright happy-path per feature. Run `npm test` + `cargo test` before commit.
- Conventional commits; tag `phase-N` when a phase's checklist is done.

## Product truth
- docs/feature-inventory.md is the spec (mirrors TickTick Pro). If ambiguous,
  match TickTick's observed behavior and note the decision in docs/decisions.md.

## Commands
- `npm run tauri dev` — run app | `npm test` — frontend tests
- `cargo test` (in src-tauri) — core tests | `npm run e2e` — Playwright
```

Also create `docs/feature-inventory.md` from §3 of this plan, with checkboxes — Claude Code will use it as the living spec and tick items off.

---

## 7. How to run the project with Claude Code

1. **Session ritual:** start each phase with Plan Mode — ask Claude to read `docs/feature-inventory.md` and the phase checklist, propose an implementation plan, and only then implement. Review the plan before approving.
2. **One phase = one branch.** Merge when the phase checklist and tests pass; tag `phase-N`. Small, reviewable diffs beat mega-sessions.
3. **Tests as the contract.** Ask Claude to write repository tests before implementation for tricky logic (recurrence, filter query parser, achievement scoring, streak math). These are the areas where regressions hide.
4. **Use subagents for research-y detours** (e.g., "investigate how FullCalendar handles multi-week views") so the main context stays focused on building.
5. **Feed it references.** When cloning a specific behavior, paste screenshots of TickTick or describe the exact interaction; "match this" prompts produce much better parity than prose specs.
6. **Fixture data early.** Have Claude generate a 10k-task seed script in Phase 1; test perf continuously, not at the end.
7. **Keep CLAUDE.md alive.** When you correct Claude twice on the same thing, encode the rule in CLAUDE.md.

Example phase kickoff prompt:

> Read CLAUDE.md and docs/feature-inventory.md. We're starting Phase 2 (Dates, Reminders, Recurrence). Enter plan mode: propose the schema changes, the Rust recurrence module API, the scheduler design, and the UI components, with a test plan. Flag anything ambiguous about TickTick's behavior before coding.

Claude Code docs: https://docs.claude.com/en/docs/claude-code/overview

---

## 8. Testing & Quality Gates

- **Unit (Rust):** recurrence next-occurrence math (table-driven, incl. DST/leap-year cases), filter rule evaluation, streak calculation, achievement scoring, ICS parsing
- **Unit (TS):** NLP quick-add parser (a big table of phrases → expected task fields), date formatting, keyboard-shortcut dispatch
- **Component:** task row interactions, Kanban drag, matrix drag, habit check-in states
- **E2E (Playwright):** create→schedule→complete recurring task; pomo session lifecycle; backup+restore round-trip; import TickTick CSV
- **Perf budget:** list render < 16 ms/frame with 10k tasks (virtualized), app cold start < 2 s, search < 50 ms
- **Data safety:** migration tests run against a copy of a real DB before every release; auto-backup before migrations

---

## 9. Scope Adaptations & Risks

| TickTick Pro feature | Toodoo approach |
|---|---|
| Shared lists, assignees, collaboration | Schema supports `assignee`/membership tables from day one; UI deferred until/unless a sync server exists. |
| Cloud sync across devices | Out of scope; changelog table (§4.4) keeps the door open. Interim option: keep the SQLite file in a synced folder (single-writer only — document the caveat). |
| Location reminders (geofencing) | Data model + manual trigger only; desktop OSes don't do geofencing well. Marked as known gap. |
| Mobile apps, widgets, Siri, watch | Out of scope (desktop app). Sticky notes + tray + global hotkey cover the desktop equivalents. |
| AI features (smart parse+, AI summaries) | Optional Phase 13 stretch: wire the local API to an LLM for "plan my day" / natural-language batch edits. |
| Third-party calendar *account* sync (Google/Outlook OAuth two-way) | Ship ICS subscribe/import/export first (covers read use-cases). Two-way Google sync is a large stretch goal — treat as its own project. |

**Biggest technical risks (front-load these):** recurrence correctness (Phase 2), the custom Timeline view (Phase 8), calendar drag interactions (Phase 4), and NLP parsing quality (Phase 2). Everything else is well-trodden CRUD + views.

---

## 10. Definition of Done

Toodoo v1.0 is done when every unchecked box in `docs/feature-inventory.md` (§3, minus §3.13 deferrals) is checked, the test suite is green, a 10k-task database stays smooth, backup/restore round-trips losslessly, and a TickTick-API script pointed at `localhost:7420` can list projects and create/complete tasks without modification beyond the base URL and token.
