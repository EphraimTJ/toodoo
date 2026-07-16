# Toodoo — Feature Inventory (living spec)

This is the checklist the whole project is graded against, converted from §3 of
`toodoo-build-plan.md` (TickTick Pro parity). Rules:

- **This is the living spec.** Check items off (`[x]`) only when they ship with tests.
- **Never delete items.** If scope changes, leave the item and record the decision in
  `docs/decisions.md`.
- When behavior is ambiguous, match TickTick's observed behavior and note it in
  `docs/decisions.md`.

## 3.1 Tasks

- [x] Task CRUD
  - [x] Title
  - [x] Rich-text description/notes
  - [x] Priority (None/Low/Medium/High)
  - [x] Tags (multi, nestable, colored)
  - [x] List/project assignment
  - [x] Sort order
- [x] Subtasks (nested tasks)
- [x] Check items (lightweight checklists inside a task)
- [x] Task vs. check item toggle (both modes, like TickTick)
- [x] Start date
- [x] Due date
- [x] All-day vs. timed
- [x] Task duration (time spans on calendar)
- [x] Multiple reminders per task — add/list/delete shipped; scheduler fires them
  - [x] Absolute reminders
  - [x] Relative reminders ("5 min before", "1 day before at 9am")
  - [x] Snooze (in-app snooze control; notification-button snooze pending in 12D)
- [ ] Recurring tasks
  - [x] Daily/weekly/monthly/yearly
  - [x] Custom RRULEs (e.g., "last Friday of month")
  - [ ] Lunar-calendar option (stretch)
  - [x] "Repeat after completion" vs. fixed schedule
  - [x] End conditions (never / after N / until date)
- [ ] Smart date recognition (NLP quick-add)
  - [ ] Parse dates and times
  - [ ] Parse recurrence ("every friday")
  - [ ] Parse priority (`!high`)
  - [ ] Parse tags (`#tag`)
  - [ ] Parse list (`~list`)
  - [ ] Inline highlights with tap-to-dismiss
- [x] Task templates
- [ ] Attachments (files, images, audio) stored locally
  - [ ] Per-task gallery
- [x] Task activity log (created, completed, edited history)
- [x] Comments on tasks (single-user: running note/log thread)
- [x] Pin tasks
- [x] "Won't Do" status
- [x] Task duplication
- [x] Convert note ↔ task
- [x] Batch edit (multi-select: move, tag, date, priority, delete)
- [x] Copy task link (`toodoo://task/<id>` URL scheme)
- [ ] Location reminders (adapted per §9: data model + manual "arrive/leave"
      trigger; true desktop geofencing out of scope)

## 3.2 Lists, Folders & Organization

- [x] Inbox
- [x] Unlimited lists/projects (no cap)
- [x] Folders to group lists
- [x] List colors
- [x] List icons/emojis
- [x] View-type memory per list
- [ ] Smart Lists
  - [x] Today
  - [x] Tomorrow
  - [x] Next 7 Days
  - [ ] Assigned to Me (adapted)
  - [x] All
  - [x] Completed
  - [x] Trash
  - [x] Won't Do
  - [x] Show/hide/reorder smart lists
- [x] Custom Filters (Pro)
  - [x] Rule-based smart lists combining list, tag, priority, date range,
        keyword, task type
  - [x] AND/OR logic
  - [x] Advanced text syntax
- [x] Tags
  - [x] Nested tags
  - [x] Tag colors
  - [x] Tag manager (rename/merge/delete)
  - [x] Filter by tag
- [x] Sorting: by date, priority, title, tag, custom (manual drag)
- [x] Grouping: by list, date, priority, tag, none
- [x] Completed tasks: show/hide per list
- [x] Completed-by-date browsing
- [x] Trash with restore

## 3.3 Views

- [x] List view (classic)
- [x] Kanban view per list
  - [x] Custom columns/sections
  - [x] Drag between columns
  - [x] Column WIP display
  - [x] Collapse columns
- [x] Timeline (Gantt) view (Pro)
  - [x] Tasks as bars across dates
  - [x] Drag to reschedule / resize
  - [x] Group lanes
  - [x] Zoom day/week/month
- [x] Calendar views (Pro)
  - [x] Day
  - [x] Week (5/7-day)
  - [x] Month
  - [x] Multi-week
  - [x] Agenda/List-by-day
  - [x] "Unscheduled tasks" arrange panel with drag-and-drop scheduling
  - [x] Time-block by dragging on the grid
- [x] Eisenhower Matrix (Pro)
  - [x] 4 quadrants
  - [x] Editable quadrant rules (each quadrant is a saved filter)
  - [x] Drag between quadrants to re-prioritize
- [x] Per-view display options
  - [x] Show/hide completed
  - [x] Detail density
  - [x] Weekend shading
  - [x] Week start day

## 3.4 Calendar Platform Features

- [x] Calendar subscriptions (Pro): external ICS/iCal URLs (read-only overlay)
  - [x] Refresh interval
  - [x] Per-calendar color/visibility
- [x] Import `.ics` files
- [x] Export lists/calendar as ICS
- [x] Local calendar events as first-class items alongside tasks

