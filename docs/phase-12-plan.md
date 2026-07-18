# Toodoo — Phase 12 (Updated): Road to v1.0

This replaces §5 Phase 12 of `toodoo-build-plan.md`. It was rebuilt against the
**actual state** of `docs/feature-inventory.md` and `docs/decisions.md` after
Phase 11. The original Phase 12 was a polish pass; the real remaining scope is
larger — Search never shipped, the NLP quick-add never shipped, and all native
desktop integration was deferred here by earlier decisions. Phase 12 is
therefore split into six sub-slices (12A–12F), each run like a mini-phase:
plan mode → tests → inventory checkboxes → commit → tag `phase-12x`.

**Estimated effort: 4–6 sessions.** Do the slices in order — 12C depends on
12B's date/recurrence UI, and 12D closes items that 12B/12C open (snooze UI,
quick-add window).

---

## What's actually left (from the inventory)

| Area | Unchecked items |
|---|---|
| **Search (§3.9)** | Everything: global FTS, search filters, recent searches, saved searches |
| **Task completeness (§3.1)** | All-day vs. timed; task duration; absolute-reminder picker UI; snooze UI; full custom-RRULE picker; task↔check-item toggle; templates; duplication; "Won't Do"; comments; attachments + gallery; nested tags |
| **Organization (§3.2)** | Won't Do smart list; show/hide/reorder smart lists; nested tags; tag manager (rename/merge/delete) |
| **NLP quick-add (§3.1)** | Everything: dates, times, recurrence, `!priority`, `#tag`, `~list`, inline highlight chips |
| **Views (§3.3)** | Detail density option |
| **Desktop (§3.11 + deferred-to-12 items)** | Global quick-add hotkey; full shortcut map; tray (today count, quick actions, focus countdown); launch at login; native notifications with Complete/Snooze actions; mini focus window; sticky-note pop-out windows; themes (auto + accents + font size); i18n scaffolding; share as text/markdown/image |
| **Integration (§3.12)** | MCP server (optional) |

**Explicitly deferred to post-1.0** (add `decisions.md` entries in 12A's first
commit; leave the checkboxes unchecked per the never-delete rule):

- **Lunar-calendar recurrence** — stretch by original plan.
- **Location reminders** — even the adapted manual-trigger version adds a
  location model with little desktop value; TickTick's own version is
  mobile-only. Revisit if a mobile companion ever exists.
- All of §3.13 (collaboration, cloud sync, mobile/Siri/Health, AI features) —
  unchanged.

---

## 12A — Search (1 session)

The largest functional gap; a Pro clone without global search isn't done.

- FTS5 virtual tables + triggers (per build plan §4.2) covering: task titles,
  rich-text content (indexed as plain text), check items, comments (new in 12B —
  add the trigger there), notes, habit names, tag names, attachment filenames
  (trigger added in 12B when attachments land).
- Search UI: promote the ⌘K palette into a two-mode surface — command mode and
  search mode (or a dedicated search pane, whichever fits the existing palette
  code better; decide in plan mode).
