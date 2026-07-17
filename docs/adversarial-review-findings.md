# Adversarial review findings — 2026-07-17 (Codex, `/codex:adversarial-review --base master`)

Target: `v-phase-12E` branch diff against `master`. Verdict: **needs-attention**.

> No-ship: restore can destroy the live database, retryable operations are not
> idempotent, imports can partially duplicate or silently lose data, and failed
> notifications are acknowledged as delivered.

This document is a **record-and-triage pass only** — no production code was
changed tonight. Three claims were proven with new `#[ignore]`d Rust tests
(`cargo test --lib -- --ignored`); CI stays green because the default
`cargo test --lib` run still ignores them (187 passed, 4 ignored, up from 1
ignored before tonight). `v1.0.0` remains blocked.

---

## Findings (verbatim from the Codex review)

### 1. [critical] Interrupted restore staging can replace the live database with a corrupt partial file
`src-tauri/src/repo/backup.rs:149-172`

> `stage_restore` copies directly to the recognized pending filename. If the
> copy fails or the process exits after creating a partial destination, that
> file remains. On the next launch, `apply_pending_restore` treats mere
> existence as validity, deletes the live database, and renames the partial
> file into place. Rename failure after line 170 similarly leaves the
> application without its original database. This creates a credible
> total-data-loss/startup-failure path from disk-full, interruption,
> antivirus, or filesystem errors.
>
> Recommendation: Copy to a separate temporary file, validate it as a SQLite
> database with integrity/schema checks, fsync it, and atomically rename it to
> the pending name. During application, retain or atomically rename the
> current database to a rollback file until the replacement opens and
> migrates successfully.

**Status: REPRODUCED**

**Triage note:** Confirmed against the code as described — `apply_pending_restore`
(`backup.rs:157-174`) only checks `staged.exists()`, never opens or validates
the file, then deletes the live `toodoo.db` before renaming the staged file
into place. Proven with a new test:
`repo::backup::tests::apply_pending_restore_rejects_a_truncated_corrupt_file`
(`src-tauri/src/repo/backup.rs`, `#[ignore]`) — writes a 5-byte garbage file as
the staged restore and asserts the live db must survive; currently fails
because the garbage file is installed verbatim. This is a real gap in the
existing `docs/decisions.md` "Restore is staged and applied on next launch"
decision (2026-07-16, Data Safety entry) — that decision describes the swap
mechanism but never claims any integrity check, so the gap is not something
the decisions log already accepted, it's simply missing. Highest severity:
credible total data loss on a local-first app whose entire value proposition
is data safety.

### 2. [high] Retrying completion advances recurring tasks multiple times
`src-tauri/src/repo/tasks.rs:354-365`

> A recurring task remains `ACTIVE` under the same ID after completion, so
> every repeated call is interpreted as completion of the newly advanced
> occurrence. A double click, client timeout followed by retry, or duplicate
> REST request can skip future occurrences and award duplicate completion
> points. Concurrent calls are also unsafe because task state is read before
> the recurrence transaction, and `task_completions` has no uniqueness guard
> for an occurrence.
>
> Recommendation: Require an expected occurrence/version or idempotency key
> when completing a recurring task, enforce uniqueness on `(task_id,
> occurrence_at, status)` as appropriate, and conditionally advance only if
> the persisted occurrence still matches the caller's expected occurrence
> within the same transaction.

**Status: REPRODUCED**

**Triage note:** Confirmed — `complete_task` re-reads `get_task` fresh each call
(`tasks.rs:360`) and `advance_recurrence` has no guard against the task's
`due_at`/`start_at` having already moved between an intended call and a retry.
Proven with a new test:
`repo::tasks::tests::complete_task_retried_on_recurring_task_double_advances_and_double_awards`
(`src-tauri/src/repo/tasks.rs`, `#[ignore]`) — calls `complete_task` twice on
the same recurring task id and compares against a single-call baseline;
currently fails (2 completions recorded instead of 1, occurrence advanced
twice, points awarded twice). No existing `decisions.md` entry addresses
retry/idempotency for completion — this is a genuine gap, not a documented
tradeoff.

### 3. [high] CSV import is non-atomic and retries duplicate already imported tasks
`src-tauri/src/repo/importers.rs:254-290`

> Each row is independently resolved, created, updated, and completed without
> an outer transaction. If any later row fails, earlier tasks and newly
> created projects remain even though the command returns an error. Retrying
> the same import then appends duplicates because there is no import identity
> or deduplication mechanism.
>
> Recommendation: Run the entire import in one transaction using
> transaction-aware repository helpers, emitting domain events only after
> commit. Alternatively persist an import job and stable per-row keys so
> retries resume idempotently rather than reinserting prior rows.

