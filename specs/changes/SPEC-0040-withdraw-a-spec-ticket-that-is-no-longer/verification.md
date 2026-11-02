# Verification — SPEC-0040: Withdraw a spec ticket that is no longer needed

> **Is the goal really met?** Every claim here must point to evidence: a passing test, a file in
> `evidence/`, a command output. "Looks right" is not evidence. The gate requires every AC to be
> PASS, every policy reviewed, fresh automated evidence, and the verdict `GOAL MET`.

## Acceptance Criteria Results

The final `spec verify` (2026-11-01 07:16Z, after the review fixes T-7) ran the developer-cockpit
typecheck and test suite: 84 files, 506 tests passed, 2 skipped (symlink cases that cannot run on Windows), 0 failures
(`evidence/developer-cockpit-2.log`). The CLI tests run `specs/tools/spec.mjs` in a copied fixture
workspace, never against the repository's own `specs/`.

| AC | Criterion (short) | Evidence | Result |
|---|---|---|---|
| AC-1 | Withdraw at any stage before done → archived, `withdrawn`, `withdrawn_from`, reason, no awaiting/autopilot, log line | `spec-cli-withdraw.test.ts` › `withdraws a ticket at any stage before done`: tickets at proposal (with autopilot on), implement, blocked (from design) and awaiting approval. For each: exit 0, folder moved to `specs/archive`, `status: withdrawn`, `withdrawn_from` (`design` for the blocked one), `withdrawn_reason`, `awaiting` empty, `autopilot: false`, log `withdrawn: <reason>`. Red before T-5 (unknown command) | PASS |
| AC-2 | Refusals: no reason, done, unknown, archived; nothing changes | `spec-cli-withdraw.test.ts` › `refuses without a reason, for done, unknown or archived tickets`: each non-zero with its message (usage, blank reason, done, `No ticket matches`, `already archived`, the archived fixture not being done); every file byte-identical afterwards. `› refuses when the archive target exists, and an unmoved withdrawn ticket` (T-7): both refused before anything is written. The first test passed before T-5 too (an unknown command also fails); since T-5 it exercises the real refusals | PASS |
| AC-3 | Withdrawn ticket leaves `list`, shows in `list --all` and `status` with reason, ignored by `ci` | `spec-cli-withdraw.test.ts` › `a withdrawn ticket leaves the active views and ci`: a ticket at plan with an unfilled proposal makes `ci` fail; after withdrawing it, `list` omits it, `list --all` shows `withdrawn` (plain) and `meta.status`/`withdrawn_reason` (`--json`), `status` shows the reason and a real next step (no `undefined`; `--json` `next` set), and `ci` passes. Red before T-5 | PASS |
| AC-4 | The PreToolUse hook denies `spec withdraw` for agents | `spec-cli-withdraw.test.ts` › `the pre-tool hook denies withdraw like approve`: a Bash `tool_input` running `spec.mjs withdraw …` gets exit 2 and a message naming withdraw and the requester; `approve` still denied; `list` allowed. Red before T-5 | PASS |
| AC-5 | Cockpit: withdrawn badge and reason, not counted; Withdraw… with required reason runs the CLI; not offered for done or archived | `SpecTicketsService.actions.test.ts` › `withdraw requires a reason and runs spec withdraw` (empty and `--` reasons rejected before the CLI; argv `['withdraw', id, reason]`). `TicketActions.test.tsx` › `Withdraw… asks for a reason and runs the action; not offered when done or archived` (confirm disabled until a reason; action sent; absent for done and archived). `TicketDetail.test.tsx` › `a withdrawn ticket shows the withdrawn badge and reason` (`withdrawn` badge, no `archived`, "Withdrawn at proposal: …"). `spec-tickets-kpis.test.ts` › `withdrawn tickets are not counted`. Since T-7: `spec-tickets-lib.test.ts` › `withdrawn tickets: stage index of their withdrawn-from stage, outside the in-progress view` (a ticket withdrawn from implement shows implement), and `specTickets-store.test.ts` › `keeps a withdrawn ticket open by showing archived tickets` (after Withdraw… the detail stays open, shows the ticket as withdrawn, with the CLI output). Red first, except the KPI guard (archived tickets were already excluded) | PASS |

## Goal Assessment

The Goal: a way to close a ticket that will not be implemented, keeping its history, out of the
active views, gates, Stop hook and `spec ci`, shown distinctly in the cockpit with a reason, and
documented.

- **Command and state:** `spec withdraw`, status `withdrawn`, archived at once (AC-1, AC-2).
- **Out of the workflow:** gates, `spec ci` and both hooks read only `specs/changes`; the
  withdrawn ticket is archived, so it is excluded with no special case (AC-3).
- **Cockpit:** badge, reason, action; KPIs and distribution exclude it (AC-5).
- **Documentation:** `specs/README.md` (section, quick start, hook table) and the cockpit's
  feature spec.
