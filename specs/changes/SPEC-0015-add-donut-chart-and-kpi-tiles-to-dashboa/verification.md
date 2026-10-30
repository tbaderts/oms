# Verification — SPEC-0015: Add donut chart and KPI tiles to dashboard

> **Is the goal really met?** Every claim here must point to evidence: a passing test, a file in
> `evidence/`, a command output. "Looks right" is not evidence. The gate requires every AC to be
> PASS, every policy reviewed, fresh automated evidence, and the verdict `GOAL MET`.

## Acceptance Criteria Results

All tests are in `developer-cockpit/test/renderer/` and passed in the latest `spec verify` run
(`evidence/developer-cockpit-2.log`: 75 files, 443 tests passed, 2 skipped).

| AC | Criterion (short) | Evidence | Result |
|---|---|---|---|
| AC-1 | Donut: segments in pipeline order, proportional arcs, centre total, archived excluded, text alternative | `StageDonut.test.tsx#segments in pipeline order with proportional arcs, centre total, legend and text alternative`, `#draws a single stage as a full ring`, `#rounds each percentage once`; `Dashboard.test.tsx#shows the portfolio…` (donut inside the Dashboard) | PASS |
| AC-2 | Distinct colours per stage; neighbour ΔE ≥ 8 for protan, deutan and tritan, ≥ 15 for normal vision; chroma ≥ 0.1; colours below 3:1 always labelled | `stageColors.test.ts` (`:root` and `.dark`, wrap pair included); legend name and count per colour in `StageDonut.test.tsx#segments…`. Contrast below 3:1 is covered indirectly: the validator (design.md, Decisions) lists light yellow, aqua and magenta below 3:1, and the test proves every stage colour has a legend entry with its name and count. Table dots sit next to the stage name, and tile bands next to the tile label | PASS |
| AC-3 | KPI tiles 5 / 4 / 2 / 1 / 1 / 30%, own accent each | `Dashboard.test.tsx#KPI tiles show active, in progress, awaiting, blocked, done and task completion`; `spec-tickets-kpis.test.ts` | PASS |
| AC-4 | Segment, legend entry, Blocked and Done tiles filter the table; chip and Clear | `Dashboard.test.tsx#clicking a donut segment, legend entry or tile filters the ticket table and Clear resets it`; `StageDonut.test.tsx#click, Enter and Space toggle the stage filter; the chip clears it` | PASS |
| AC-5 | Hover and focus show stage, count and %; Enter and Space filter | `StageDonut.test.tsx#shows stage, count and percentage on hover and on focus`, `#click, Enter and Space toggle…` | PASS |
| AC-6 | Empty: "No active tickets yet", tiles 0, completion "–" | `Dashboard.test.tsx#empty portfolio shows no-active-tickets and zero tiles`; `StageDonut.test.tsx#empty state…`; `spec-tickets-kpis.test.ts#gives zeros…` | PASS |
| AC-7 | Live refresh updates donut, legend and tiles; a load error is not shown as an empty portfolio | `Dashboard.test.tsx#live refresh updates donut, legend and tiles`, `#shows load errors instead of an empty portfolio` | PASS |

Visual check (T-5): Playwright screenshots of the built app in light, dark, hover, filtered and
narrow layouts. They led to two fixes: the tooltip moved into the hole, and the tile values are
now aligned. The screenshot spec was a one-off and was deleted.

## Goal Assessment

The goal asked for a pie chart of ticket progress by state, KPI tiles and more colour.

- **Pie chart:** a donut of the active tickets per stage, with the total, a legend and filtering.
- **KPI tiles:** six tiles, each with its own colour band and icon.
- **More colour:** a seven-hue categorical palette replaces the blue ramp in both themes and also
  colours the table's stage dots.

Left out on purpose and recorded in the proposal:
- time-based KPIs, which would need completion dates;
- charts by type or module, since the requester chose KPI tiles only.

No material gap remains.

## Policy Review