**Status: SPLIT — see below.** This finding bundles two distinct claims that
triage differently against `docs/decisions.md`.

**Triage note (split):**
- **"Imports append duplicates on retry" — Status: DELIBERATE-DECISION.**
  The 2026-07-16 "Data Safety & Import/Export" decision explicitly states
  *"Imports append. Each CSV row becomes a new task ... No dedupe/merge."*
  Re-running an import (whether a genuine retry or an intentional re-import)
  appending duplicate rows is the documented, chosen behavior, not a bug. The
  reviewer's framing ("retries duplicate already imported tasks") is
  technically correct but describes a known, accepted tradeoff.
- **"Import is non-atomic (partial failure leaves earlier rows persisted)" —
  Status: REPRODUCED.** This is a separate, undocumented problem: no decision
  addresses what happens when a row *fails* mid-import. Proven with a new
  test: `repo::importers::tests::import_tasks_partial_failure_leaves_earlier_rows_persisted`
  (`src-tauri/src/repo/importers.rs`, `#[ignore]`) — imports two rows where the
  second has an invalid priority (`2`, not in `{0,1,3,5}`) so `create_task`
  errors; asserts the first row must not persist after the command reports
  failure. Currently fails — the first row is committed and stays. This is
  the part of finding 3 that actually needs a fix; the "append, no dedupe"
  behavior does not.

### 4. [medium] Imported tag assignments are silently discarded
`src-tauri/src/repo/importers.rs:256-289`

> The parsers populate `ImportTask.tags`, but the insertion loop never reads
> `row.tags` or creates/assigns tags. TickTick and generic imports therefore
> report tasks as successfully imported while losing all tag organization
> without warning.
>
> Recommendation: Within the import transaction, resolve or create every
> parsed tag and assign it to the created task; include imported/skipped tag
> counts and actionable errors in the result.

**Status: DELIBERATE-DECISION**

**Triage note:** Confirmed in code — `import_tasks` (`importers.rs:254-292`)
never reads `row.tags`. This matches the 2026-07-16 "Data Safety &
Import/Export" decision verbatim: *"Tags are parsed but not attached on
import (kept minimal; not required by the inventory)."* Marking
DELIBERATE-DECISION per that entry — **but the reviewer's specific point
stands and isn't currently addressed by the decision**: the import result
gives no indication that tags were dropped, so from the user's perspective a
"successful" import silently loses organization data they may be relying on.
The existing decision covers *why* tags aren't attached; it does not cover
the *silence* about it. Flagging for the user to decide tomorrow whether to
upgrade scope — options range from "no change" to "surface a skipped-tags
count in the import result" to "actually attach tags" (which would fold into
the fix-plan item below if chosen).

### 5. [medium] Failed notification delivery is permanently acknowledged
`src-tauri/src/lib.rs:1387-1402`

> The scheduler logs `notification.show()` failure but unconditionally calls
> `mark_fired` afterward. A transient OS notification failure therefore
> suppresses the reminder forever. Conversely, successful display followed by
> a database failure leaves it due and causes another notification every 30
> seconds. The implementation contradicts the claimed ordering and has
> neither a claim state nor retry policy.
>
> Recommendation: Persist an atomic dispatch claim before attempting delivery,
> record success only after `show()` succeeds, and retain retryable failure
> state with bounded backoff. Recover stale claims explicitly so crashes do
> not cause either permanent loss or rapid duplicate notifications.

**Status: REPRODUCED (by code inspection; no new test written)**

**Triage note:** Confirmed by reading `lib.rs:1387-1402` directly: the `match
... .show() { Ok(()) => ..., Err(e) => ... }` arms both fall through to the
same unconditional `repo::reminders::mark_fired(...)` call at line 1397-1398 —
there is no branch that skips `mark_fired` on `Err`. The code comment at
`lib.rs:1357` ("`mark_fired` before emit keeps a crash from double-nagging")
even describes different, contradictory intended ordering than what's
actually implemented (`mark_fired` currently runs *after* `show()`, not
before it, and unconditionally either way). No test was written for this
finding — exercising it needs either a fake/injectable notification backend
or a Tauri-integration-level test harness, which is out of scope for
tonight's "cheap and safe" bar; recommend a proper unit test once the fix
introduces a claim/ack state machine that can be tested without the real OS
notification API.

