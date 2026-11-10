# Verification — SPEC-0056: Fix oms-ui streaming status and snapshot reloads

> **Is the goal really met?** Every claim here must point to evidence: a passing test, a file in
> `evidence/`, a command output. "Looks right" is not evidence. The gate requires every AC to be
> PASS, every policy reviewed, fresh automated evidence, and the verdict `GOAL MET`.

## Acceptance Criteria Results

Every test below ran and passed in the latest `spec verify`. The oms-ui tests are in
`evidence/oms-ui-1.log`: 15 suites and 90 tests passed. The oms-streaming-service tests are in
`evidence/oms-streaming-service-1.log`.

| AC | Criterion (short) | Evidence | Result |
|---|---|---|---|
| AC-1 | A blotter mounted on an open connection shows Connected and offers Disconnect; later changes are shown | `StreamingBlotter.test.tsx` › "shows the shared connection's current state when it mounts": with the shared service already connected, status "connected" and a Disconnect button, no Connect; then "reconnecting" (Connect offered) and "error". It failed with "disconnected" before the fix. Reproduced in the running app before the fix: Executions showed Disconnected with 8,307 events received | PASS |
| AC-2 | One snapshot subscription per live blotter across tab and mode switches; rows kept | `App.keepMounted.test.tsx` › "switching tabs and modes subscribes each live blotter once": Orders → Executions → Orders → REST → Streaming → Executions → Orders gives one Orders and one Executions subscription; the Orders blotter still shows its event and row. It failed before the change. With a saved filter: `StreamingBlotter.test.tsx` › "re-subscribes on activation only when the saved filters changed" (shown again with the same saved filter: no new subscription), and `Blotter.test.tsx` › "does not overwrite the shared saved state when it first mounts" (opening paging mode keeps the live filter, so returning does not reload) | PASS |
| AC-3 | Events that arrive while hidden are shown on return | `App.keepMounted.test.tsx` › "a hidden live blotter keeps receiving events": two orders emitted while Executions is shown appear on return (Events: 3, 3 records), still one subscription | PASS |
| AC-4 | A filter change, the snapshot option or a reconnect subscribes again with a fresh snapshot | `StreamingBlotter.test.tsx` › "re-subscribes with a snapshot when filters or the snapshot option change" (two toggles and Apply Filters each subscribe again, asking for the snapshot as the option stands: on, off, on, on) and the existing "resets the window and event counter and re-subscribes on reconnect" | PASS |
| AC-5 | With no saved state, the live and paging blotters show the same columns with the same values | `StreamingBlotter.test.tsx` › "live and paging blotters show the same default columns" (the live blotter asks for exactly the metamodel defaults, as the paging blotter does; no note); `streamedFields.test.ts` (every Order and Execution default column is streamed); `OrderExecutionMapperTest` and `OrderMessageMapperTest#orderDtoCarriesAllBlotterDefaultColumns` (the DTOs carry every default, non-null). Reproduced in the running app: both Executions blotters show the same nine filled columns | PASS |
| AC-6 | A saved column the stream lacks is hidden live with a note, not offered, and still shown in paging mode | `StreamingBlotter.test.tsx` › "hides history-only columns with a note": saved `execId, id, orderId, status` gives live columns `execId, orderId`, the note "History only: Id, Status", the saved state still listing all four in place, and a selector offering only Exec Id and Order Id. Paging mode: `Blotter.test.tsx` › "shows saved history-only columns" and "does not overwrite the shared saved state when it first mounts", with a state mock that persists like the real service (the first fails against the pre-fix save effect). `streamedFields.test.ts` › "keeps history-only columns in place when a live selection is applied". `StreamedFieldsTest`: every listed field is sent by the DTOs; it fails when a field the stream lacks is listed (checked with `id`) | PASS |

## Goal Assessment

The goal asks for three things:
- the status always reflects the real connection state;
- switching tabs or modes does not reload the whole snapshot;
- live and paging blotters show the same columns.

What was delivered:
- **Status.** It is read from the shared connection on mount and follows every change (AC-1).
- **Switching.** Visited views stay mounted. A tab or mode switch makes no new subscription and loses
  no rows or events (AC-2, AC-3). Changing what is streamed still reloads, as intended (AC-4).
- **Columns.** The default columns are identical and filled in both modes (AC-5). As the revised,
  approved proposal decided, a saved column the stream cannot fill is not shown live; it is named
  in a note and kept for paging mode (AC-6).

Gaps a requester should know:
- **Shared state between modes.** The live and paging blotters of a domain share one saved column
  and filter choice; only the shown one writes it, and the other picks it up when shown.
- **The stream does not carry every field.** It lacks 10 Execution and 26 Order metamodel fields. In
  live mode they are history-only, not filled. Carrying them would be a contract change, for a
  separate ticket if wanted.
- **The first view of each live blotter still loads the server's full snapshot.** Bounding it is
  SPEC-0057's.
- **Hidden live blotters keep processing events.** That is bounded by the rolling window; SPEC-0057
  addresses the update cost.