| Policy | Title | Result | Notes |
|---|---|---|---|
| P-01 | Contracts live only in oms-contracts | N/A | No contracts touched |
| P-02 | Specification before code, generated models only | PASS | Proposal and design came first; no models involved |
| P-03 | Never edit generated code | N/A | No generated code |
| P-04 | Contracts evolve compatibly | N/A | No contract change |
| P-05 | Every state change is recorded in the event log | N/A | No OMS state |
| P-06 | Kafka only through the transactional outbox | N/A | No Kafka |
| P-07 | Schema changes through new Liquibase changesets | N/A | No database |
| P-08 | Concurrency and idempotency are explicit | N/A | Read-only view over loaded summaries |
| P-09 | Commands and queries stay separate | N/A | No commands |
| P-10 | State transitions go through the state machine and task pipeline | N/A | No order state |
| P-11 | Layering and conventions | PASS | Pure `kpis()` in `lib/spec-tickets.ts`, presentational components in `views/dashboard`, filter state in the shared store, colours as tokens |
| P-12 | Jackson 3 only | N/A | No Java |
| P-13 | Errors and validation follow the framework specs | PASS | The load-error alert stays; the overview shows "Tickets could not be loaded." and "–" tiles instead of an empty portfolio (AC-7 test) |
| P-14 | Test first, every acceptance criterion is proven by an automated test | PASS | Every AC maps to a passing test above. The table stage dot is now asserted in `Dashboard.test.tsx#shows the portfolio…` |
| P-15 | Observability | N/A | Pure UI |
| P-16 | Security | N/A | No external input, no IPC change |
| P-17 | Simplicity and dependencies | PASS | Plain SVG; no new package |
| P-18 | Modules build standalone | PASS | `developer-cockpit` typecheck and tests pass in `spec verify`, and `npm run build` passed in T-5 |
| P-19 | Documentation follows behaviour | PASS | `developer-cockpit/spec/03-features.md` §1 and `02-information-architecture.md` updated |

## Independent Review

The spec-reviewer agent's verdict was MET. Its findings and how each was resolved:

1. **[major] The segment buttons sat inside `<svg role="img">`.** The children of an image are
   presentational, so assistive technology could not see the buttons.
   - **Fixed:** the svg is now `role="group"` with the same label, and the tests query it by that
     role.
   - Implement was reopened for this fix and verify was re-run.
2. **[minor] The 1° minimum overlapped the next segment, and the design claimed a test.**
   - **Fixed:** the minimum was removed and segments are drawn at their exact angle.
   - The design's Risks row now says so.
3. **[minor] With *Show archived* on, the filtered table also lists archived tickets in that
   stage.**
   - **Documented** in `03-features.md`. The donut deliberately counts only active tickets, as
     AC-1 requires.
4. **[minor] AC-2 contrast is not computed in a test.**
   - **Recorded above:** it is covered indirectly by the validator in design.md plus the
     legend-label test.
   - A computed check is listed under Follow-ups.
5. **[minor] Filtering from the overview switches the table to *All tickets*, and *Clear* does not
   switch it back.**
   - **Accepted:** this is by design (Decisions) and meets AC-4.
6. **[minor] `02-information-architecture.md` still described the stage distribution chart.**
   - **Fixed.**
7. **[minor] verification.md was unfilled.**
   - **Resolved** by this document.

The table stage dot had no test (P-14 gap). An assertion was added.

## Automated Evidence

`evidence/last-run.json`: ran 2026-10-30T06:28:52Z, result `pass`, module `developer-cockpit`.

- **Policy check** (changes since main, merge base f84afcb7): PASS.
- **`npm run typecheck`:** exit 0 (`developer-cockpit-1.log`).
- **`npm test`:** exit 0 (`developer-cockpit-2.log`). 75 files and 443 tests passed, 2 skipped.

The run before this one failed once on an unrelated timeout in
`test/main/WatcherService.test.ts` (20 s, file-system watcher). That test passed alone (3 of 3)
and in this run.

## Follow-ups

- Compute the contrast against the card background in `stageColors.test.ts`, and assert that each
  colour below 3:1 is one with a legend label.
- `WatcherService.test.ts` "watches api-templates and the extra template paths" is flaky on
  Windows (20 s timeout).
- Consider restoring *My tickets* when the overview's stage filter is cleared.

## Verdict

Verdict: GOAL MET
