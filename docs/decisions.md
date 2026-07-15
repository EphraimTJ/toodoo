# Toodoo — Decisions Log

Records every deliberate deviation from TickTick's observed behavior (and any
ambiguity we resolved by judgment call), with the reasoning. Newest entries at
the top. Never rewrite history — if a decision is reversed, add a new entry
that supersedes the old one.

## 2026-07-14 — E2E runs in a browser against the Vite dev server, not inside Tauri

**Decision:** Playwright E2E tests run against `vite dev` in Chromium, with the
Tauri IPC layer replaced by an in-memory stub (`src/lib/api.ts` falls back to a
browser stub when `window.__TAURI_INTERNALS__` is absent).

**Why:** Playwright cannot attach to the Tauri WebView; true in-Tauri E2E on
Windows requires tauri-driver + WebdriverIO (a different test runner). The
build plan specifies Playwright, so E2E covers the React app end-to-end while
Rust-side behavior (repository layer, changelog, events) is covered by
`cargo test`. Revisit if a phase needs to verify native integration
(tray, global hotkeys, notifications) automatically.

## 2026-07-14 — Task priority stored as 0/1/3/5

**Decision:** `tasks.priority` uses the TickTick Open API values
(0 none, 1 low, 3 medium, 5 high) rather than 0–3.

**Why:** §3.12 requires a TickTick-compatible local REST API; storing the
API's native values avoids a mapping layer and matches TickTick's observed
data model.