## Policy Review

| Policy | Title | Result | Notes |
|---|---|---|---|
| P-01 | Contracts live only in oms-contracts | N/A | No contract change |
| P-02 | Specification before code, generated models only | N/A | No API or model change |
| P-03 | Never edit generated code | N/A | None involved |
| P-04 | Contracts evolve compatibly | N/A | No contract change; the streaming DTOs are unchanged |
| P-05 | Every state change is recorded in the event log | N/A | UI only |
| P-06 | Kafka only through the transactional outbox | N/A | No publishing |
| P-07 | Schema changes through new Liquibase changesets | N/A | No database change |
| P-08 | Concurrency and idempotency are explicit | N/A | No command path change |
| P-09 | Commands and queries stay separate | PASS | Read-only UI views |
| P-10 | State transitions go through the state machine and task pipeline | N/A | None |
| P-11 | Layering and conventions | PASS | UI logic in components and `services/`, the list in `config/` |
| P-12 | Jackson 3 only | PASS | `StreamedFieldsTest` uses `tools.jackson` |
| P-13 | Errors and validation follow the framework specs | N/A | No API change |
| P-14 | Test first, every acceptance criterion is proven by an automated test | PASS | AC-1, AC-2, AC-3 and AC-6 tests failed before their change. AC-4 and AC-5 describe behaviour that already held, so their tests were green from the start; this is noted, not hidden |
| P-15 | Observability | PASS | The status indicator is now truthful; hidden columns are named |
| P-16 | Security | PASS | No secrets, no new data |
| P-17 | Simplicity and dependencies | PASS | No library; one JSON file, one small module |
| P-18 | Modules build standalone | PASS | oms-ui and oms-streaming-service each built and checked alone. `StreamedFieldsTest` reads the oms-ui list from the repository (test only), as the design states |
| P-19 | Documentation follows behaviour | PASS | `ui/oms-admin-ui_spec.md`: status, views kept mounted, shared saved state, every re-subscribe trigger, history-only columns |

## Independent Review

The first spec-reviewer pass returned **NOT MET**. Each finding was fixed test-first (T-8) before
the final `spec verify`:

| # | Severity | Finding | Resolution |
|---|---|---|---|
| 1 | blocking | Keeping views mounted made the live and paging blotters of one domain both hold, and both save, the shared column and filter state; the hidden one overwrote the other's changes | App passes `active` to each blotter. Only the shown one saves; a blotter shown again re-reads the saved columns and filters, applying only values that differ (no needless re-subscribe). Tests: `StreamingBlotter.test.tsx` › "re-reads the shared saved columns when it becomes active, and saves only while active", `Blotter.test.tsx` › "re-reads the shared saved state when it becomes active", `App.keepMounted.test.tsx` › "tells each blotter whether its view is shown" |
| 2 | major | `creationDate` was listed as streamed for Executions, but the stream never fills it | Removed from `streamedFields.json`. `StreamedFieldsTest` now maps fully populated Avro records and asserts every listed field is non-null in the DTO JSON, so a listed but unfilled field fails the build |
| 3 | major | `securityType` on Orders is filled from `securityDesc`, so a live value would differ from the paging one | Removed from the list; it is history-only. The mismatch in the DTO mapping predates this ticket (Follow-ups) |
| 4 | major | With one shared connection, Disconnect/Connect in one live blotter left the other, hidden one Connected over a dead stream | Every live blotter re-subscribes on a transition to connected when its stream died or was disconnected. Tests: `StreamingBlotter.test.tsx` › "re-subscribes when the shared connection comes back and its stream died", `App.keepMounted.test.tsx` › "a reconnect in one live blotter re-subscribes the hidden one" |
| 5 | minor | A hidden paging blotter kept auto-refreshing | Auto-refresh runs only while active. `Blotter.test.tsx` › "does not auto-refresh while hidden" (first proves a refresh is visible while active) |
| 6 | minor | Some test names did not match the design's Test Strategy | Design updated ("Changed after the independent review") |
| 7 | minor | The defaults in tests are hand-copied from `MetamodelService` | Accepted: `streamedFields.test.ts` checks the real defaults against the list; the copies only feed component mocks |

A second spec-reviewer pass confirmed fixes 2–5 and returned **NOT MET** on fix 1. All its findings
were fixed test-first (T-10):

