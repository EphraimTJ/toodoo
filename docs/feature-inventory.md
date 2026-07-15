# Toodoo — Feature Inventory (living spec)

This is the checklist the whole project is graded against, converted from §3 of
`toodoo-build-plan.md` (TickTick Pro parity). Rules:

- **This is the living spec.** Check items off (`[x]`) only when they ship with tests.
- **Never delete items.** If scope changes, leave the item and record the decision in
  `docs/decisions.md`.
- When behavior is ambiguous, match TickTick's observed behavior and note it in
  `docs/decisions.md`.

## 3.1 Tasks

- [ ] Task CRUD
  - [x] Title
  - [x] Rich-text description/notes
  - [x] Priority (None/Low/Medium/High)
  - [ ] Tags (multi, nestable, colored) — multi + colored shipped; nesting pending
  - [x] List/project assignment
  - [x] Sort order
- [x] Subtasks (nested tasks)
- [x] Check items (lightweight checklists inside a task)
- [ ] Task vs. check item toggle (both modes, like TickTick)
- [x] Start date
- [x] Due date
- [ ] All-day vs. timed
- [ ] Task duration (time spans on calendar)
- [ ] Multiple reminders per task
  - [ ] Absolute reminders
  - [ ] Relative reminders ("5 min before", "1 day before at 9am")
  - [ ] Snooze
- [ ] Recurring tasks
  - [ ] Daily/weekly/monthly/yearly
  - [ ] Custom RRULEs (e.g., "last Friday of month")
  - [ ] Lunar-calendar option (stretch)
  - [ ] "Repeat after completion" vs. fixed schedule
  - [ ] End conditions (never / after N / until date)
- [ ] Smart date recognition (NLP quick-add)
  - [ ] Parse dates and times
  - [ ] Parse recurrence ("every friday")
  - [ ] Parse priority (`!high`)
  - [ ] Parse tags (`#tag`)
  - [ ] Parse list (`~list`)
  - [ ] Inline highlights with tap-to-dismiss
- [ ] Task templates
- [ ] Attachments (files, images, audio) stored locally
  - [ ] Per-task gallery
- [ ] Task activity log (created, completed, edited history)
- [ ] Comments on tasks (single-user: running note/log thread)
- [ ] Pin tasks
- [ ] "Won't Do" status
- [ ] Task duplication
- [ ] Convert note ↔ task
- [x] Batch edit (multi-select: move, tag, date, priority, delete)
- [ ] Copy task link (`toodoo://task/<id>` URL scheme)
- [ ] Location reminders (adapted per §9: data model + manual "arrive/leave"
      trigger; true desktop geofencing out of scope)

## 3.2 Lists, Folders & Organization

- [x] Inbox
- [x] Unlimited lists/projects (no cap)
- [x] Folders to group lists
- [x] List colors
- [x] List icons/emojis
- [ ] View-type memory per list
- [ ] Smart Lists
  - [x] Today
  - [x] Tomorrow
  - [x] Next 7 Days
  - [ ] Assigned to Me (adapted)
  - [x] All
  - [x] Completed
  - [x] Trash
  - [ ] Won't Do
  - [ ] Show/hide/reorder smart lists
- [ ] Custom Filters (Pro)
  - [ ] Rule-based smart lists combining list, tag, priority, date range,
        keyword, task type
  - [ ] AND/OR logic
  - [ ] Advanced text syntax
- [ ] Tags
  - [ ] Nested tags
  - [x] Tag colors
  - [ ] Tag manager (rename/merge/delete)
  - [x] Filter by tag
- [x] Sorting: by date, priority, title, tag, custom (manual drag)
- [x] Grouping: by list, date, priority, tag, none
- [x] Completed tasks: show/hide per list
- [x] Completed-by-date browsing
- [x] Trash with restore

## 3.3 Views

- [x] List view (classic)
- [ ] Kanban view per list
  - [ ] Custom columns/sections
  - [ ] Drag between columns
  - [ ] Column WIP display
  - [ ] Collapse columns
- [ ] Timeline (Gantt) view (Pro)
  - [ ] Tasks as bars across dates
  - [ ] Drag to reschedule / resize
  - [ ] Group lanes
  - [ ] Zoom day/week/month
- [ ] Calendar views (Pro)
  - [ ] Day
  - [ ] Week (5/7-day)
  - [ ] Month
  - [ ] Multi-week
  - [ ] Agenda/List-by-day
  - [ ] "Unscheduled tasks" arrange panel with drag-and-drop scheduling
  - [ ] Time-block by dragging on the grid
- [ ] Eisenhower Matrix (Pro)
  - [ ] 4 quadrants
  - [ ] Editable quadrant rules (each quadrant is a saved filter)
  - [ ] Drag between quadrants to re-prioritize
