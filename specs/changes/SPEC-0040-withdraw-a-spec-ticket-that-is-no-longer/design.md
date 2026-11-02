# Design — SPEC-0040: Withdraw a spec ticket that is no longer needed

> **Stage 2 of 3 — how.** Concrete enough that the plan can be written without re-reading the
> code, and checked line by line against the architecture policies. Write "None — <reason>" for a
> section that genuinely does not apply.

## Context

**`specs/tools/spec.mjs`:**
- `STAGES` is `proposal … done`, plus `blocked`, which keeps `blocked_from`.
- `cmdArchive` refuses anything not `done`. It deletes the evidence logs and `.autopilot.json`,
  switches autopilot off, logs `archived`, and moves the folder to `specs/archive`.
- `activeTickets()` reads `specs/changes` only. The gates, `spec ci`, `hookStop` and `hookPreTool`
  use it, so archived tickets are already outside the workflow.
- `resolveTicket(ref, { includeArchive })` includes the archive only for `status`.
- `cmdList` prints `archived` as the status of every archived ticket (plain), and `meta` as is
  (`--json`).
- `hookPreTool` denies any Bash command matching `/spec\.mjs["']?\s+approve\b/`.

**Developer cockpit:**
- `SpecTicketsService` runs the CLI and maps `meta` to `SpecTicketSummary` (`status`,
  `blockedFrom`, `blockedReason`, `archived`).
- Actions are validated in an `ACTION_KINDS` switch that builds the argv (e.g. `block` with a
  reason).
- `SpecTicketStatus = SpecStage | 'blocked'` (`src/shared/types/specTickets.ts`).
- `StageProgress` shows an `archived` badge for archived tickets.
- `TicketActions` returns early for archived tickets, and offers Block… / Note… / Reopen… through
  one prompt dialog with a text field.
- The dashboard (`spec-tickets.ts`: KPIs, distribution, signals) filters `!t.archived`.

**Tests:** `test/main/spec-cli-draft.test.ts` runs `spec.mjs` in a copied fixture workspace
(`test/fixtures/workspace.ts`) with `spawnSync`. `SpecTicketsService.actions.test.ts` checks action
argv. `TicketActions.test.tsx` and `TicketDetail.test.tsx` cover the UI.

**Closest examples:** `cmdBlock` / `cmdArchive` (CLI), the `approve` rule in `hookPreTool`, the
`block` action and prompt (cockpit).

## Approach

**CLI (`spec.mjs`):**

- `cmdWithdraw(t, reason)`, dispatched as `case 'withdraw': return cmdWithdraw(ticket(), args.slice(1).join(' '))`:
  1. refuse if `!reason` (usage), if `t.archived` ("already archived"), or if status is `done`
     ("done; archive it instead"); an unknown id already fails in `resolveTicket`;
  2. `withdrawn_from` = `blocked_from` for a blocked ticket, else the status;
  3. set `status: withdrawn`, `withdrawn_from`, `withdrawn_reason` (one line), `awaiting: ''`,
     `autopilot: false`, clear `blocked_from`/`blocked_reason`;
  4. `logTo(t, 'withdrawn: ' + reason)`, `saveTicket`;
  5. the archive move, shared with `cmdArchive` through a new `moveToArchive(t)` (evidence logs,
     `.autopilot.json`, rename). `cmdArchive` keeps its `done` check and its `archived` log line.
- `cmdList` plain: an archived ticket shows `withdrawn` when its status is `withdrawn`, else
  `archived`. JSON is unchanged: `meta` already carries the new fields.
- `cmdStatus`: the status line appends `— withdrawn from <stage>: <reason>` for a withdrawn ticket.
- `hookPreTool`: the approve rule becomes `/spec\.mjs["']?\s+(approve|withdraw)\b/`, with a message
  naming the command ("Approving and withdrawing are the requester's decisions…").
- `HELP` lists `withdraw <id> "<reason>"`.

**Cockpit:**

- `SpecTicketStatus = SpecStage | 'blocked' | 'withdrawn'`.
- `SpecTicketSummary` gains `withdrawnFrom` and `withdrawnReason`, mapped from `withdrawn_from` and
  `withdrawn_reason`.
- `SpecTicketsService`: `ACTION_KINDS` gains `withdraw`, and its case requires a reason
  (`assertText`, `assertNoFlag`) and returns `{ argv: ['withdraw', a.id, a.reason] }`. The action
  type in the shared IPC types gains `{ kind: 'withdraw'; id; reason }`.
- `StageProgress`: an archived withdrawn ticket shows a `withdrawn` badge, with the reason as its
  title, instead of `archived`.
- `TicketDetail`: under the badge, the reason line, like the blocked reason.
- `TicketActions`: a `withdraw` prompt next to `block`. **Withdraw…** is offered for active,
  not-done tickets, and its confirm button is disabled while the reason is empty (the dialog
  already does this for `block`).
- The dashboard needs no change: withdrawn tickets are archived, so they are already excluded.

## Contract Changes

None — no OpenAPI or Avro change. The CLI gains a command and the ticket front matter two
optional keys, both internal to the workflow tooling.

## Data & Persistence

None — no database. Ticket front matter: `status: withdrawn`, `withdrawn_from`,
`withdrawn_reason` on withdrawn tickets only; existing tickets are untouched.

## Events & Messaging

None — no messages.

## Domain, State & Orchestration

The ticket lifecycle gains a terminal state:
- reached from any stage before `done`, including `blocked` and awaiting approval;
- the ticket leaves `specs/changes`;
- it has no further transitions (un-withdraw is out of scope).