| # | Severity | Finding | Resolution |
|---|---|---|---|
| 1 | blocking | The paging blotter's save effect (unguarded since before this ticket) ran before its first read and saved empty columns and filters over the shared state. Opening paging mode after live use lost the choice (AC-6 bullet 3), and the live blotter's re-read then dropped its filter and reloaded the snapshot. The tests missed it because their state mock did not persist | The save waits for `initialized`. Both blotter test files now use a persisting state mock. "shows saved history-only columns" fails against the old code with it; new "does not overwrite the shared saved state when it first mounts" |
| 2 | minor | After Disconnect, a filter change re-opens the connection itself, which also counted as "the connection came back" and could subscribe twice | The subscribe effect clears the flag when it starts; a run superseded while awaiting `connect()` does not subscribe. "subscribes once when a change re-opens the connection after Disconnect" |
| 3 | minor | If the effect's own connect failed, the service's later reconnect left the blotter Connected with no subscription | The catch sets the flag. "subscribes when the connection comes back after its own connect failed" |
| 4 | minor | The App reconnect test would not catch a third, duplicate subscription | It now asserts exactly two of each after settling |
| 5 | minor | The re-read compared restored filters, which lack a BETWEEN upper bound, so a BETWEEN filter always looked changed and reloaded the snapshot. No test covered the filter path | Compared in the saved form (`sameSavedFilters`, tested with a BETWEEN filter). "re-subscribes on activation only when the saved filters changed". The lost upper bound itself predates the ticket (Follow-ups) |
| 6 | minor | design.md promised an App-level column test that does not exist | design.md now names the blotter-level tests that cover it |
| — | weak | AC-4's "fresh snapshot" was not asserted | `includeSnapshot` is now asserted per subscription |
| — | P-19 | The KB missed the new behaviours | `oms-admin-ui_spec.md` describes shared saved state and every re-subscribe trigger |

A third, focused spec-reviewer pass on these fixes returned **MET**. It confirmed each fix and found
no blocking or major issue. Its minor findings:

| # | Severity | Finding | Resolution |
|---|---|---|---|
| 1 | minor (new) | With the save guard, the paging blotter now reads the `currentPage: 0` the live blotter saves, showing "Page 0" and requesting page -1 on first use | Fixed (T-12): a saved page below 1 starts on page 1. `Blotter.test.tsx` › "starts on the first page from the state the live blotter saved" (requested page -1 before the fix) |
| 2 | minor | `mockSubscriptionActive` was not reset per test; the BETWEEN case is covered by the unit test only | Reset in `beforeEach`. The unit test on `sameSavedFilters` is accepted as the BETWEEN coverage |
| 3 | minor (existing) | `RSocketStreamingService.connect()` can open a second socket when called during `connecting` | Predates the ticket; Follow-ups |

### Browser check after done

The user ran the dev build (port 3001) and saw no rows in either blotter. The `.blotter-view`
wrapper had no height, so each grid was 1.6 px tall although the rows had arrived (2000 records).
None of the reviews or the jsdom tests could see a layout defect. Fixed in `App.scss` (T-14).
After the fix, checked in the browser:

| Check | Result |
|---|---|
| Grid height and rows | Live Orders 542 px, live Executions 542 px, REST Executions and Orders 524 px, each showing rows |
| Tab and mode switches | After each live blotter's first subscription, switching Orders, Executions, REST and Streaming sent no further stream request (counted at the WebSocket); event counters were kept |
| Shared state | With saved columns including `id` and a filter, live mode hid `id` with the note; the first REST visit kept the saved choice and filter, showed Id and started on page 1; returning live sent no new stream request |
| Reconnect | Disconnect in Orders showed Disconnected in both blotters; Connect in Executions re-subscribed each blotter exactly once |
| Dev only | The first visit to a live view sends two stream requests 27 ms apart: React StrictMode (`index.tsx`) mounts twice in development builds only |

## Automated Evidence

`spec verify SPEC-0056` ran at 2026-11-09T08:32:28Z, after the fixes from all three reviews and the browser check, with
result **pass** (fingerprint `e118f4f23e518935`).

| Module | Command | Exit | Time | Log |
|---|---|---|---|---|
| oms-ui | `npm test -- --watchAll=false --passWithNoTests` | 0 | 13 s | `evidence/oms-ui-1.log` (15 suites, 90 tests) |
| oms-ui | `..\gradlew.bat -p .. check` | 0 | 33 s | `evidence/oms-ui-2.log` |
| oms-streaming-service | `./gradlew check` | 0 | 4 s | `evidence/oms-streaming-service-1.log` (up to date from the full test run just before: 31 tests, 0 failures, including `StreamedFieldsTest`) |

The policy check reported no errors and no warnings. The other session in the tree paused its
edits in these modules for the run.

## Follow-ups

- **Carry the missing fields on the stream,** if traders need them live. That means `OrderMessage`
  and `OrderExecution` in oms-contracts, their oms-core mapping and the streaming DTOs.
- **SPEC-0057:** bound the first snapshot, batch the updates, and keep hidden blotters cheap.
- **`securityType` in the streaming Order DTO** is filled from `securityDesc` (predates the ticket).
- **Share the in-flight connect** in `RSocketStreamingService.connect()`, so two connects during
  `connecting` do not open two sockets (predates the ticket).
- **Saved BETWEEN filters lose their upper bound:** `convertFiltersToState` keeps only `value` (predates the ticket).
- **`tsconfig.json`** uses `moduleResolution=node10` and `baseUrl`, which a newer TypeScript reports
  as deprecated. This predates the ticket.

## Verdict

Verdict: GOAL MET