- Filters on results: list, tag, date range, status (active/completed/won't-do).
- Recent searches (settings-backed ring buffer) and **saved searches** (the
  `saved_searches` table from migration 0001).
- **Stub parity:** browser stub implements naive substring search over its
  in-memory store so Playwright can exercise the UI; FTS5 relevance behavior is
  covered by Rust tests only (consistent with the 2026-07-14 E2E decision).
- Perf gate: search < 50 ms on the 10k-task fixture.

## 12B — Task & Organization completeness (1–2 sessions)

Closes every remaining §3.1/§3.2/§3.3 item. Mostly UI over existing schema —
`duration_min`, `is_all_day`, status `WONT_DO`, `comments`, `attachments`,
`tags.parent_id` all exist in migration 0001.

- **All-day vs. timed toggle + duration** in the date picker; calendar and
  timeline already consume `duration_min`/`is_all_day` (Phase 4/8 code paths —
  verify, don't rebuild).
- **Reminder picker UI** for absolute reminders (repo + scheduler already fire
  them) and a visible **snooze** control in-app (notification-button snooze is
  12D; give the reminder popover a snooze action now so the checkbox's UI half
  closes even on platforms where notification buttons are limited).
- **Full custom-RRULE picker**: monthly by-day ("last Friday"), yearly, interval,
  already-supported end conditions. The engine handles these (Phase 2); this is
  picker UI + parser round-tripping. Table-driven tests: picker state ↔ RRULE
  string.
- **Task ↔ check-item toggle** both directions (check item → subtask, subtask →
  check item). Define data mapping in plan mode (check items have no
  tags/priority — converting down drops fields; confirm-and-log in decisions.md).
- **Won't Do**: status setter in task menus + the Won't Do smart list + include
  in search filters. Recurring tasks: Won't-Do an occurrence behaves like the
  recurring-completion decision (advance in place, ledger row with status
  WONT_DO) — mirror the 2026-07-15 recurrence decision.
- **Task duplication** (deep copy: check items, tags, reminders; not activity
  log or completions) and **task templates** (a template is a stored task
  snapshot; "save as template" / "new from template" — reuse the duplication
  code path).
- **Comments**: running log thread in the detail pane (`comments` table),
  newest last, plain text v1.
- **Attachments + per-task gallery**: files copied into
  `app_data_dir/attachments/<task-id>/`, `attachments` rows, image thumbnails,
  open-with-OS. **Cross-cutting:** this invalidates the 2026-07-16 "backups are
  the DB file only" decision — extend backup/restore to zip DB + attachments
  dir, keep `VACUUM INTO` for the DB member, bump the decisions entry. Importer
  note: still no attachment import.
- **Nested tags + tag manager**: parent picker, tree rendering in sidebar,
  rename/merge/delete (merge = re-point `task_tags`, delete per the 2026-07-15
  deletion-semantics decision). Case-insensitive uniqueness already enforced.
- **Smart-list settings**: show/hide/reorder (settings key), Won't Do appears
  here.
- **Detail density** per-view option (compact/default/detailed rows) via the
  existing `viewopts:<view>` settings pattern.

## 12C — NLP quick-add (1 session)

- `chrono-node` + custom grammar layered on the **existing** filter-grammar
  conventions (2026-07-15 decision): `#tag`, `~list`, `!high|medium|low`,
  `every …` recurrence phrases, dates/times ("tomorrow 5pm", "next fri 9am").
- Inline highlight chips with tap-to-dismiss (dismissing a chip keeps the text
  as literal title content).
- Parser is pure TS in `src/features/quickadd/lib/parse.ts` with a large
  table-driven test suite (phrase → expected task fields). No Rust mirror
  needed — parsing is frontend-only; the parsed result goes through the normal
  create path. Recurrence phrases must emit RRULEs the Phase-2 engine accepts
  (round-trip test against the picker serializer from 12B).
- Ship in the in-app add bar first (testable in the browser stub/Playwright);
  the **global-hotkey floating window** reuses this component in 12D.

## 12D — Native desktop integration (1–2 sessions)

Everything the E2E decision (2026-07-14) says can't run under Playwright lands
here together: **unit-test the pure logic, mirror config in the stub so panels
render, and add `docs/manual-test-checklist.md`** for the native behaviors.

- **Global quick-add hotkey** → frameless always-on-top window hosting the 12C
  component (registered shortcut configurable in settings).
- **System tray**: today count badge/tooltip, quick actions (quick add, open
  today, start pomo), and the **focus countdown** during a session (closes the
  Phase-5 deferral).
- **Mini floating focus window** (always-on-top, closes the other Phase-5
  deferral) and **sticky-note pop-out windows** (always-on-top per sticky,
  position/color persisted — closes the Phase-7 deferral; the in-app board
  remains).
- **Launch at login** toggle.
- **Native notifications with Complete / Snooze actions.** Investigate Tauri
  notification action support per-OS in plan mode; where buttons aren't
  supported, clicking the notification opens a small in-app snooze/complete
  popover. Record the per-OS behavior in decisions.md. Wire to the existing
  scheduler's `last_fired_at`/`snoozed_until` fields.
- **Share/export a task or list as text / markdown / image** — markdown + text
  via the existing Blob-download path (browser-testable); "as image" renders a
  styled card offscreen and exports PNG.

## 12E — Themes, i18n, shortcuts, polish (1 session)

- **Themes**: light/dark/**auto (follow OS)**, accent-color palette, custom
  accent, font-size options (S/M/L). Persist in settings; audit contrast.
- **i18n scaffolding**: react-i18next, extract all user-facing strings to
  `en.json`, locale switcher hidden behind settings (English only ships).
- **Full shortcut map** + `?` cheatsheet overlay; audit every view for keyboard
  reachability.
- Polish gate: perf audit on the 10k fixture (list < 16 ms/frame, cold start
  < 2 s), onboarding seed data, app icon, packaging/signing for your OS,
  final pass over empty states and animations.

## 12F — MCP server (DEFERRED to post-v1.0)

**Skipped for v1.0** (decision 2026-07-16) — it is the **first post-1.0 item**.
Nothing in v1.0 depends on it, and the REST API it would wrap already ships
(Phase 10).

The shape when it lands: a thin stdio MCP server wrapping the Phase-10 REST API —
`list_projects`, `list_tasks`, `create_task`, `update_task`, `complete_task`,
`delete_task`, plus read-only habit/focus/filter tools over `/open/v1/toodoo/*`.
Requires the API server enabled; reads the token from config. Ship as a separate
package (`packages/toodoo-mcp/`) so it versions independently.

---

## v1.0 Definition of Done (updated 2026-07-16)

Every checkbox in `docs/feature-inventory.md` is checked **except** these
explicitly-deferred items, each backed by a decisions.md entry:

- **§3.13** (collaboration, cloud sync, mobile/Siri/Health, AI) — out of scope.
- **Lunar-calendar recurrence** and **location reminders** — stretch/mobile-only.
- **MCP server** — deferred to post-1.0 (first item after 1.0).
- **Attachments + per-task gallery** — deferred to a post-12E slice; consequently
  backup/restore remains **DB-file-only** (no attachments zip) for v1.0.
- **Full i18n string extraction** — v1.0 ships the react-i18next **scaffolding +
  a representative set**; remaining strings migrate incrementally.

**Ops gates run on your machine** (not CI, see `docs/manual-test-checklist.md`):
perf audit (list < 16 ms/frame, cold start < 2 s on the 10k fixture; search
< 50 ms), the native-desktop checklist, packaging/signing, and the final app
icon.

Automated suite green — `npm test`, `cargo test`, `cargo clippy`, `npm run build`,
Playwright. Then tag **`v1.0.0`**.

---
