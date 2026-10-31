# Verification — SPEC-0037: Filter the ticket table from KPI tiles

> **Is the goal really met?** Every claim here must point to evidence: a passing test, a file in
> `evidence/`, a command output. "Looks right" is not evidence. The gate requires every AC to be
> PASS, every policy reviewed, fresh automated evidence, and the verdict `GOAL MET`.

## Acceptance Criteria Results

All of these ran in the last `spec verify` (evidence/developer-cockpit-2.log: 83 files, 495 passed,
2 skipped). The production code is the code committed in `ad7c3d0`. This ticket only adds tests and
one clause of documentation.

The gap tests passed at once, as expected for behaviour that is already committed. To show they
can fail, I made a mutation check on the AC-3 test: with `toggleStageFilter` changed to never clear
the filter, it failed ("In progress: expected 4 ids to equal 5"). The store was then restored with
`git checkout`; it had no other local changes. The AC-6 test cannot pass by accident: its stubbed
CPU counts give different results (2, 4 and 6), which one fixed machine value could not produce.

| AC | Criterion (short) | Evidence | Result |
|---|---|---|---|
| AC-1 | *Active tickets* lists all 5 tickets (everyone's), button pressed, no stage filter | `Dashboard.test.tsx` › "the Active, In progress and Awaiting approval tiles filter the table; Task completion does not". It first asserts the 3 *My tickets* rows (SPEC-0002, SPEC-0003, SPEC-0005); after the click it asserts all 5, `aria-pressed="true"` and no chip | PASS |
| AC-2 | *In progress* → SPEC-0001 to SPEC-0004, chip "In progress"; *Awaiting approval* → SPEC-0001, SPEC-0002, chip "Awaiting approval" | same test; `spec-tickets-lib.test.ts` › "filterTickets in-progress and awaiting" | PASS |
| AC-3 | Clicking either cross-stage tile again removes the filter | `Dashboard.test.tsx` › "clicking In progress or Awaiting approval again removes the filter" (new; mutation check above) | PASS |
| AC-4 | *Blocked* / *Done* filter to their stage, and a second click clears it; *Task completion* has no button | `Dashboard.test.tsx` › "clicking a donut segment, legend entry or tile filters the ticket table and Clear resets it" (now also a second click on *Blocked*: all 5, `aria-pressed="false"`); the AC-1 test asserts *Task completion* has no button | PASS |
| AC-5 | With *All tickets* selected, the select's cross-stage views list the tile's tickets; the chip shows the tile's label and accent | `Dashboard.test.tsx` › "the stage select's cross-stage views list the same tickets as their tiles" (new). It selects *All tickets* explicitly, checks that the select ids equal the tile ids, and checks the chip label and dot `var(--stage-proposal)` / `var(--stage-plan)`. Also `StageDonut.test.tsx` › "the filter chip labels and colours the tiles cross-stage filters" | PASS |
| AC-6 | `maxWorkers` 2, 2, 4, 6, 6 for 1, 4, 8, 12, 32 CPUs; `minWorkers` 1 | `test/vitest-config.test.ts` › "caps workers at half the CPUs, between 2 and 6" (new; the real config is loaded with `os.cpus()` stubbed) | PASS |
| AC-7 | The whole suite passes under the worker limit | `spec verify` → `npm test` exit 0, 495 passed, 2 skipped (evidence/developer-cockpit-2.log) | PASS |

## Goal Assessment

The goal asked for the KPI-tile filtering and the vitest worker limit to be "verified and committed
separately". Both had already been committed and pushed in `ad7c3d0`. Committing them separately is
therefore impossible without rewriting `main`, which the project forbids. The approved proposal
limits the ticket to verification.

Verification is complete:
- every tile behaviour, the cross-stage views in the select and the chip, and the worker limit now
  have acceptance criteria;
- each criterion is traced to a passing test;
- the two untested behaviours (toggling the cross-stage tiles off, and the worker bounds) now have
  tests.

This ticket's own commit will hold those tests and the one documentation clause.

During verification, the independent review found that AC-5 left out its precondition. The stage
select keeps the *My tickets* / *All tickets* mode, while a tile click switches to *All tickets*.
The ticket was reopened at proposal, AC-5 was reworded, and the human approved it on 2026-10-31 at
18:53. The behaviour was not changed. Whether the select should also switch modes remains a
possible future ticket (see Follow-ups).

There is no material gap left.

## Policy Review

This review covers SPEC-0037's changes: `Dashboard.test.tsx`, the new `test/vitest-config.test.ts`,
and the KPI-row clause in `spec/03-features.md`. It also covers the committed production code they
verify. Other tickets' uncommitted changes in the tree are not part of this review.

| Policy | Title | Result | Notes |
|---|---|---|---|
| P-01 | Contracts live only in oms-contracts | N/A | no contracts |
| P-02 | Specification before code, generated models only | N/A | no API or message contract; the ticket adds the specification for committed UI behaviour |
| P-03 | Never edit generated code | PASS | no generated code touched |
| P-04 | Contracts evolve compatibly | N/A | no contracts |
| P-05 | Every state change is recorded in the event log | N/A | no order state |
| P-06 | Kafka only through the transactional outbox | N/A | no Kafka |
| P-07 | Schema changes through new Liquibase changesets | N/A | no database |
| P-08 | Concurrency and idempotency are explicit | N/A | no order updates |
| P-09 | Commands and queries stay separate | N/A | read-only UI filtering |
| P-10 | State transitions go through the state machine and task pipeline | N/A | no order state |
| P-11 | Layering and conventions | PASS | the new tests reuse the existing Dashboard fixture and helpers (`TICKETS`, `tile()`, `tableIds()`) and the select `pick` pattern from `TicketTable.test.tsx` |
| P-12 | Jackson 3 only | N/A | TypeScript |
| P-13 | Errors and validation follow the framework specs | N/A | no API errors |
| P-14 | Test first, every acceptance criterion is proven by an automated test | PASS | every AC is traced above. The gap tests passed at once because the behaviour already existed; that is recorded, and backed by the mutation check |
| P-15 | Observability | N/A | no runtime flow added |
| P-16 | Security | N/A | no input boundary, secret or entitlement |
| P-17 | Simplicity and dependencies | PASS | tests and one documentation clause; no dependency or build change |
| P-18 | Modules build standalone | PASS | `npm run typecheck` and `npm test` passed in developer-cockpit (`spec verify`) |
| P-19 | Documentation follows behaviour | PASS | `spec/03-features.md` now also states that a tile click switches the table to *All tickets*. The code already did this and the page omitted it; recorded in design.md, Approach step 6 |

## Independent Review

The spec-reviewer agent found the goal met, with no blocking finding. How each finding was handled:

1. **[major] AC-5's test relied on an unstated precondition.** The select keeps My/All, while a tile
   switches to All. *Resolved by reopening the proposal:* AC-5's Given is now "with *All tickets*
   selected", with an open question about changing the select instead. Re-approved by the human.
   The test now selects *All tickets* explicitly (T-7).
2. **[minor] AC-4's second click on *Blocked* was untested.** *Fixed:* the test clicks *Blocked*
   again and asserts all 5 ids and `aria-pressed="false"`.
3. **[minor] The AC-1 assertions could not fail.** The `aria-pressed` check was already true before
   the click, and the switch to everyone's tickets was assumed. *Fixed:* the test asserts the 3
   *My tickets* rows before the click.
4. **[minor] design.md said no edit to `03-features.md` was expected.** *Fixed:* design.md
   Approach step 6 records why the clause was added.
5. **[minor] `03-features.md` also holds a SPEC-0035 hunk.** *Noted:* stage only this ticket's hunk
   when committing (`git add -p`).
6. **[process] verification.md was unfilled.** *Fixed:* this document.

The review ran before the T-7 test changes. Those changes only address the findings above, and the
evidence below was produced after them.

## Automated Evidence

`evidence/last-run.json`, from the last `spec verify` run, made after the final test change:
- **Result:** pass. Module: developer-cockpit.
- **Policy check:** PASS (changes since main, merge-base `ad7c3d0`).
- **`npm run typecheck`:** exit 0 (evidence/developer-cockpit-1.log).
- **`npm test`:** exit 0, 83 files, 495 passed, 2 skipped, plus the separate perf run
  (evidence/developer-cockpit-2.log).

## Follow-ups

- Optional: decide whether the table's stage select should also switch to *All tickets* when a
  cross-stage view is picked, matching the tiles. That is a behaviour change and would need its own
  AC.
- When committing, stage only SPEC-0037's hunks in `developer-cockpit/spec/03-features.md`, because
  SPEC-0035 also edited that file.

## Verdict

Verdict: GOAL MET
