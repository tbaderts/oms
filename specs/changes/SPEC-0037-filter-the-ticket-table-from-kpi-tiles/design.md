# Design — SPEC-0037: Filter the ticket table from KPI tiles

> **Stage 2 of 3 — how.** Concrete enough that the plan can be written without re-reading the
> code, and checked line by line against the architecture policies. Write "None — <reason>" for a
> section that genuinely does not apply.

## Context

The behaviour is already implemented and committed (`ad7c3d0`, on `origin/main`). All paths are
under `developer-cockpit/`.

- **`src/renderer/lib/spec-tickets.ts`**
  - Declares `TILE_CROSS_VIEWS = ['in-progress', 'awaiting']` and
    `StageFilter = SpecTicketStatus | TileCrossView | ''`.
  - `inStageView` decides which tickets a view shows: `in-progress` → status ≠ done; `awaiting` →
    `!!awaiting`; a stage → status equals that stage; `''` → all.
  - `stageFilterLabel` and `stageFilterAccent` give the display label and colour (*In progress* /
    `--stage-proposal`, *Awaiting approval* / `--stage-plan`).
  - `filterTickets` applies the view.
- **`src/renderer/stores/specTickets.ts`** — `toggleStageFilter(stage)` sets
  `stage = current === stage ? '' : stage` and `mineOnly = false`.
- **`src/renderer/views/dashboard/KpiTiles.tsx`**
  - The tiles carry a `filterStage`:
    - *Active tickets* → `''`
    - *In progress* → `in-progress`
    - *Awaiting approval* → `awaiting`
    - *Blocked* → `blocked`
    - *Done* → `done`
    - *Task completion* → none, so it renders without a button
  - Each tile's button has `aria-pressed={stage === filterStage}`.
- **`src/renderer/views/dashboard/TicketTable.tsx`** — the stage select offers
  `[...TILE_CROSS_VIEWS, ...SPEC_STAGES, 'blocked']`, labelled through `stageFilterLabel`.
- **`StageDonut.tsx`** — the filter chip (`data-testid="stage-filter-chip"`) shows the label and the
  accent dot.
- **`vitest.config.ts`** sets:
  - `maxWorkers: Math.min(6, Math.max(2, Math.ceil(os.cpus().length / 2)))`
  - `minWorkers: 1`
- **Existing tests**
  - `test/renderer/Dashboard.test.tsx`:
    - "clicking a donut segment, legend entry or tile filters the ticket table and Clear resets it"
      covers *Blocked* and *Done*, including the second click;
    - "the Active, In progress and Awaiting approval tiles filter the table; Task completion does
      not" covers clicking *Active tickets*, *In progress* and *Awaiting approval* once.
  - `test/renderer/spec-tickets-lib.test.ts` › "filterTickets in-progress and awaiting".
  - `test/renderer/TicketTable.test.tsx` › "stage, module and search filters and show archived drive
    the table" picks *In progress* and *Awaiting approval* in the select, but only checks titles
    with "contains".
  - `test/renderer/StageDonut.test.tsx` › "the filter chip labels and colours the tiles cross-stage
    filters".
  - Nothing tests `vitest.config.ts`.

## Approach

Verification only: no production code changes, unless a new test exposes a defect against an AC.
In that case, follow "When reality diverges" in spec-implement and record it here.

1. **AC-1:** extend the existing Dashboard test "the Active, In progress and Awaiting approval tiles
   …". After *Active tickets*, also assert that the filter chip is absent, meaning no stage filter.
2. **AC-3 (gap):** new Dashboard test "clicking In progress or Awaiting approval again removes the
   filter". For each of the two tiles: click it (filtered), click it again, then assert all five
   ids, no chip, and `aria-pressed="false"`.
3. **AC-5 (strengthen):** new Dashboard test "the stage select's cross-stage views list the same
   tickets as their tiles". It first selects *All tickets* explicitly (AC-5's Given; the select keeps
   the My/All mode, while a tile click switches to All). For each view:
   - click the tile and record `tableIds()`;
   - click the tile again to clear it;
   - pick the same option in the *Stage filter* select and assert identical `tableIds()`;
   - assert the chip's text and its dot colour (`var(--stage-proposal)` / `var(--stage-plan)`).
   It reuses the `pick` pattern of `TicketTable.test.tsx` (`keyDown` Enter on the combobox, then
   click the option).
4. **AC-6 (gap):** new `test/vitest-config.test.ts`. For each CPU count (1, 4, 8, 12, 32):
   - `vi.resetModules()`;
   - `vi.doMock('os', …)` so that `os.cpus()` (default and named export) returns an array of that
     length;
   - dynamically `import('../vitest.config')`;
   - assert `config.test.maxWorkers` and `config.test.minWorkers`.
   `vi.doUnmock('os')` runs afterwards.
5. **AC-2, AC-4 and AC-7** are already proven by existing tests and by `npm test` in `spec verify`.
   They are traced, not changed.
6. Check `spec/03-features.md` (KPI tiles row, Filters paragraph) against the ACs.
   - **Changed during implementation:** one clause was added to the KPI tiles row, "a tile click
     also switches the table to *All tickets*". The code does this (`toggleStageFilter` sets
     `mineOnly: false`), and AC-1 relies on it, but the page did not say so. Nothing else
     disagreed.
7. **Added after independent review (reopened at verify):**
   - AC-5's test selects *All tickets* explicitly instead of inheriting it from an earlier tile
     click.
   - The AC-4 test also clicks *Blocked* a second time and asserts that the filter is cleared.
   - The AC-1 test first asserts the three *My tickets* rows (SPEC-0002, SPEC-0003, SPEC-0005),
     so the switch to all five tickets is shown to come from the click.