- The Goal said "human or agent"; the approved proposal narrowed it to humans, enforced by the hook
  (AC-4), as confirmed at approval.

The first use, withdrawing SPEC-0028 (superseded by SPEC-0039), is a human action and is left to
the requester, as the proposal says. No material gap.

## Policy Review

Reviewed against the diff of the SPEC-0040 files (tasks.md lists them). The working tree also
holds uncommitted work of earlier, finished tickets; not judged here.

| Policy | Title | Result | Notes |
|---|---|---|---|
| P-01 | Contracts live only in oms-contracts | N/A | No contract change |
| P-02 | Specification before code, generated models only | N/A | No API or message change |
| P-03 | Never edit generated code | N/A | None involved |
| P-04 | Contracts evolve compatibly | N/A | No contract; the CLI JSON gains optional keys only |
| P-05 | Every state change is recorded in the event log | N/A | No order state; the ticket log records the withdrawal |
| P-06 | Kafka only through the transactional outbox | N/A | No messaging |
| P-07 | Schema changes through new Liquibase changesets | N/A | No database |
| P-08 | Concurrency and idempotency are explicit | N/A | Single-user CLI; a second withdraw is refused (already archived) |
| P-09 | Commands and queries stay separate | N/A | Not the OMS API |
| P-10 | State transitions go through the state machine and task pipeline | N/A | Not the OMS state machine |
| P-11 | Layering and conventions | PASS | `cmdWithdraw` beside `cmdBlock`/`cmdArchive` with the archive move shared; the cockpit action follows `block` |
| P-12 | Jackson 3 only | N/A | No Java |
| P-13 | Errors and validation follow the framework specs | PASS | Refusals exit non-zero with a message; the cockpit validates the reason before the CLI |
| P-14 | Test first, every AC proven by an automated test | PASS | Every AC has a test above, red first except the two guards noted |
| P-15 | Observability | N/A | No runtime service; the ticket log records the reason |
| P-16 | Security | PASS | Arguments via argv with `assertNoFlag`; no shell interpolation; agents cannot withdraw (hook) |
| P-17 | Simplicity and dependencies | PASS | One command, one status, shared archive move; no dependency; `spec check` no warnings |
| P-18 | Modules build standalone | PASS | developer-cockpit typecheck and tests in verify |
| P-19 | Documentation follows behaviour | PASS | `specs/README.md`, `developer-cockpit/spec/03-features.md` |

## Independent Review

**Round 1** (2026-11-01 07:13Z), verdict MET. All six findings fixed in T-7, test-first, and
re-verified (07:16Z):

1. **[major] The stage bar showed proposal as current for every withdrawn ticket**
   (`stageIndex` mapped only blocked). Fixed: it uses `withdrawnFrom`.
2. **[minor] After Withdraw… the detail pane closed**, because archived tickets are hidden by
   default, so the ticket never "shows as withdrawn". Fixed: a successful withdraw turns on
   *Show archived*; the detail and the CLI output stay.
3. **[minor] With Show archived on, withdrawn tickets fell under "In progress".** Fixed: archived
   tickets are excluded from that view.
4. **[minor] `spec status` printed `Next: undefined` for a withdrawn ticket.** Fixed:
   `NEXT.withdrawn`.
5. **[minor] A failed archive move could leave a half-withdrawn ticket, and a blank reason was
   accepted.** Fixed: the target is checked before anything is written, an already-withdrawn ticket
   is refused, and a blank reason is a usage error.
6. **[minor] The spec-run skill did not say that agents block instead of withdrawing.** Fixed; its
   wait section also names withdrawal.

The reviewer also rated AC-2 and AC-5 as weak (messages not checked for unknown/archived; the
"shows as withdrawn" step untested); both are covered by the T-7 tests above.

## Automated Evidence

`evidence/last-run.json`, ran 2026-11-01T07:16:50Z, result **pass**, fingerprint
`6554ba3d9439bf4d`. Policy check: PASS, no errors, no warnings.

| Module | Command | Exit | Log |
|---|---|---|---|
| developer-cockpit | `npm run typecheck` | 0 | evidence/developer-cockpit-1.log |
| developer-cockpit | `npm test` | 0 (84 files, 506 passed, 2 skipped) | evidence/developer-cockpit-2.log |

The first verify attempt (07:08Z) failed on `SpecTicketsService.test.ts`, which compares the whole
mapped summary and did not yet list the two new fields; updated.

## Follow-ups

- Withdraw SPEC-0028 (superseded by SPEC-0039): `node specs/tools/spec.mjs withdraw SPEC-0028
  "Superseded by SPEC-0039"`, or **Withdraw…** in the cockpit.

## Verdict

Verdict: GOAL MET

All five ACs pass with tests that ran in the final verify run, every review finding is fixed and
re-verified, and the Goal assessment has no material gap (the human-only narrowing was confirmed at
approval).
