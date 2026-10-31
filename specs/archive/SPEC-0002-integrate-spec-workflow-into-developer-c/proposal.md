# Proposal — SPEC-0002: Integrate spec workflow into developer cockpit

> **Stage 1 of 3 — why and what, not how.** The acceptance criteria below are the contract that
> the verify stage checks. If they are vague, the goal cannot be proven met.

## Why

The spec-driven workflow (`specs/README.md`, `specs/tools/spec.mjs`) is now how non-trivial OMS
work is delivered, but it can only be used from a terminal or Claude Code. A developer who wants to
know "which tickets are mine, where is each one, what is blocking it, what is waiting for my
approval" has to run `spec list` and `spec status <id>` ticket by ticket and read the Markdown by
hand. Nobody has an overview across tickets.

developer-cockpit is meant to be the workbench for this (`developer-cockpit/spec/01-vision.md`), and
its spec already describes a spec dashboard (`developer-cockpit/spec/03-features.md` §1). That
description predates the workflow, though. It assumes `<module>/specs/` folders, `ticket_id` /
`category` front-matter and a status derived from which files exist. None of that matches
`specs/changes/SPEC-NNNN-*/ticket.md`, its six stages, its gates and its approvals. The cockpit
today has no spec-ticket feature at all: `SpecsService` covers only OpenAPI/Avro files, the
Dashboard is a set of quick-link cards, and `WatcherService` does not watch `specs/`.

If we do nothing, the workflow stays invisible outside the terminal. Tickets that are awaiting
approval or blocked get noticed late, and the cockpit's own spec stays wrong about the process it is
supposed to support.

Requester goal (ticket.md): *"…integrate the new spec-driven process and let user look at their
tickets, see progress and have a dashboard overview of all of it."*

## What Changes

- New **Spec Tickets** view in the cockpit (sidebar group *Development*):
  - a ticket list of active and, optionally, archived tickets, showing id, title, type, stage, owner,
    modules, task progress, and awaiting/blocked/autopilot flags;
  - a **My tickets** filter (default) that matches `owner` to the local `git config user.name`, with
    an **All tickets** toggle, plus stage, module and free-text filters;
  - a ticket detail panel with the Goal, a stage progress indicator, the current gate result
    (errors and warnings), rendered `proposal.md` / `design.md` / `tasks.md` / `verification.md`,
    AC and task traceability, the latest verification evidence (pass/fail, time, fresh or stale) and
    the ticket log.
- **Workflow actions** from the detail panel: create ticket, advance, approve, reopen, block,
  unblock, add note and autopilot on/off. Each one runs `node specs/tools/spec.mjs` and shows its
  output, so the cockpit applies exactly the same gates and rules as the CLI. **Approve** needs an
  explicit confirmation and is recorded with `--by <git user.name>`.
- The **Dashboard** keeps its quick links and gets a spec-workflow overview at the top: ticket counts
  per stage, *awaiting approval* and *blocked* lists (mine first), and aggregate task completion.
  Clicking an item opens it in the Spec Tickets view.
- **Live updates:** changes under `specs/changes/` and `specs/archive/`, whether from the CLI, Claude
  Code or the cockpit, refresh the list, the detail panel and the Dashboard without a manual reload.
- developer-cockpit gets a test runner (Vitest, `npm test`). Its verify command in
  `specs/config.json` becomes `npm run typecheck` + `npm test`.
- `node specs/tools/spec.mjs` gains machine-readable output (`--json`) for the read commands the
  cockpit needs, so the cockpit does not re-implement gate logic. The existing text output does not
  change.
- No change to any OMS service, contract, database or Kafka topic. Nothing is **BREAKING**.

## Scope

### In scope

- Reading tickets from `specs/changes/` and `specs/archive/` of the configured workspace root.
- The Spec Tickets view, the Dashboard overview and the live refresh described above.
- The workflow actions listed above, all routed through `spec.mjs`.
- Additive `--json` output on the `spec.mjs` read commands.
- Vitest setup for developer-cockpit and tests for every AC.
- Updating `developer-cockpit/spec/03-features.md` §1 (and the data-model/backend-service pages it
  touches) to describe the real workflow.

### Out of scope

- Editing `ticket.md`, `proposal.md`, `design.md`, `tasks.md` or `verification.md` content in the
  cockpit. Documents are read-only here; authoring stays in the editor and Claude Code.
- Running `spec verify` (module builds) or `spec archive` from the cockpit. Both are long-running
  and side-effecting; deferred.
- Starting or steering Claude Code sessions (`/spec-run` etc.) from the cockpit.
- Letting the cockpit's AI Assistant, or any WebSocket client, trigger workflow actions.
- Beads integration beyond showing the `beads` id if one is set.
- Charts beyond simple counts and progress bars, multi-repository support, notifications outside
  the app.
- Changing the workflow itself (stages, gates, policies, approval rules).

## Acceptance Criteria

- **AC-1** — Given a workspace with tickets in `specs/changes/` and `specs/archive/`, when the cockpit
  loads the ticket list, then it returns one entry per ticket whose id, title, type, status, owner,
  modules, awaiting, blocked reason, autopilot and archived flag equal the ticket's `ticket.md`
  front-matter, and archived tickets are included only when "show archived" is on.