## 3.5 Focus / Pomodoro (Pro)

- [x] Pomo timer
  - [x] Configurable work/short-break/long-break durations
  - [x] Long-break interval
  - [x] Auto-start options
  - [x] Daily pomo goal
- [x] Stopwatch mode (count-up focus)
- [x] Attach a focus session to a task or habit
- [x] Focus notes per session
- [x] White noise / ambient sounds during focus
- [ ] Mini floating focus window — deferred to Phase 12 (desktop pass)
- [ ] Tray countdown — deferred to Phase 12 (desktop pass)
- [x] Focus statistics (Pro)
  - [x] Daily/weekly/monthly focus duration
  - [x] Pomo counts
  - [x] Per-task/per-tag focus distribution
  - [x] Trend charts
  - [x] Focus record timeline with manual add/edit of records
- [x] Estimated pomos / estimated duration per task, vs. actual

## 3.6 Habits (Pro)

- [x] Habit CRUD
  - [x] Name, icon, color, quote/motivation
  - [x] Goal type: simple check-in
  - [x] Goal type: target amount with units (e.g., "8 glasses")
  - [x] Frequency: daily, specific weekdays, X days per week/month
  - [x] Reminders
  - [x] Habit sections (Morning/Afternoon/Night/custom)
  - [x] Start date
- [x] Check-in flows
  - [x] Check
  - [x] Partial progress
  - [x] Skip
  - [x] Log with note
  - [x] Retroactive check-ins
- [x] Streaks
- [x] Monthly grid
- [x] Habit calendar heatmap
- [x] Per-habit statistics (total check-ins, streak best/current, completion rate)
- [x] Habit log/journal
- [x] Archive/restore habits
- [x] Habit library of presets

## 3.7 Countdown (Pro)

- [x] Countdown items: event name, target date
- [x] Repeat (annual birthdays/anniversaries)
- [x] Cover styles/colors
- [x] Days-since (count-up) mode
- [x] Pin countdowns
- [x] Countdown detail cards

## 3.8 Notes & Sticky Notes

- [x] Note-type items (a list can be a "note list"; notes have no due date
      semantics, support rich text)
- [ ] Desktop Sticky Notes: pop any note/task out as an always-on-top mini window
      — in-app sticky board shipped; the always-on-top pop-out window is deferred
      to Phase 12 (desktop pass)
  - [x] Color options

## 3.9 Search

- [x] Global full-text search across tasks, descriptions, check items, notes,
      habits, tags (comments + attachment names join in 12B when they ship)
- [x] Search filters (list, tag, date, completed)
- [x] Recent searches
- [x] Saved searches

## 3.10 Statistics & Gamification

- [x] Achievement score with level tiers
- [x] Score history (earn for completing on time, lose for overdue)
- [x] Weekly/monthly summary reports
  - [x] Completion rate
  - [x] Tasks completed
  - [x] Focus time
  - [x] Best day/hour heatmaps
- [x] Daily/weekly completion charts
- [x] Procrastination stats

## 3.11 Desktop UX

- [ ] Global quick-add hotkey (system-wide)
- [ ] Full in-app shortcut map
- [x] Command palette (⌘K)
- [ ] System tray with today count + quick actions
- [ ] Launch at login
- [ ] Native notifications with action buttons (Complete / Snooze)
- [ ] Themes (Pro): light/dark/auto
  - [ ] Color themes + custom accent
  - [ ] Font size options
- [ ] Multi-language-ready i18n scaffolding (English first)
- [ ] Share task/list as text/markdown/image export

## 3.12 Data, Import/Export, Integration

- [x] Backup/restore
  - [x] One-click full backup (SQLite snapshot; attachments not yet implemented)
  - [x] Scheduled auto-backup
  - [x] Restore flow
- [x] Import: TickTick backup CSV
- [x] Import: Todoist export
- [x] Import: generic CSV
- [x] Export: CSV
- [x] Export: JSON
- [x] Export: ICS
- [x] Export: Markdown
- [x] Local REST API (TickTick Open API compatible)
  - [x] Local token auth (OAuth-less)
  - [x] `GET /open/v1/project`
  - [x] `GET /open/v1/project/{id}/data`
  - [x] `POST /open/v1/task`
  - [x] `POST /open/v1/task/{id}`
  - [x] `POST /open/v1/project/{pid}/task/{tid}/complete`
  - [x] `DELETE …` endpoints
  - [x] Toodoo extensions for habits, focus, filters
- [x] `toodoo://` URL scheme (open task/list, quick add)
- [ ] Optional MCP server exposing Toodoo to Claude and other AI agents

## 3.13 Adapted / Deferred (see §9 of the build plan)

- [ ] Collaboration (shared lists, assignees, roles) — data model included;
      UI deferred (meaningless without multi-user sync)
- [ ] Cross-device cloud sync — architecture leaves room (changelog table);
      not in scope
- [ ] Mobile widgets, Siri, Apple Health import — out of scope (platform-specific)
- [ ] AI features — optional stretch phase using a local or API LLM
