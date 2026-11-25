# Verification — SPEC-0074: Show command and event history in order detail

> **Is the goal really met?** Every claim here must point to evidence: a passing test, a file in
> `evidence/`, a command output. "Looks right" is not evidence. The gate requires every AC to be
> PASS, every policy reviewed, fresh automated evidence, and the verdict `GOAL MET`.

## Acceptance Criteria Results

All tests below ran and passed in the latest `spec verify`. oms-ui `npm test`: 41 suites, 317
tests, 0 failures, in `evidence/oms-ui-1.log`.

| AC | Criterion (short) | Evidence | Result |
|---|---|---|---|
| AC-1 | Selecting History requests both endpoints and lists events oldest first, with version, event, resulting state, time, source and principal | `OMSApiService.test.ts` "getOrderEvents / getOrderCommands calls the … endpoint with the encoded order id"; `OrderHistory.test.tsx` "lists events oldest first with their metadata (AC-1)"; `DetailModal.test.tsx` "fetches history only when the History tab is selected" (the trigger) | PASS |
| AC-2 | An applied command shows on the event it appended, not as its own entry | `orderHistory.test.ts` "joins an applied command … by eventVersion", "falls back to the commandId"; `OrderHistory.test.tsx` "shows the causing command on its event … (AC-2)" (3 entries for 2 events and 1 refused command) | PASS |
| AC-3 | A refused or failed command is its own entry, in time order, with type, outcome and reason, styled apart | `orderHistory.test.ts` "places refused and failed commands by receivedAt among the events" (before, between and after events); `OrderHistory.test.tsx` "shows a refused command as its own entry, in time order (AC-3)" (class `history-entry--refused`); warning and danger tones in `OrderHistory.scss` | PASS |
| AC-4 | Changed fields as name, old and new, formatted as in the detail panel; an absent old value is empty, not "null" | `OrderHistory.test.tsx` "lists changed fields … (AC-4)": quantity, price and timestamp formatting compared with `fieldFormat` and `DateTimeService`; the backend's real `from: null` shown empty; no "null" in the entry; a cleared value shows "—" | PASS |
| AC-5 | Command and snapshot as a typed, collapsible JSON tree, collapsed until expanded, keyboard-operable, with copy | `JsonTree.test.tsx`: "renders typed leaves", "collapses nested nodes until expanded", "is collapsed at the root by default", "toggles with the keyboard, Enter and Space" (real key presses through user-event), "reaches nested nodes with Tab", "copies the raw JSON", "says so when copying fails", "shows a string leaf as JSON…"; `OrderHistory.test.tsx` "offers the causing command and the order snapshot as JSON trees (AC-5)" | PASS |
| AC-6 | Either request failing shows an error with Retry, Retry repeats the requests, and the other view still works | `OrderHistory.test.tsx` "shows an error with retry and recovers (AC-6)" (events request, HTTP 500) and "shows an error when the command log request fails, network error included (AC-6)"; `DetailModal.test.tsx` "keeps the Details tab working when the history fails to load (AC-6)" | PASS |
| AC-7 | No events and no commands shows an empty state, not an empty list | `OrderHistory.test.tsx` "shows an empty state for an order without history (AC-7)" | PASS |
| AC-8 | No history request before History is selected; Refresh requests it again and re-renders | `DetailModal.test.tsx` "fetches history only when the History tab is selected" (no calls before, one after, no refetch on a tab round-trip); `OrderHistory.test.tsx` "refresh fetches the history again (AC-8)" (both endpoints called again; the list stays in view while loading, then re-renders) | PASS |
| AC-9 | An execution's detail offers no History view | `DetailModal.test.tsx` "offers no History tab for an execution" (no tablist, no History tab, no fetch) | PASS |
| AC-10 | `ui/admin-ui.md` describes the History view: sources, combination, JSON rendering, on-demand loading, archived-order limit | `oms-knowledge-base/ui/admin-ui.md` §8 "Order History"; `capabilities/admin-ui.md` links it; `okf-check`: 0 errors | PASS |

## Goal Assessment

The goal: since every command is stored in the event table, the user should see the command and
event history in the order detail screen of oms-ui, with the JSON content of the jsonb fields
rendered readably.

- **Command and event history in order detail.** Met. The order detail modal has a History tab
  with one timeline. It shows each change with its causing command, and the refused and failed
  commands as well, so the user sees everything that was attempted, not only what was applied.
- **JSON rendered readably.** Met. The jsonb `changes` becomes a formatted old → new list. The
  stored command (`transaction`) and the order snapshot are collapsible JSON trees with typed
  colours and copy.
- **Left out on purpose** (proposal, Out of scope; KB §8):
  - archived orders' history, which lives on the archive replica (SPEC-0021);
  - execution history;
  - live updates;
  - any change to history from the UI.

None is part of what the goal asks.

No material gap remains.

## Policy Review