- [ ] Per-view display options
  - [ ] Show/hide completed
  - [ ] Detail density
  - [ ] Weekend shading
  - [ ] Week start day

## 3.4 Calendar Platform Features

- [ ] Calendar subscriptions (Pro): external ICS/iCal URLs (read-only overlay)
  - [ ] Refresh interval
  - [ ] Per-calendar color/visibility
- [ ] Import `.ics` files
- [ ] Export lists/calendar as ICS
- [ ] Local calendar events as first-class items alongside tasks

## 3.5 Focus / Pomodoro (Pro)

- [ ] Pomo timer
  - [ ] Configurable work/short-break/long-break durations
  - [ ] Long-break interval
  - [ ] Auto-start options
  - [ ] Daily pomo goal
- [ ] Stopwatch mode (count-up focus)
- [ ] Attach a focus session to a task or habit
- [ ] Focus notes per session
- [ ] White noise / ambient sounds during focus
- [ ] Mini floating focus window
- [ ] Tray countdown
- [ ] Focus statistics (Pro)
  - [ ] Daily/weekly/monthly focus duration
  - [ ] Pomo counts
  - [ ] Per-task/per-tag focus distribution
  - [ ] Trend charts
  - [ ] Focus record timeline with manual add/edit of records
- [ ] Estimated pomos / estimated duration per task, vs. actual

## 3.6 Habits (Pro)

- [ ] Habit CRUD
  - [ ] Name, icon, color, quote/motivation
  - [ ] Goal type: simple check-in
  - [ ] Goal type: target amount with units (e.g., "8 glasses")
  - [ ] Frequency: daily, specific weekdays, X days per week/month
  - [ ] Reminders
  - [ ] Habit sections (Morning/Afternoon/Night/custom)
  - [ ] Start date
- [ ] Check-in flows
  - [ ] Check
  - [ ] Partial progress
  - [ ] Skip
  - [ ] Log with note
  - [ ] Retroactive check-ins
- [ ] Streaks
- [ ] Monthly grid
- [ ] Habit calendar heatmap
- [ ] Per-habit statistics (total check-ins, streak best/current, completion rate)
- [ ] Habit log/journal
- [ ] Archive/restore habits
- [ ] Habit library of presets

## 3.7 Countdown (Pro)

- [ ] Countdown items: event name, target date
- [ ] Repeat (annual birthdays/anniversaries)
- [ ] Cover styles/colors
- [ ] Days-since (count-up) mode
- [ ] Pin countdowns
- [ ] Countdown detail cards

## 3.8 Notes & Sticky Notes

- [ ] Note-type items (a list can be a "note list"; notes have no due date
      semantics, support rich text)
- [ ] Desktop Sticky Notes: pop any note/task out as an always-on-top mini window
  - [ ] Color options

## 3.9 Search

- [ ] Global full-text search across tasks, descriptions, check items, notes,
      comments, attachments' names, habits, tags
- [ ] Search filters (list, tag, date, completed)
- [ ] Recent searches
- [ ] Saved searches

## 3.10 Statistics & Gamification

- [ ] Achievement score with level tiers
- [ ] Score history (earn for completing on time, lose for overdue)
- [ ] Weekly/monthly summary reports
  - [ ] Completion rate
  - [ ] Tasks completed
  - [ ] Focus time
  - [ ] Best day/hour heatmaps
- [ ] Daily/weekly completion charts
- [ ] Procrastination stats

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

- [ ] Backup/restore
  - [ ] One-click full backup (SQLite snapshot + attachments)
  - [ ] Scheduled auto-backup
  - [ ] Restore flow
- [ ] Import: TickTick backup CSV
- [ ] Import: Todoist export
- [ ] Import: generic CSV
- [ ] Export: CSV
- [ ] Export: JSON
- [ ] Export: ICS
- [ ] Export: Markdown
- [ ] Local REST API (TickTick Open API compatible)
  - [ ] Local token auth (OAuth-less)
  - [ ] `GET /open/v1/project`
  - [ ] `GET /open/v1/project/{id}/data`
  - [ ] `POST /open/v1/task`
  - [ ] `POST /open/v1/task/{id}`
  - [ ] `POST /open/v1/project/{pid}/task/{tid}/complete`
  - [ ] `DELETE …` endpoints
  - [ ] Toodoo extensions for habits, focus, filters
- [ ] `toodoo://` URL scheme (open task/list, quick add)
- [ ] Optional MCP server exposing Toodoo to Claude and other AI agents

## 3.13 Adapted / Deferred (see §9 of the build plan)

- [ ] Collaboration (shared lists, assignees, roles) — data model included;
      UI deferred (meaningless without multi-user sync)
- [ ] Cross-device cloud sync — architecture leaves room (changelog table);
      not in scope
- [ ] Mobile widgets, Siri, Apple Health import — out of scope (platform-specific)
- [ ] AI features — optional stretch phase using a local or API LLM
