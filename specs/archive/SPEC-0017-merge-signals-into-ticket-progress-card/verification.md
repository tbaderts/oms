# Verification — SPEC-0017: Merge signals into ticket progress card

> **Is the goal really met?** Every claim here must point to evidence: a passing test, a file in
> `evidence/`, a command output. "Looks right" is not evidence. The gate requires every AC to be
> PASS, every policy reviewed, fresh automated evidence, and the verdict `GOAL MET`.

The implementation is in commit `55cc331` (on `main`). The tests are in `developer-cockpit/test/renderer/`. All of them ran and
passed in the verify run of 2026-10-31T05:39Z (`evidence/developer-cockpit-2.log`: 480 passed,
2 skipped; both skips are file-symlink fixture cases in the storyboard tests, unrelated).

## Acceptance Criteria Results

| AC | Criterion (short) | Evidence | Result |
|---|---|---|---|
| AC-1 | One Ticket progress card with donut, legend, Your turn and Activity bar; no Signals card | `Dashboard.test.tsx#ticket progress card holds donut, your turn and activity`: inside region *Ticket progress* it finds the donut group, region *Your turn* and the *Activity* button; no region *Signals* (evidence/developer-cockpit-2.log) | PASS |
| AC-2 | Collapsed by default; bar shows "2 new" and the latest entry; no feed rows | `Signals.test.tsx#activity starts collapsed with a summary of the latest entry (AC-2)`: `aria-expanded="false"`, no `aria-controls`, "2 new", level `info`, `08:03`, `SPEC-0001`, `design → plan`; no region *Activity*, no list items. The test seeds `fresh` directly. The "arrived after first load" mechanism that fills it is proven by the SPEC-0016 store tests (`signalsStore.test.ts`) and `Dashboard.test.tsx#live refresh adds a new activity entry marked new` | PASS |
| AC-3 | Click (Enter/Space) expands the feed of 20 newest-first entries with levels and new markers; click again hides it | `Signals.test.tsx#clicking the bar expands and collapses the feed (AC-3)`: `aria-expanded` toggles, `aria-controls` points to the feed, rows newest first with `data-level`, level icon and label, `data-new` on the fresh row; second click removes the region. `Dashboard.test.tsx#signals feed lists entries newest first when expanded`. 20-entry cap: `signals.test.ts#caps the feed at 20 entries` (the bar renders `collectSignals` unchanged). Enter/Space: the bar is a native `<button>`, which browsers activate on Enter and Space; no test simulates the keys (jsdom does not synthesize clicks from key events, and `@testing-library/user-event` is not a dependency) | PASS |
| AC-4 | Stays expanded across a live refresh (new entry on top) and across leaving and returning | `Dashboard.test.tsx#live refresh adds a new activity entry marked new` (expanded, new row on top marked new, still `aria-expanded="true"`); `Dashboard.test.tsx#activity stays expanded after leaving and returning` (unmount, remount, still expanded, feed rendered) | PASS |
| AC-5 | Status-bar indicator opens the Dashboard with Activity expanded | `SignalsShell.test.tsx#status bar counts new critical and attention signals and opens the dashboard (AC-5)`: starts on another view with `activityExpanded` false; after the click the view is `dashboard`; a Dashboard rendered afterwards has `aria-expanded="true"` and the counted entry at the top of the feed | PASS |
| AC-6 | No log entries → "No activity yet." and not expandable; load error → unavailable, no Your turn empty state, no Activity bar | `Signals.test.tsx#no activity: a plain row, nothing to expand (AC-6)` ("No activity yet.", no button); `Dashboard.test.tsx#shows load errors instead of an empty portfolio` ("signals are unavailable", no "Nothing needs you.", no "No activity yet.", no Activity button) | PASS |

## Goal Assessment

The goal asks for the signals header to merge into the ticket progress panel, and for activities to expand below it on
click, to save screen space. The chosen layout was one full-width card: donut and legend on the left, *Your turn* on the right,
and a one-line Activity bar below that expands the feed. `SpecOverview.tsx` and `Signals.tsx` implement exactly that.
The separate *Signals* card is gone, and the 22rem feed is no longer rendered unless the user asks for it. The
requester would recognise this as done.

Gap: the proposal says the layout "is also checked with a screenshot of the built app", and T-4 is ticked,
but `evidence/` holds no screenshots. The visual result is therefore not shown by stored evidence. The 900 px
truncation risk in design.md is mitigated in code (`min-w-0 truncate`) but has no stored proof. No AC depends on the
screenshots, so this is not a material gap to the goal. It is listed under Follow-ups.

## Policy Review

Reviewed against the SPEC-0017 part of commit `55cc331` and the follow-up change to `Signals.tsx` in this verify stage.