- **AC-2** — Given a ticket with a `tasks.md` in which 3 of 5 `**T-n**` tasks are ticked and a
  proposal with 4 `**AC-n**` criteria, when its progress is loaded, then the cockpit reports stage
  index and name, tasks 3/5, ACs 4, and a current-stage gate result (pass/fail, errors, warnings)
  identical to what `node specs/tools/spec.mjs gate <id>` reports for the same ticket.
- **AC-3** — Given `git config user.name` is "Alice" and tickets owned by "Alice" and "Bob", when the
  Spec Tickets view opens, then only Alice's tickets are listed. When "All tickets" is selected, both
  are listed. When no git user is configured, all tickets are listed by default.
- **AC-4** — Given a fixture of tickets at known stages (some awaiting approval, some blocked, with
  known task counts), when the Dashboard renders, then the per-stage counts, the awaiting-approval
  list, the blocked list and the aggregate task-completion percentage equal the values computed from
  the fixture, and clicking a listed ticket opens it in the Spec Tickets view.
- **AC-5** — Given a ticket is selected, when its detail panel renders, then it shows the Goal, the
  rendered content of each existing stage document, the log entries from `ticket.md`, and, if
  `evidence/last-run.json` exists, its result, timestamp and whether it is fresh or stale as
  `spec gate` would judge it.
- **AC-6** — Given the cockpit is open, when a ticket file under `specs/changes/` or `specs/archive/`
  is created, changed or removed outside the cockpit (e.g. by the CLI), then the list, the open detail
  panel and the Dashboard show the new state within 2 seconds without user action.
- **AC-7** — Given a ticket whose current gate fails, when the user clicks **Advance**, then the
  ticket stays at its stage and the gate errors are shown. Given its gate passes, the ticket moves
  to the next stage, or to "awaiting approval" if that stage requires approval. In both cases the
  cockpit shows the CLI's output and exit code. The same holds for new ticket, reopen, block,
  unblock, note and autopilot: each produces the same `ticket.md` change as the equivalent CLI
  command, and invalid input (e.g. reopen to a later stage, block without a reason) is rejected with
  the CLI's error and no file change.
- **AC-8** — Given a ticket awaiting approval, when the user clicks **Approve**, then a confirmation
  naming the ticket and stage is shown. On cancel, `ticket.md` is unchanged. On confirm, the stage is
  added to `approvals`, the log records "approved by <git user.name>" and the ticket advances as with
  `spec approve`. Given a ticket that is not awaiting approval, the Approve action is not available.
- **AC-9** — Given the cockpit is running, when a WebSocket client connects to the cockpit's event
  server or the AI Assistant is used, then no message or tool exposed there can run a workflow action;
  actions are reachable only through the renderer's IPC API.
- **AC-10** — Given a ticket folder whose `ticket.md` is missing or has unparseable front-matter, when
  the list loads, then that folder appears as an error entry naming the problem and every other
  ticket still loads.
- **AC-11** — Given 50 tickets, when the ticket list and Dashboard load (without per-ticket gate
  evaluation), then the data is returned in under 1 second, measured in a test against a generated
  50-ticket fixture.

## Impact

| Area | Impact |
|---|---|
| Modules | developer-cockpit (Electron main, shared types, renderer). Also `specs/tools/spec.mjs` (additive `--json`) and `specs/config.json` (cockpit verify command), which are tooling, not modules. |
| Contracts (OpenAPI / Avro) | none |
| Data (tables, migrations) | none; the source of truth stays the files in `specs/` |
| Events / Kafka topics | none. New in-app cockpit event `specs:tickets-changed` on the existing renderer event bus/WebSocket broadcast (outbound only). |
| Consumers (oms-ui, oms-mcp-server, downstream) | none. The `spec.mjs` text output, exit codes and hooks are unchanged, so Claude Code skills and CI (`spec-gates.yml`) are unaffected. |
| Knowledge base | `developer-cockpit/spec/03-features.md` §1 Dashboard (rewrite for the real workflow), `04-backend-services.md` and `05-data-model.md` (spec ticket service and types), `specs/README.md` (mention the cockpit and `--json`). |

## Open Questions

- [resolved] Read-only or full control? → Full control including approve (requester decision,
  2026-10-24). Approve keeps a confirmation step and records the git user. Agents still cannot
  approve: the CLI hook blocks them, and AC-9 keeps the cockpit's AI and WebSocket surfaces from
  reaching actions.
- [resolved] What are "their tickets"? → `owner` in `ticket.md` equals local `git config user.name`;
  "All tickets" toggle available (requester decision).
- [resolved] Replace the Dashboard? → No. Add the spec overview to the existing Dashboard and add a
  dedicated Spec Tickets view (requester decision).
- [resolved] Test runner? → Add Vitest; verify becomes typecheck + `npm test` (requester decision).
- [resolved] Re-implement the parsing and gate logic in TypeScript, or call the CLI? → assumption:
  call `spec.mjs` (with new `--json` output) for gate results and all actions, so there is one
  implementation of the rules. Plain front-matter and Markdown reading for the list may be done in
  the cockpit if needed for AC-11. Final choice in design.
- [deferred] Running `spec verify` / `spec archive` from the cockpit → long-running builds and
  folder moves need progress streaming and cancellation; safe to defer because the CLI covers them
  and the cockpit shows their results (AC-5, AC-6).
