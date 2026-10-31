# Proposal — SPEC-0037: Filter the ticket table from KPI tiles

> **Stage 1 of 3 — why and what, not how.** The acceptance criteria below are the contract that
> the verify stage checks. If they are vague, the goal cannot be proven met.

## Why

SPEC-0017 merged the signals into the Ticket progress card. Since then, the developer-cockpit
Dashboard has gained two changes that no ticket specifies or verifies:

1. **KPI tiles filter the ticket table.** Before, only *Blocked* and *Done* toggled the stage
   filter. Now *Active tickets* clears it, and *In progress* and *Awaiting approval* apply two new
   cross-stage views. Those views are also offered by the table's stage select and labelled on the
   filter chip.
2. **The vitest worker limit.** `vitest.config.ts` caps the workers at half the CPUs, at least 2 and
   at most 6, with `minWorkers: 1`. Many tests spawn child processes, and one worker per CPU made
   the RPC between vitest and its workers time out.

The goal asked for this "uncommitted" work to be verified and committed separately from SPEC-0017
and SPEC-0031. The situation has changed since the ticket was written:

- Both changes are already committed and pushed. They are part of `ad7c3d0` ("improvements, bug
  fixes", 2026-10-31 09:00, 241 files), which is on `origin/main`.
  - Files: `src/renderer/lib/spec-tickets.ts`, `test/renderer/Dashboard.test.tsx`,
    `spec/03-features.md`, `vitest.config.ts` and others.
- Splitting them into their own commit would mean rewriting pushed `main`, which the project rules
  forbid ("Never force-push `main`").

What remains possible, and still worth doing, is the **verification**. The behaviour gets
acceptance criteria and traced evidence, and the gaps in its tests are closed. Today:

- Most of it is tested: `Dashboard.test.tsx` covers the tiles, `spec-tickets-lib.test.ts` the
  filter logic, `TicketTable.test.tsx` the select, and `StageDonut.test.tsx` the chip.
- Two behaviours are untested: clicking *In progress* or *Awaiting approval* a second time to remove
  the filter, and the worker limit.

Without this ticket, the change stays an unspecified side effect of a bulk commit, and a regression
in either gap would go unnoticed.

## What Changes

- No behaviour change. The committed tile filtering and worker limit are specified here as they
  are.
- New or extended tests close the two gaps: toggling the cross-stage tiles off, and the worker
  bounds.
- If verification finds a defect, it is fixed test-first within this ticket, but only where it
  violates an AC below.

## Scope

### In scope

- Acceptance criteria for the KPI-tile filtering, the cross-stage views in the table and chip, and
  the vitest worker limit.
- The missing tests, plus tracing every AC to a passing test.
- Any correction to `developer-cockpit/spec/03-features.md`, if it disagrees with the code.

### Out of scope

- Re-committing or splitting `ad7c3d0`, or any history rewrite.
- New tile behaviour: making *Task completion* clickable, or multi-select filters.
- The donut and legend filtering (SPEC-0017) beyond what the chip shares with the tiles.
- SPEC-0031's content.

## Acceptance Criteria

The fixture for AC-1 to AC-4 is the five tickets of `Dashboard.test.tsx` (`TICKETS`, user Alice):

| Ticket | Status | Awaiting approval? |
|---|---|---|
| SPEC-0001 | proposal | yes |
| SPEC-0002 | design | yes |
| SPEC-0003 | implement | no |
| SPEC-0004 | blocked | no |
| SPEC-0005 | done | no |

- **AC-1** — Given the Dashboard with that fixture, when *Active tickets* is clicked, then the table
  lists all five tickets (everyone's, not only Alice's), the tile's button has
  `aria-pressed="true"`, and no stage filter is set.
- **AC-2** — Given the Dashboard, when *In progress* is clicked, then the table lists every ticket
  that is not done, blocked included (SPEC-0001 to SPEC-0004), and the filter chip reads *In
  progress*. When *Awaiting approval* is clicked, the table lists SPEC-0001 and SPEC-0002, and the
  chip reads *Awaiting approval*.
- **AC-3** — Given the *In progress* or *Awaiting approval* filter set from its tile, when the same
  tile is clicked again, then the stage filter is removed: all five tickets are listed, the chip is
  gone, and the tile's button has `aria-pressed="false"`.
- **AC-4** — Given the Dashboard, when *Blocked* or *Done* is clicked, then the table shows only
  that stage, and a second click clears it. *Task completion* has no button and does not filter.
- **AC-5** — Given the ticket table with *All tickets* selected, when *In progress* or *Awaiting
  approval* is picked in its stage select, then the table shows the same tickets as the matching
  tile does. The filter chip uses the tile's label and the tile's accent colour
  (`--stage-proposal` for *In progress*, `--stage-plan` for *Awaiting approval*). The select keeps
  the table's *My tickets* / *All tickets* mode. A tile click always switches the table to *All
  tickets*, because the tiles count all active tickets.
- **AC-6** — Given `vitest.config.ts`, when it is evaluated with 1, 4, 8, 12 and 32 CPUs, then
  `maxWorkers` is 2, 2, 4, 6 and 6 respectively (half the CPUs rounded up, at least 2, at most 6),
  and `minWorkers` is 1.
- **AC-7** — Given the whole developer-cockpit suite, when `npm test` runs with the configured
  worker limit, then it passes (`spec verify`).

## Impact

| Area | Impact |
|---|---|
| Modules | developer-cockpit |
| Contracts (OpenAPI / Avro) | none |
| Data (tables, migrations) | none |
| Events / Kafka topics | none |
| Consumers (oms-ui, oms-mcp-server, downstream) | none |
| Knowledge base | none in `oms-knowledge-base/`. `developer-cockpit/spec/03-features.md` already describes the behaviour (changed in `ad7c3d0`); it is checked against the ACs and corrected only if they disagree |

## Open Questions

- [resolved] The goal asks to commit this work separately, but it is already in pushed `main`
  (`ad7c3d0`). → assumption: this ticket only specifies and verifies the committed behaviour and
  closes its test gaps. Its own commit will hold the new tests (and any fix). History is not
  rewritten. **Reviewer: if you would rather close the ticket because the work already shipped,
  archive it instead of approving.**
- [resolved] Reopened at verify: should the stage select also switch the table to *All tickets*,
  like a tile click? → assumption: no. AC-5 now states its precondition (*All tickets*) instead.
  The committed select keeps the My/All mode; it is one filter among several, while a tile is a
  shortcut to "these tickets of the whole portfolio". Changing the select would change behaviour
  that is not in this ticket's goal. **Reviewer: if you want the select to switch modes as well,
  say so; that is a behaviour change with its own AC.**
- [resolved] Should AC-6 test the formula or the machine's actual value? → assumption: the formula,
  evaluated for fixed CPU counts by stubbing `os.cpus()`. That keeps it deterministic on any
  machine.