| Policy | Title | Result | Notes |
|---|---|---|---|
| P-01 | Contracts live only in oms-contracts | N/A | No contracts touched |
| P-02 | Specification before code, generated models only | PASS | Proposal approved, design and plan passed their gates before the code |
| P-03 | Never edit generated code | N/A | No generated code |
| P-04 | Contracts evolve compatibly | N/A | No OpenAPI/Avro/IPC change from SPEC-0017. The same commit also removes `beads` from `SpecTicketSummary`. That is unrelated work, changed in lockstep within one app (see Independent Review #1) |
| P-05 | Every state change is recorded in the event log | N/A | No OMS state |
| P-06 | Kafka only through the transactional outbox | N/A | No Kafka |
| P-07 | Schema changes through new Liquibase changesets | N/A | No database |
| P-08 | Concurrency and idempotency are explicit | N/A | A session UI flag in a zustand store |
| P-09 | Commands and queries stay separate | N/A | Read-only view |
| P-10 | State transitions go through the state machine and task pipeline | N/A | No order state |
| P-11 | Layering and conventions | PASS | Presentational components in `views/dashboard`; session state in the existing `stores/signals.ts`; status bar calls the store action |
| P-12 | Jackson 3 only | N/A | No Java |
| P-13 | Errors and validation follow the framework specs | PASS | On a load error, the card shows "Tickets could not be loaded." / "Signals are unavailable." and no empty states (AC-6) |
| P-14 | Test first, every acceptance criterion is proven by an automated test | PASS | Every AC maps to a passing test above. The Enter/Space part of AC-3 relies on native `<button>` semantics, not a test. The `aria-controls` fix in this stage was written red → green |
| P-15 | Observability | N/A | Pure UI |
| P-16 | Security | N/A | No new input, file or IPC access |
| P-17 | Simplicity and dependencies | PASS | No new package; native button with `aria-expanded`. The `docker-compose.yml` warning in last-run.json comes from SPEC-0031's uncommitted work in the same tree, not from this ticket |
| P-18 | Modules build standalone | PASS | `developer-cockpit` typecheck and full test suite exit 0 |
| P-19 | Documentation follows behaviour | PASS | `developer-cockpit/spec/03-features.md` §1 (Ticket progress and Signals rows) and `02-information-architecture.md` describe the merged card and the collapsible Activity bar |

## Independent Review

spec-reviewer verdict: **MET**, with no blocking or major findings. It found six minor issues:

1. **Unrelated work in the same commit.** `55cc331` also removes the `beads` field (`TicketDetail.tsx`, `ticket-fixtures.ts`, `05-data-model.md`, the shared type, the CLI and templates). That change is complete and harmless, but it is not SPEC-0017 and no ticket records it. **Resolution:** recorded here, not credited to SPEC-0017. Keep one ticket per commit in future.
2. **The verify ran over a tree with other uncommitted work.** That work makes the KPI tiles clickable filters (`KpiTiles.tsx`, `TicketTable.tsx`, `lib/spec-tickets.ts`, `stores/specTickets.ts`, a new Dashboard test, doc rows) and changes `vitest.config.ts` worker limits. It also includes SPEC-0031's docker-compose changes. **Resolution:** the SPEC-0017 tests pass with it present, and none of it changes SPEC-0017 code. The KPI-tile work is out of this ticket's scope (proposal: "Changes to the KPI tiles" out of scope) and has no ticket. It is listed under Follow-ups.
3. **`aria-controls="activity-feed"` pointed at a missing element while collapsed.** **Fixed:** `Signals.tsx` sets `aria-controls` only when expanded. `Signals.test.tsx` asserts that it is absent when collapsed and matches the feed's id when expanded (red, then green).
4. **No T-4 screenshots in `evidence/`.** **Resolution:** acknowledged in Goal Assessment; Follow-up.
5. **No Enter/Space test.** **Resolution:** keyboard activation comes from the native `<button>`. Adding `@testing-library/user-event` for one assertion is not justified (P-17). This is stated in the AC-3 row.
6. **verification.md unfilled.** **Resolved** by this document.

## Automated Evidence

`evidence/last-run.json`, ran at 2026-10-31T05:39:06Z, result **pass**, module `developer-cockpit`:

| Command | Exit | Time | Log |
|---|---|---|---|
| `npm run typecheck` | 0 | 11 s | evidence/developer-cockpit-1.log |
| `npm test` | 0 | 72 s | evidence/developer-cockpit-2.log (79 files, 480 passed, 2 skipped) |

Policy check (changes since main): PASS, no errors. One warning, `[R10 P-17] docker-compose.yml`, comes from
SPEC-0031's uncommitted changes in the working tree.

## Follow-ups

- Open a ticket for the uncommitted KPI-tile filter work (Active / In progress / Awaiting approval tiles filter the
  table, plus the `vitest.config.ts` worker limit), or fold it into an existing one before committing it.
- Optionally capture the T-4 screenshots (light/dark, collapsed/expanded, 1440 and 900 px) into `evidence/`.
- When committing, keep SPEC-0017's `aria-controls` fix and this ticket folder in a separate commit from the KPI-tile
  and SPEC-0031 work.

## Verdict

Verdict: GOAL MET
