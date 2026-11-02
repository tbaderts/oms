# Proposal — SPEC-0040: Withdraw a spec ticket that is no longer needed

> **Stage 1 of 3 — why and what, not how.** The acceptance criteria below are the contract that
> the verify stage checks. If they are vague, the goal cannot be proven met.

## Why

The spec workflow can take a ticket to `done`, block it, or reopen it, but it cannot close a ticket
that will not be implemented ([ticket Goal](./ticket.md)). `spec archive` accepts only `done`
tickets. A ticket that another one superseded, that was merged into another, or that was dropped
has two ways out today:

- **Block it forever.** It then shows as blocked in `spec list` and on the cockpit's dashboard, and
  counts towards "blocked" in the KPIs and signals, though nothing is waiting on anyone.
- **Delete its folder.** The record that the work was considered, and why it was not done, is lost.

The case is real now: SPEC-0028 (decimals in `Order.avsc`) was fully superseded by SPEC-0039. Its
log says so, but it still sits at `proposal` among the active tickets. Roadmap tickets that merge
and review findings that overlap make this recur.

## What Changes

- **A `withdrawn` state** for tickets, next to the stages and `blocked`.
- **`spec withdraw <id> "<reason>"`.** For a ticket at any stage before `done`, including blocked
  or awaiting approval, it:
  - records the reason in the ticket log;
  - sets the status to `withdrawn` and keeps the stage it was withdrawn from;
  - clears `awaiting` and switches autopilot off;
  - moves the ticket to `specs/archive`, like `spec archive`.
  The ticket leaves the active list but keeps its documents and history.
- **Withdrawn tickets take no part in the workflow:** gates, `spec ci`, the Stop hook and the
  PreToolUse hook only consider active tickets. `spec list --all` and `spec status <id>` still show
  them, with the reason.
- **Withdrawing is a human decision**, like approving. The PreToolUse hook denies `spec withdraw`
  when an agent runs it (see Open Questions).
- **Developer cockpit:**
  - a withdrawn ticket shows a `withdrawn` badge with its reason, instead of `archived`;
  - an active ticket that is not done offers **Withdraw…**, which asks for a required reason.
  Withdrawn tickets are archived, so the KPIs, the stage donut and the signals already leave them
  out.
- **Documentation:** `specs/README.md` and the knowledge-base pages that describe the spec workflow
  explain the state.
- No **BREAKING** change: a new status value and a new command; existing tickets are unaffected.

## Scope

### In scope

- The command, the status, the archive move, and the hook rule in `specs/tools/spec.mjs`.
- `spec list` / `spec status` output, plain and `--json`.
- Cockpit: the status type, the badge, and the Withdraw action through the existing
  `SpecTicketsService` action path.
- `specs/README.md` and the workflow pages in the knowledge base.

### Out of scope

- Withdrawing SPEC-0028 itself. It is the first use, but a human runs it (AC-4), so it happens
  after this ticket is done, not as part of it.
- Un-withdrawing. A withdrawn ticket can be restored by moving its folder back and editing its
  status by hand; a command can follow if it is ever needed.
- Bulk withdrawal and a "superseded by" link field. The reason text carries that.

## Acceptance Criteria

- **AC-1** — Given an active ticket at any stage before `done` (including `blocked` and awaiting
  approval), when a human runs `spec withdraw <id> "<reason>"`, then it exits 0. The ticket's
  folder is now under `specs/archive`, and its `ticket.md` has:
  - status `withdrawn`;
  - `withdrawn_from` set to the stage it was at (the blocked-from stage for a blocked ticket);
  - `withdrawn_reason` set to the reason;
  - `awaiting` empty and `autopilot` off;
  - a log line `withdrawn: <reason>`.
- **AC-2** — Given `spec withdraw` without a reason, or for a `done` ticket, or for an unknown or
  already-archived ticket, when it runs, then it exits non-zero with a message saying why, and no
  ticket changes.
- **AC-3** — Given a withdrawn ticket whose stage gate would fail, when `spec list`, `spec list --all`,
  `spec status <id>` and `spec ci` run, then:
  - `spec list` does not show it;
  - `spec list --all` (plain and `--json`) shows it with status `withdrawn`;
  - `spec status` shows `withdrawn` with the reason;
  - `spec ci` does not check it and passes.
- **AC-4** — Given an agent session, when it runs `spec withdraw …` through the Bash tool, then the
  PreToolUse hook denies it with a message that withdrawing is the requester's decision, as it
  does for `spec approve`.
- **AC-5** — Given the developer cockpit:
  - when it shows a withdrawn ticket, then the ticket carries a `withdrawn` badge (not `archived`)
    and its reason, and the dashboard's KPIs and stage distribution do not count it;
  - when a user picks **Withdraw…** on an active, not-done ticket, enters a reason and confirms,
    then the cockpit runs `spec withdraw <id> "<reason>"`, and the ticket shows as withdrawn;
  - the action is not offered for `done` or archived tickets, and it cannot be confirmed without a
    reason.

## Impact

| Area | Impact |
|---|---|
| Modules | developer-cockpit, oms-knowledge-base (on the ticket); `specs/tools/spec.mjs` and `specs/README.md` (workflow tooling, outside the build modules; the cockpit's tests exercise `spec.mjs` through its fixture workspace) |
| Contracts (OpenAPI / Avro) | None |
| Data (tables, migrations) | None. Ticket front matter gains `withdrawn_from` and `withdrawn_reason` on withdrawn tickets only |
| Events / Kafka topics | None |
| Consumers (oms-ui, oms-mcp-server, downstream) | Developer cockpit (the only consumer of `spec … --json`) |
| Knowledge base | `specs/README.md`; the spec-workflow pages in `oms-knowledge-base` that list the stages and commands |

## Open Questions

- [resolved] Who may withdraw a ticket? → assumption: **only a human**, enforced by the
  PreToolUse hook exactly as for `spec approve`. Withdrawing changes scope (work the requester asked
  for will not be done), which the autonomy rules reserve for the requester; an agent that thinks a
  ticket is obsolete blocks it with that reason instead. **Please confirm at approval.** This
  narrows the ticket Goal's "(human or agent)"; if agents should be allowed, AC-4 is dropped.
- [resolved] Should withdrawing archive the ticket immediately? → assumption: yes, so it leaves
  every active view at once and the hooks ignore it with no special case. Its history stays in
  `specs/archive`.
- [resolved] Can a `done` ticket be withdrawn? → no; it was delivered, and `spec archive` is the
  way to close it.
- [resolved] How does this ticket edit `spec.mjs` when the hooks block edits to `specs/tools/` while
  any ticket is on autopilot? → this run blocks before implementation, and the requester decides
  how to proceed: implement with autopilot off for that step, or hand-edit. The guard itself is not
  weakened.
