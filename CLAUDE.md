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
