# Verification — SPEC-0059: Improve trader ergonomics in oms-ui blotters

> **Is the goal really met?** Every claim here must point to evidence: a passing test, a file in
> `evidence/`, a command output. "Looks right" is not evidence. The gate requires every AC to be
> PASS, every policy reviewed, fresh automated evidence, and the verdict `GOAL MET`.

## Acceptance Criteria Results

All tests below ran and passed in the latest `spec verify` (evidence/oms-ui-1.log: 30 suites, 214
tests).

| AC | Criterion (short) | Evidence | Result |
|---|---|---|---|
| AC-1 | Number columns right-aligned, others not | `ColumnConfigService.test.ts#right-aligns number columns only` (`type: 'rightAligned'`, AG Grid's built-in type for cell and header alignment) | PASS |
| AC-2 | Prices 2–8 decimals, quantities with separators | `fieldFormat.test.ts#formats prices with 2 to 8 decimals`, `#formats quantities…`; `ColumnConfigService.test.ts#uses the price and quantity formatters`; `DetailPanel.test.tsx#shows the exec type label and formatted prices and quantities` | PASS |
| AC-3 | ExecType labels in grid and detail panel; unknown code shown as is | `fieldFormat.test.ts#labels FIX exec types…`; `ColumnConfigService.test.ts#labels execType and shows it as a badge`; `DetailPanel.test.tsx` ("Trade") | PASS |
| AC-4 | ID columns ≥ 220 px, start-truncated, full value on hover | `ColumnConfigService.test.ts#id columns are at least 220 px and use IdCell`; `IdCell.test.tsx#keeps the end visible and shows the full id on hover`, `#the stylesheet truncates the start…` (asserts `IdCell.scss`; jsdom does not lay out text) | PASS |
| AC-5 | History executions newest first; a chosen sort replaces it; orders unchanged | `Blotter.test.tsx#executions load newest first by default`, `#a chosen sort replaces the default`, `#orders keep their request…`; `OMSApiService.test.ts` builds `sort=field,DIR` | PASS |
| AC-6 | Escape closes the detail modal, filter builder and column selector; other keys don't | `DetailModal.test.tsx#Escape closes`, `FilterBuilder.test.tsx#Escape closes`, `ColumnSelector.test.tsx#Escape closes`; also `AuthorizeModal.test.tsx`, `useKeyboard.test.tsx#useDialog…` | PASS |
| AC-7 | F, C, R (History), P (Live), Enter; nothing fires while typing in a text input | `Blotter.test.tsx#keyboard shortcuts…`, `#shortcuts are ignored while typing in a text field…`, `#an inactive blotter ignores shortcuts`; `StreamingBlotter.test.tsx#P pauses and resumes`, `#F and C open their dialogs; Enter…`, `#shortcuts are ignored while typing…`, `#an inactive blotter…`; `useKeyboard.test.tsx` | PASS |
| AC-8 | Toggle reads Live and History, Live selected first | `App.test.js#mode toggle reads Live and History`; `App.keepMounted.test.tsx` uses the new names | PASS |
| AC-9 | One shared toolbar; mode-specific actions only in their mode | `BlotterToolbar.test.tsx#renders the shared part and the mode actions`; `Blotter.test.tsx#uses the shared toolbar with the history actions` (no Pause, Connect, Disconnect or snapshot); `StreamingBlotter.test.tsx#uses the shared toolbar with the live actions` (no Refresh or Auto-refresh) | PASS |
| AC-10 | oms-ui verify passes; existing tests still pass | evidence/oms-ui-1.log (`npm test`: 30 suites, 214 tests), evidence/oms-ui-2.log (`gradlew check`: BUILD SUCCESSFUL) | PASS |

## Goal Assessment

The goal listed the observations from the running app. Each one is addressed:
- **Numbers.** They are right-aligned, and prices are consistent (170.00 next to 86.96).
- **Exec Type.** It reads "Trade" instead of `F`.
- **IDs.** ID columns are wide and keep their distinguishing end visible, with the full id on hover.
- **Sort.** History executions come newest first.
- **Detail modal.** Escape closes it. Its title already read "Order details" since SPEC-0058.
- **Mode toggle.** It reads Live and History.
- **Toolbar.** One toolbar component replaces the two copies.

The keyboard support goes beyond the letter of the ACs, after the independent review:
- the dialogs are announced as modal dialogs;
- focus moves into a dialog and back out of it;
- a focused checkbox doesn't swallow shortcuts;
- dialogs in hidden views stay out of the way;
- shortcut buttons declare `aria-keyshortcuts`.

A requester working in the blotters all day would agree the goal is met.

Left out on purpose:
- backend labels for `execType`;
- the unsupported filters on `/api/executions`;
- per-instrument price precision;
- SPEC-0060's token work.

## Policy Review

| Policy | Title | Result | Notes |
|---|---|---|---|
| P-01 | Contracts live only in oms-contracts | N/A | No contract files |
| P-02 | Specification before code, generated models only | PASS | UI only, no models |
| P-03 | Never edit generated code | PASS | None touched |
| P-04 | Contracts evolve compatibly | N/A | No contract change; `sort` is an existing parameter |
| P-05 | Every state change is recorded in the event log | N/A | Display only |
| P-06 | Kafka only through the transactional outbox | N/A | No messaging |
| P-07 | Schema changes through new Liquibase changesets | N/A | No schema |
| P-08 | Concurrency and idempotency are explicit | N/A | No commands |
| P-09 | Commands and queries stay separate | N/A | Read-only UI |
| P-10 | State transitions go through the state machine and task pipeline | N/A | No transitions |
| P-11 | Layering and conventions | PASS | Formatting in `services/`, components in `components/`, hooks in `hooks/` |
| P-12 | Jackson 3 only | N/A | No Java |
| P-13 | Errors and validation follow the framework specs | N/A | No API errors |
| P-14 | Test first, every AC proven by an automated test | PASS | Each AC traces to named tests, written red first; the truncation CSS is asserted on the stylesheet |
| P-15 | Observability | N/A | No server behaviour |
| P-16 | Security | PASS | No new inputs; values render through React escaping |
| P-17 | Simplicity and dependencies | PASS | No new dependencies; one formatter module and one toolbar replace duplicated code |
| P-18 | Modules build standalone | PASS | oms-ui verify passes on its own |
| P-19 | Documentation follows behaviour | PASS | `ui/admin-ui.md` (formatting, keyboard, dialogs, toolbar diagram, Live/History), `capabilities/admin-ui.md`, `log.md`; okf-check 0 errors |

## Independent Review

The spec-reviewer ran twice.

**First pass: MET, with 8 findings.** It rated AC-4 and AC-7 as weak; both are now proven.

| # | Severity | Finding | Fix |
|---|---|---|---|
| 1 | major | The truncation CSS was untested | `IdCell.test.tsx` asserts `IdCell.scss` |
| 2 | minor | A focused checkbox blocked shortcuts | Only text-like inputs count as typing; blotter-level tests for a text field and a checkbox |
| 3 | minor | A dialog in a hidden view blocked shortcuts | Hidden overlays are ignored |
| 4 | minor | Dialogs had no focus handling, role or modality; AuthorizeModal ignored Escape; no `aria-keyshortcuts` | `useDialog` on all four dialogs (role, `aria-modal`, label, focus in and back, Escape, hidden views ignored); `aria-keyshortcuts` on the shortcut buttons |
| 5 | minor | `strikePrice` formatted differently in grid and detail | `strikePrice` is a price everywhere |
| 6 | minor | Stale toolbar diagram | Diagram and keyboard text updated |
| 7 | minor | Undocumented scope | Recorded in design.md |
| 8 | minor | Another session's change to the SPEC-0054 `ticket.md` is in the working tree | Accepted: not part of this ticket, leave it out of the commit |

**Second pass: MET.** All eight findings were resolved. Its new item 1, `strikePrice` missing from
the formatting text in `ui/admin-ui.md`, was fixed before the final verify run. New items 2 and 3
are follow-ups.

## Automated Evidence

`evidence/last-run.json`: ran 2026-11-15T11:42:16Z, result **pass**, fingerprint `2543c63502eb6c78`,
module oms-ui.

| Command | Exit | Log |
|---|---|---|
| `npm test -- --watchAll=false --passWithNoTests` (30 suites, 214 tests) | 0 | evidence/oms-ui-1.log |
| `..\gradlew.bat -p .. check` | 0 | evidence/oms-ui-2.log |

Policy check (changes since main, merge-base 03bc12da): PASS.

## Follow-ups

- Keep Tab inside an open dialog (focus trap). Today focus moves in and back, but Tab can reach
  elements behind an `aria-modal` dialog.
- If two dialogs are ever open at once (a blotter dialog plus Authorization), one Escape closes
  both. This is probably unreachable, because the overlay covers the header.
- `/api/executions` ignores filters; contract or retire the hand-written REST read API (TD-3).
- The working tree also holds other sessions' changes (SPEC-0054 `ticket.md`,
  `developer-cockpit/src/shared/types/*`, `specs/changes/SPEC-0062-*`). Stage SPEC-0059 files
  explicitly when committing.

## Verdict

Verdict: GOAL MET
