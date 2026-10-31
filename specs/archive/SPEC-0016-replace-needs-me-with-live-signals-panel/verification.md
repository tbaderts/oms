# Verification — SPEC-0016: Replace Needs me with live signals panel

> **Is the goal really met?** Every claim here must point to evidence: a passing test, a file in
> `evidence/`, a command output. "Looks right" is not evidence. The gate requires every AC to be
> PASS, every policy reviewed, fresh automated evidence, and the verdict `GOAL MET`.

## Acceptance Criteria Results

Test paths are relative to `developer-cockpit/test/`. All tests passed in the latest `spec verify`
run (`evidence/developer-cockpit-2.log`: 79 files, 475 tests passed, 2 skipped).

| AC | Criterion (short) | Evidence | Result |
|---|---|---|---|
| AC-1 | Signals panel lists the 20 newest log entries of non-archived tickets (time, id, title, text); Needs me and Mine in progress gone | `main/SpecTicketsService.test.ts#listTickets returns the last 20 log entries per ticket`; `renderer/signals.test.ts#merges the logs of non-archived tickets, newest first`, `#caps the feed at 20 entries`; `renderer/Dashboard.test.tsx#signals panel replaces Needs me` | PASS |
| AC-2 | The eight example texts are classified critical ×4, attention, good ×2, info; each entry has an icon and a text label | `renderer/signals.test.ts#classify (AC-2)` (12 cases); `renderer/SignalsPanel.test.tsx#each activity entry shows a level icon and label` | PASS |
| AC-3 | Your turn: awaiting and blocked, the user's own first, details, opens the ticket; "Nothing needs you." | `renderer/Dashboard.test.tsx#your turn lists awaiting and blocked, mine first, and opens tickets` (the user owns an awaiting and a blocked ticket, others own the rest); `renderer/SignalsPanel.test.tsx#your turn empty state and no activity` | PASS |
| AC-4 | A live-refresh entry appears on top marked new; entries from the first load are not new | `renderer/Dashboard.test.tsx#live refresh adds a new activity entry marked new` (real `SignalsWatcher`, WebSocket event); `renderer/signalsStore.test.ts#first ingest marks nothing new; later entries are fresh`, `#re-ingesting the same tickets adds nothing…` | PASS |
| AC-5 | Status bar counts new critical and attention signals in any view, shows the latest text, and a click opens the Dashboard and resets; good, info and first-load entries are not counted | `renderer/SignalsShell.test.tsx#status bar counts new critical and attention signals and opens the dashboard` (view: contracts); `renderer/signalsStore.test.ts#orders a batch of new signals from several tickets by time` | PASS |
| AC-6 | Toast with id, text and Open for new critical or attention signals; none for good or info | `renderer/SignalsShell.test.tsx#toast for a new critical or attention signal, not for good or info`; `renderer/signalsStore.test.ts#only new critical and attention entries become unseen and toasts (AC-5, AC-6)`, `#keeps at most 3 toasts` | PASS |
| AC-7 | A load error shows "signals unavailable", not empty states; unknown lines are info with their text unchanged | `renderer/Dashboard.test.tsx#shows load errors instead of an empty portfolio`; `renderer/SignalsPanel.test.tsx#says signals are unavailable…`; `renderer/signals.test.ts#merges…` (the "garbled line" case) | PASS |

**Visual check (T-6).** Playwright screenshots of the built app against a scratch workspace, with
log lines appended while the app ran. They showed:
- the panel in light and dark;
- critical and attention toasts;
- the bell with the count and latest text in the Contracts view.

The screenshots led to a two-line activity row.

## Goal Assessment

The requester found *Needs me* dull and mostly redundant, and preferred "more direct feedback and
signals back into the console" to only re-arranging tiles. Delivered:
- **Your turn:** a compact list of what waits for the user.
- **Activity:** a live, classified feed of what happened, built from the ticket logs.
- **Status-bar bell:** works in every view.
- **Toasts:** for critical and attention events, such as a failed verify run, a block, a reopen, a
  stalled autopilot, or a ticket awaiting approval.

*Mine in progress* is gone, and the panel's lists scroll instead of growing the row.

Left out on purpose, as recorded in the proposal: OS notifications, signals from outside the spec
workflow, and a seen state that lasts across restarts.

No material gap remains.

## Policy Review