**Is this the root cause of the open "reminders never fire" bug
(`docs/manual-test-checklist.md`, Phase 12D → Notification Complete/Snooze:
"❌ ... no reminder came")?** Plausible **contributing** cause, not
confirmed. Timeline: that checklist result was captured at the `019f608`
checkpoint, *before* the `[reminders]` stderr instrumentation was added in
`1508046` (see `docs/pre-launch.md` §2a) — so there is no log evidence from
that run showing whether `notification.show()` actually failed. `pre-launch.md`'s
current working theory is that dev-mode Windows toast delivery itself is
unreliable (unstable AppUserModelID / no installed Start-menu shortcut), which
is a different failure mode (OS-level, not a code bug). This finding doesn't
contradict that theory — it **compounds** it: *if* `show()` intermittently
fails in dev mode as theorized, this bug converts what should be a transient,
retryable failure into a **permanent** one (the reminder is marked fired and
never attempted again), which is consistent with "no reminder ever came" over
a multi-minute wait. Re-testing on the installed build per `pre-launch.md`
§2a/§3 with the now-present `[reminders]` logs should distinguish: `N due`
staying `0` (scheduler/data path, unrelated to this finding) vs. `show()
FAILED` appearing exactly once per reminder before it goes silent (this
finding, confirmed as the/a root cause).

---

## Fix plan (proposed, not executed)

Ordered by the blast radius the reviewer identified — data loss first, then
correctness/idempotency, then UX-visible reliability, then the lower-severity
items:

1. **Restore safety (finding 1)** — highest priority; credible total data
   loss. Stage to a separate temp file, validate as SQLite (open + integrity
   check) before treating it as the pending restore, fsync, atomic rename.
   On apply, keep the current db recoverable (rename to a rollback file
   rather than delete) until the new db is confirmed to open. **Needs a new
   `decisions.md` entry** — this changes the staged-restore mechanism
   described in the 2026-07-16 Data Safety decision; the entry should
   supersede/extend that description with the validation + rollback behavior.
2. **Recurring completion idempotency (finding 2)** — second priority;
   silent data corruption (skipped occurrences, duplicate points) in a core
   flow. Needs an idempotency/version guard on `complete_task` for the
   recurring path (e.g. require the caller's expected `due_at`/`start_at`, or
   a per-occurrence uniqueness constraint on `task_completions`) enforced
   inside the transaction. **Needs a new `decisions.md` entry** documenting
   the idempotency contract (what a client must pass, what happens on a stale
   retry).
3. **Notification claim/ack ordering (finding 5)** — fold into the existing
   open notification bug investigation (`pre-launch.md` §2a) rather than
   treating as a separate fix; it's directly relevant to diagnosing "no
   reminder came" and should be fixed alongside whatever that investigation
   finds. Needs a claim-before-attempt / ack-only-on-success state machine
   with bounded retry, per the reviewer's recommendation. **Needs a new
   `decisions.md` entry** once the retry/backoff policy is decided (this
   touches the 2026-07-15 "Reminder scheduler polls every 30s with launch
   catch-up" decision and should supersede/extend it).
4. **Import atomicity (finding 3, non-atomic-failure portion only)** — wrap
   `import_tasks` in a single transaction (or otherwise make partial failure
   safe to retry) so a failed import doesn't leave orphaned rows/projects.
   Does **not** touch the "append, no dedupe" behavior, which stays as
   decided. Likely **needs a `decisions.md` note** only if the fix changes
   user-visible behavior (e.g. if transactional rollback means "all rows
   fail together" becomes the new failure mode) — otherwise this is a pure
   bug fix with no behavior-contract change.
5. **Import tags scope (finding 4)** — lowest priority; already a sanctioned
   decision. No fix planned until the user decides tomorrow whether to
   upgrade scope (see triage note above). If upgraded, this becomes a new
   `decisions.md` entry superseding the 2026-07-16 "tags parsed but not
   attached" line; if left as-is, consider a small follow-up to surface a
   "N tags skipped" note in the import result so the silence itself is
   addressed without attaching tags.

---

## Test evidence added tonight (no production code changed)

All three are `#[ignore]`d so `cargo test --lib` stays green (187 passed, 4
ignored — was 1 ignored before). Run with `cargo test --lib -- --ignored` to
reproduce the failures:

- `repo::backup::tests::apply_pending_restore_rejects_a_truncated_corrupt_file`
  (`src-tauri/src/repo/backup.rs`) — FAILS (finding 1, REPRODUCED).
- `repo::tasks::tests::complete_task_retried_on_recurring_task_double_advances_and_double_awards`
  (`src-tauri/src/repo/tasks.rs`) — FAILS (finding 2, REPRODUCED).
- `repo::importers::tests::import_tasks_partial_failure_leaves_earlier_rows_persisted`
  (`src-tauri/src/repo/importers.rs`) — FAILS (finding 3's non-atomic portion,
  REPRODUCED).