| Policy | Title | Result | Notes |
|---|---|---|---|
| P-01 | Contracts live only in oms-contracts | N/A | No contract change |
| P-02 | Specification before code, generated models only | PASS | Uses specified endpoints as they are. The UI types mirror `OrderEventDto` and `CommandLogEntryDto` (the outcome values match the contract), hand-written per the oms-ui convention (design D6) |
| P-03 | Never edit generated code | PASS | None touched |
| P-04 | Contracts evolve compatibly | N/A | No contract change |
| P-05 | Every state change is recorded in the event log | N/A | Read-only frontend |
| P-06 | Kafka only through the transactional outbox | N/A | No messaging |
| P-07 | Schema changes through new Liquibase changesets | N/A | No schema change |
| P-08 | Concurrency and idempotency are explicit | N/A | Read-only GETs; a stale response after a refresh or unmount is ignored (`current` flag) |
| P-09 | Commands and queries stay separate | PASS | Query API only |
| P-10 | State transitions go through the state machine and task pipeline | N/A | No transition |
| P-11 | Layering and conventions | PASS | Service calls in `OMSApiService`, pure joining in `services/orderHistory.ts`, rendering in components; design-system tokens, and the SPEC-0058 style rules pass |
| P-12 | Jackson 3 only | N/A | Frontend only |
| P-13 | Errors and validation follow the framework specs | PASS | API errors are shown, with the message and Retry, never swallowed |
| P-14 | Test first, every acceptance criterion is proven by an automated test | PASS | Every behaviour test was red before its code (see tasks). AC-1 to AC-9 have automated tests, strengthened after review (findings 1 to 3); AC-10 by review and `okf-check` |
| P-15 | Observability | N/A | Display only; the endpoints' server-side telemetry is unchanged |
| P-16 | Security | PASS | No secrets. JSON is rendered as React text nodes, with no `dangerouslySetInnerHTML`. Reads go through the existing `ApiClient` |
| P-17 | Simplicity and dependencies | PASS | No new dependency; a small in-house `JsonTree` (D3). The R10 warning on `docker-compose.yml` comes from a peer session's uncommitted SPEC-0073 work in the same tree, not from this ticket |
| P-18 | Modules build standalone | PASS | oms-ui `npm test` and `gradlew -p .. check` both exit 0 |
| P-19 | Documentation follows behaviour | PASS | `ui/admin-ui.md` §8 and the OMS API Service endpoints; `capabilities/admin-ui.md` summary and verification list |

## Independent Review

**spec-reviewer, verdict MET**, with three ACs proven only weakly. Its findings and how each was
resolved:

1. **[major] The Enter/Space test toggled by a manual click.** Fixed: it now presses the keys through
   `@testing-library/user-event`, already a dependency, and a Tab-navigation test was added.
2. **[major] AC-6 only failed the events request,** and never checked the Details tab. Fixed: added a
   command-log failure as a network error, and a DetailModal test that switches back to Details
   after a history error.
3. **[minor] The AC-4 fixture omitted `from`** (the backend writes `from: null`), and no timestamp was
   tested. Fixed: it now uses `from: null`, and a `transactTime` change is checked against
   `DateTimeService`.
4. **[minor] A cleared value rendered empty.** Fixed: it renders the detail panel's "—". Only an
   absent old value stays empty, as AC-4 says.
5. **[minor] Refresh unmounted the list,** collapsing open trees. Fixed: the current history stays in
   view while refreshing.
6. **[minor] An unused `FieldValue` component.** Dropped. The module exports the formatting functions;
   design updated.
7. **[minor] String leaves were not JSON-escaped.** Fixed, with a test.
8. **[minor] verification.md unfilled.** Filled in (this document).

## Automated Evidence

`evidence/last-run.json`, run at 2026-11-25T05:56:51Z after the last code change:
- **Result:** `pass`, fingerprint `4b901d2a1eca9147`.
- **Modules:** oms-ui and oms-knowledge-base.
- **Policy check:** changes since main (merge-base 7a89621a). 0 errors and one warning, R10 on
  `docker-compose.yml`, which is not this ticket (P-17 row).
- **oms-ui `npm test -- --watchAll=false --passWithNoTests`:** exit 0. 41 suites, 317 tests, log
  `evidence/oms-ui-1.log`.
- **oms-ui `..\gradlew.bat -p .. check`:** exit 0, log `evidence/oms-ui-2.log`.
- **The first run failed** on two SPEC-0058 style rules: the `font` shorthand, and class names built
  with template strings. Both were fixed (design, Changed during implementation).
- **Also run by hand:** `tsc --noEmit` (with `--ignoreDeprecations 6.0`, see Follow-ups) exits 0;
  `okf-check` reports 0 errors.

## Follow-ups

- **The oms-ui `tsconfig.json`** uses `moduleResolution: node10` and `baseUrl`, which TypeScript 6
  deprecates. Plain `tsc --noEmit` stops on them; a small chore ticket should update the config.
- **Archived orders' history** from the archive replica: with SPEC-0021.
- **Execution history:** the events endpoint's `execId` filter could power it.

## Verdict

Verdict: GOAL MET

Every acceptance criterion passes with tests that check its then-clause, every policy is reviewed,
and the independent review's findings are fixed. The order detail now shows the order's command and
event history, with its JSON content readable.