| Policy | Title | Result | Notes |
|---|---|---|---|
| P-01 | Contracts live only in oms-contracts | N/A | No contracts touched |
| P-02 | Specification before code, generated models only | PASS | Proposal (approved) and design came before code |
| P-03 | Never edit generated code | N/A | No generated code |
| P-04 | Contracts evolve compatibly | N/A | No OpenAPI or Avro change; `recentLog` is an additive field in the shared TS type, set to `[]` by `toSummary()` |
| P-05 | Every state change is recorded in the event log | N/A | No OMS state; the feature reads the spec workflow's own log |
| P-06 | Kafka only through the transactional outbox | N/A | No Kafka |
| P-07 | Schema changes through new Liquibase changesets | N/A | No database |
| P-08 | Concurrency and idempotency are explicit | PASS | Ingest is keyed and idempotent (`signalsStore.test.ts#re-ingesting…`), and `known` never shrinks. Overlapping loads keep the store's `loadSeq` ordering |
| P-09 | Commands and queries stay separate | N/A | Read-only |
| P-10 | State transitions go through the state machine and task pipeline | N/A | No order state |
| P-11 | Layering and conventions | PASS | File read in the main-process service, pure derivation in `lib/signals.ts`, session state in a zustand store, shared `SignalLevelIcon` in `components/` (views do not import into components) |
| P-12 | Jackson 3 only | N/A | No Java |
| P-13 | Errors and validation follow the framework specs | PASS | An unreadable `ticket.md` gives `[]` (tested). A load error shows "Signals are unavailable…" (AC-7) |
| P-14 | Test first, every acceptance criterion is proven by an automated test | PASS | Every AC maps to passing tests above. The review fixes were test-first: both new tests failed before the change |
| P-15 | Observability | N/A | Pure UI feature; the signals are the user-facing feedback |
| P-16 | Security | PASS | `readRecentLog` refuses paths outside `<workspaceRoot>/specs/`, and log text renders as React text |
| P-17 | Simplicity and dependencies | PASS | No new package; the toast and the bell are plain React with lucide icons |
| P-18 | Modules build standalone | PASS | `developer-cockpit` typecheck and tests in `spec verify`; `npm run build` in T-6 |
| P-19 | Documentation follows behaviour | PASS | `developer-cockpit/spec/03-features.md` (Signals row, Live Updates) and `02-information-architecture.md` (Dashboard, Status Bar) |

## Independent Review

The spec-reviewer agent's verdict was MET. Its findings and how each was resolved:

1. **[major] Your turn ordered "mine first" only within each group (AC-3).**
   - **Fixed:** the user's own entries now come first across both kinds, with awaiting before
     blocked within each owner.
   - The AC-3 test now includes a blocked ticket the user owns; it failed before the fix.
   - Implement was reopened for this, the design was corrected, and verify was re-run.
2. **[minor] A batch of new signals from several tickets was ordered by ticket, not by time.**
   - **Fixed:** the batch is sorted with the shared `newestFirst` comparator.
   - New test: `signalsStore.test.ts#orders a batch of new signals from several tickets by time`.
3. **[minor] Your turn had no height cap.**
   - **Fixed:** it is now `max-h-40` with scrolling.
4. **[minor, speculative] An edited or partly written log line would count as a new signal.**
   - **Accepted:** the CLI only appends, and a partial read is rare and bounded by the 3-toast cap.
   - Listed under Follow-ups.
5. **[process] verification.md was unfilled.**
   - **Resolved** by this document.

## Automated Evidence

`evidence/last-run.json`: ran 2026-10-30T07:15:25Z, result `pass`, module `developer-cockpit`.

- **Policy check:** PASS.
- **`npm run typecheck`:** exit 0 (`developer-cockpit-1.log`).
- **`npm test`:** exit 0 (`developer-cockpit-2.log`). 79 files and 475 tests passed, 2 skipped.

The run before it failed once on an unrelated timeout in `test/main/spec-cli-draft.test.ts`
(24 s against a 20 s limit, spawning the CLI). That test passed alone (3 of 3) and in this run.

## Follow-ups

- The renderer CSP allows only `ws://localhost:9321`. Runs with `COCKPIT_WS_PORT` (e2e, a second
  cockpit) therefore get no live events.
- Timeouts on Windows under load:
  - `spec-cli-draft.test.ts` (this run);
  - `WatcherService.test.ts` (SPEC-0015).
- Operating-system notifications for critical signals, deferred in the proposal.
- Make signal keys robust against edited log lines, if that turns out to happen in practice.

## Verdict

Verdict: GOAL MET