## Contract Changes

None. The change is UI and tests inside developer-cockpit only.

## Data & Persistence

None.

## Events & Messaging

None.

## Domain, State & Orchestration

None. No OMS domain is involved. The renderer state used is the existing `useSpecTicketsStore`
`stage` and `mineOnly`, and it is unchanged.

## Alternatives & Decisions

- **Verify the committed code; do not re-commit or split `ad7c3d0`.** That would rewrite pushed
  `main`. Approved with the proposal.
- **AC-6 tests the formula with a stubbed `os.cpus()`.** Rejected alternative: asserting the
  machine's value, which differs per machine and would not prove the bounds. Rejected alternative:
  extracting the formula into a helper module, which changes build config only to make it testable.
  Importing the config under a mock tests the real file as it is.
- **New Dashboard tests sit next to the existing tile tests** (same `TICKETS` fixture, `tile()` and
  `tableIds()` helpers), not in a new file. This follows the existing pattern.
- **No new dependency or build change.**

## Risks & Mitigations

- **Importing `vitest.config.ts` from inside a test.** It only imports `vitest/config`, `path` and
  `os` and calls `defineConfig`, which returns the object. There are no side effects.
  `vi.resetModules()` per case keeps the evaluations independent.
- **The Radix select in jsdom.** The `pick` pattern already works in `TicketTable.test.tsx`; the
  new tests reuse it.
- **A new test exposes a defect.** It is handled test-first within this ticket, only where it
  violates an AC, and recorded here.

## Test Strategy

| AC | Level | Test class#method | What it asserts |
|---|---|---|---|
| AC-1 | component (vitest, jsdom) | `test/renderer/Dashboard.test.tsx` › "the Active, In progress and Awaiting approval tiles filter the table; Task completion does not" (extended) | before the click, the 3 *My tickets* rows; after *Active tickets*: all 5 ids, `aria-pressed="true"`, no filter chip |
| AC-2 | component | same test (existing) | *In progress* → SPEC-0001 to SPEC-0004, chip "In progress"; *Awaiting approval* → SPEC-0001 and SPEC-0002, chip "Awaiting approval" |
| AC-3 | component | `Dashboard.test.tsx` › "clicking In progress or Awaiting approval again removes the filter" (new) | after the second click: all 5 ids, no chip, `aria-pressed="false"` |
| AC-4 | component | `Dashboard.test.tsx` › "clicking a donut segment, legend entry or tile filters the ticket table and Clear resets it" (existing), and "the Active, In progress … Task completion does not" (*Task completion* has no button) | *Blocked* → SPEC-0004, a second click → all and `aria-pressed="false"`; *Done* → SPEC-0005, a second click → all; *Task completion* has no button |
| AC-5 | component | `Dashboard.test.tsx` › "the stage select's cross-stage views list the same tickets as their tiles" (new); `StageDonut.test.tsx` › "the filter chip labels and colours the tiles cross-stage filters" (existing) | with *All tickets* selected first, the select's ids equal the tile's ids for both views; chip label and dot `var(--stage-proposal)` / `var(--stage-plan)` |
| AC-6 | unit | `test/vitest-config.test.ts` › "caps workers at half the CPUs, between 2 and 6" (new) | cpus 1, 4, 8, 12, 32 → maxWorkers 2, 2, 4, 6, 6; minWorkers 1 |
| AC-7 | suite | `spec verify` → `npm test` (evidence/developer-cockpit-2.log) | whole suite green under the worker limit |

## Policy Compliance

| Policy | Title | Status | How / Justification |
|---|---|---|---|
| P-01 | Contracts live only in oms-contracts | n/a | no contracts |
| P-02 | Specification before code, generated models only | n/a | no API or message contract; this ticket adds the missing specification for committed UI behaviour |
| P-03 | Never edit generated code | comply | no generated code touched |
| P-04 | Contracts evolve compatibly | n/a | no contracts |
| P-05 | Every state change is recorded in the event log | n/a | no order state |
| P-06 | Kafka only through the transactional outbox | n/a | no Kafka |
| P-07 | Schema changes through new Liquibase changesets | n/a | no database |
| P-08 | Concurrency and idempotency are explicit | n/a | no order updates |
| P-09 | Commands and queries stay separate | n/a | read-only UI filtering |
| P-10 | State transitions go through the state machine and task pipeline | n/a | no order state |
| P-11 | Layering and conventions | comply | tests follow the existing Dashboard and TicketTable test patterns |
| P-12 | Jackson 3 only | n/a | TypeScript |
| P-13 | Errors and validation follow the framework specs | n/a | no API errors |
| P-14 | Test first, every acceptance criterion is proven by an automated test | comply | every AC is mapped above. For behaviour that already exists, "test first" means the new test is written before any fix; a gap test that passes immediately is recorded as such, not as red → green |
| P-15 | Observability | n/a | no runtime flow added |
| P-16 | Security | n/a | no input boundary, secret or entitlement involved |
| P-17 | Simplicity and dependencies | comply | tests only, no dependency or build change |
| P-18 | Modules build standalone | comply | `npm run typecheck` and `npm test` in developer-cockpit via `spec verify` |
| P-19 | Documentation follows behaviour | comply | `developer-cockpit/spec/03-features.md` already describes the behaviour and is checked against the ACs (Approach step 6) |

## Knowledge Base Updates

None. Nothing in `oms-knowledge-base/` describes the cockpit dashboard, and
`developer-cockpit/spec/03-features.md` was updated in `ad7c3d0`. Verification re-checks it against
the ACs, and a mismatch is corrected then.