No OMS state machine is touched.

## Alternatives & Decisions

- **Withdraw archives immediately.** Rejected: keeping it in `specs/changes` with a status every
  consumer then has to filter (gates, ci, hooks, cockpit KPIs).
- **Human-only, hook-enforced** (confirmed at proposal approval). Rejected: agent-allowed
  (withdrawing changes scope).
- **Share the archive move with `cmdArchive`** rather than duplicate it.
- **Implementation of `spec.mjs` under the autopilot guard:** the PreToolUse hook blocks edits to
  `specs/tools/` while any ticket is on autopilot, including this one. The plan puts the
  `spec.mjs` tasks first, and the run blocks there for the requester's decision (proposal, Open
  Questions); the guard is not changed or bypassed.
- No new dependency (P-17).

## Risks & Mitigations

| Risk | Mitigation |
|---|---|
| Someone withdraws the wrong ticket | Human-only; the reason is required; the ticket and its history stay in the archive and can be moved back by hand |
| A cockpit view treats `withdrawn` as an unknown status | The type includes it; views over active tickets never see it; `StageProgress` and `TicketDetail` handle it explicitly; tests cover both |
| The hook regex also matches a harmless command containing "withdraw" | It matches only `spec.mjs` followed by `withdraw` as the subcommand, like `approve` |

## Test Strategy

| AC | Level | Test class#method | What it asserts |
|---|---|---|---|
| AC-1 | CLI (fixture workspace) | `developer-cockpit/test/main/spec-cli-withdraw.test.ts` › `withdraws a ticket at any stage before done` (proposal, implement, blocked, awaiting approval) (new) | Exit 0; the folder moves to `specs/archive`; front matter `status: withdrawn`, `withdrawn_from` (the blocked-from stage for a blocked ticket), `withdrawn_reason`, `awaiting` empty, `autopilot: false`; log line `withdrawn: <reason>` |
| AC-2 | CLI | `spec-cli-withdraw.test.ts` › `refuses without a reason, for done, unknown or archived tickets` (new) | Non-zero exit with the reason in stderr; ticket files byte-identical before and after |
| AC-3 | CLI | `spec-cli-withdraw.test.ts` › `a withdrawn ticket leaves the active views and ci` (new) | `list` omits it; `list --all` shows `withdrawn` (plain) and `meta.status: withdrawn` (`--json`); `status` shows the reason; `ci` passes although the ticket's proposal is an unfilled template |
| AC-4 | CLI (hook) | `spec-cli-withdraw.test.ts` › `the pre-tool hook denies withdraw like approve` (new: pipes a Bash `tool_input` to `spec.mjs hook pre-tool`) | Deny decision with the requester message for `withdraw`; `list` is still allowed |
| AC-5 | unit (renderer, main) | `SpecTicketsService.actions.test.ts` › `withdraw requires a reason and runs spec withdraw` (new); `TicketActions.test.tsx` › `Withdraw… asks for a reason and runs the action; not offered when done or archived` (new); `TicketDetail.test.tsx` › `a withdrawn ticket shows the withdrawn badge and reason` (new); `spec-tickets-kpis.test.ts` › `withdrawn tickets are not counted` (new) | argv; dialog behaviour and disabled confirm; badge and reason; KPIs and distribution exclude it |

## Policy Compliance

| Policy | Title | Status | How / Justification |
|---|---|---|---|
| P-01 | Contracts live only in oms-contracts | n/a | No contract change |
| P-02 | Specification before code, generated models only | n/a | No API or message change |
| P-03 | Never edit generated code | n/a | No generated code involved |
| P-04 | Contracts evolve compatibly | n/a | No contract; the CLI JSON only gains optional keys |
| P-05 | Every state change is recorded in the event log | n/a | No order state; the ticket log records the withdrawal |
| P-06 | Kafka only through the transactional outbox | n/a | No messaging |
| P-07 | Schema changes through new Liquibase changesets | n/a | No database |
| P-08 | Concurrency and idempotency are explicit | n/a | Single-user CLI; a second withdraw is refused (already archived) |
| P-09 | Commands and queries stay separate | n/a | Not the OMS API |
| P-10 | State transitions go through the state machine and task pipeline | n/a | Not the OMS state machine |
| P-11 | Layering and conventions | comply | Follows the existing CLI command and cockpit action patterns |
| P-12 | Jackson 3 only | n/a | No Java |
| P-13 | Errors and validation follow the framework specs | comply | CLI refusals exit non-zero with a message; the cockpit validates the reason as it does for block |
| P-14 | Test first, every acceptance criterion is proven by an automated test | comply | Every AC has a named test above, written red first |
| P-15 | Observability | n/a | Ticket log line records who/why via the reason; no runtime service |
| P-16 | Security | comply | Arguments go through the existing argv path (`assertNoFlag`), no shell interpolation |
| P-17 | Simplicity and dependencies | comply | One command, one status, shared archive move; no dependency |
| P-18 | Modules build standalone | comply | developer-cockpit typecheck and tests run in verify |
| P-19 | Documentation follows behaviour | comply | `specs/README.md` and the cockpit's feature spec |

## Knowledge Base Updates

- `specs/README.md`: the `withdrawn` state, `spec withdraw`, human-only, archived immediately.
- `developer-cockpit/spec/03-features.md` (spec tickets section): the Withdraw… action and the
  withdrawn badge.
- No `oms-knowledge-base` page describes the spec workflow; none changes.
