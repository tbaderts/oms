# Proposal — SPEC-0004: Edit spec ticket documents in the cockpit

> **Stage 1 of 3 — why and what, not how.** The acceptance criteria below are the contract that
> the verify stage checks. If they are vague, the goal cannot be proven met.

## Why

SPEC-0002 brought the spec workflow into developer-cockpit: a Spec Tickets view, a Dashboard
overview, live refresh and the workflow actions (advance, approve, reopen, …). It deliberately left
the stage documents read-only ("Editing `ticket.md`, `proposal.md`, `design.md`, `tasks.md` or
`verification.md` content in the cockpit" is out of scope in SPEC-0002's proposal). The detail panel
today renders `proposal.md`, `design.md`, `tasks.md` and `verification.md` with `MarkdownContent`,
and that is all it can do with them.

So a developer who sees in the cockpit that a gate fails ("section `## Why` is empty", "no task
covers AC-3") has to switch to an editor, find the file under `specs/changes/SPEC-NNNN-*/`, fix it,
save, and come back to see whether the gate now passes. The same loop applies to ticking a task
during implementation. The cockpit shows the problem but cannot be used to fix it, and gate
feedback only arrives after a save plus a refresh.

Requester goal (ticket.md): *"Continue work on developer-cockpit and add more functionality around
spec-driven development. Chosen direction: a ticket document editor - edit
proposal/design/tasks/verification.md inside the cockpit with a live gate check (lint as you type),
and tick tasks."*

If we do nothing, the cockpit stays a viewer for the workflow, and the fix-and-check loop for gate
errors stays split across two tools.

## What Changes

- In the Spec Tickets detail panel, the document of the ticket's **current stage** gets an **Edit**
  mode: a Markdown editor with Save, an unsaved-changes indicator and Ctrl/Cmd+S. The stage → document
  mapping is the CLI's: proposal → `proposal.md`, design → `design.md`, plan and implement →
  `tasks.md`, verify → `verification.md`; a blocked ticket uses its `blocked_from` stage.
  Documents of other stages stay read-only, with a hint that changing an earlier stage means
  **Reopen**.
- **Live gate check while editing:** after typing pauses, the current stage's gate runs against the
  unsaved text and the gate panel shows its errors and warnings, labelled as a *draft* result. The
  result comes from `spec.mjs`, the single implementation of the gate rules, not from a second
  implementation in TypeScript.
- **Tick tasks:** at the implement stage, each task in the traceability list has a checkbox. Toggling
  it rewrites only that task's `[ ]`/`[x]` marker in `tasks.md`.
- **Conflict safety:** a save or tick based on content that has since changed on disk (CLI, Claude
  Code, another editor) is refused, and the user can reload or overwrite. An open document with no
  unsaved edits follows changes on disk automatically (existing live refresh).
- **Unsaved-edit guards:** switching ticket, document or view with unsaved edits asks for
  confirmation. Advance and Approve are disabled while the current document has unsaved edits, because
  they act on the saved file.
- `node specs/tools/spec.mjs gate` gains an additive draft option: the gate runs as if one stage
  document had the content given on stdin, without writing it. Existing text output, exit codes,
  hooks and JSON shapes do not change.
- No change to any OMS service, contract, database or Kafka topic. Nothing is **BREAKING**.

## Scope

### In scope

- Editing the current stage's document of an active (not archived, not done) ticket in the Spec
  Tickets view, saving it, and the live draft gate check.
- Ticking/unticking tasks at the implement stage.
- Conflict detection on save/tick, and unsaved-edit guards.
- The additive draft-gate option in `spec.mjs` and its `--json` output.
- Tests for every AC (Vitest, as set up by SPEC-0002).
- Updating `developer-cockpit/spec/03-features.md` §1, `04-backend-services.md`, `05-data-model.md`
  and `specs/README.md` (draft gate option).

### Out of scope

- Editing `ticket.md` (Goal, front-matter, log). It stays owned by the requester and the CLI; state
  changes keep going through the existing workflow actions.
- Editing `evidence/`, documents of archived or done tickets, and documents of stages other than the
  current one (use Reopen first).
- Creating or deleting documents; `spec new` already creates all four from the templates.
- AI-assisted drafting, collaborative or multi-user editing, edit history beyond git.
- Running `spec verify` / `spec archive`, or launching Claude Code, from the cockpit.
- Fixing the Specs Editor / Domain Model / Code Generator paths that still point at
  `oms-core/src/main/{openapi,avro}` (separate fix).
- Changing the workflow itself (stages, gates, rules, policies).

## Acceptance Criteria

- **AC-1** — Given an active ticket at stage S (or blocked from S), when its detail panel renders,
  then exactly the document mapped to S (proposal → proposal.md, design → design.md, plan/implement →
  tasks.md, verify → verification.md) offers Edit, and the other documents offer no Edit; given an
  archived or done ticket, then no document offers Edit.
- **AC-2** — Given the current document is open in Edit mode, when the user changes the text and
  saves (button or Ctrl/Cmd+S), then the file on disk contains exactly the edited text, the
  unsaved-changes indicator clears, and the gate panel shows the result of the saved file.
- **AC-3** — Given the current document is open in Edit mode with unsaved text, when typing pauses for
  the debounce interval, then within 2 seconds the gate panel shows a result marked as draft whose
  pass flag, errors and warnings equal what `node specs/tools/spec.mjs gate <id> --json` reports after
  writing that same text to the file, and the file on disk is unchanged.
- **AC-4** — Given a save request, when the target is `ticket.md`, a file under `evidence/`, a path
  outside the ticket folder (including `..` traversal), a document not mapped to the ticket's current
  stage, or a document of an archived or done ticket, then the main process rejects it with an error
  and no file is written.
- **AC-5** — Given a ticket at the implement stage with task T-n unticked, when the user ticks T-n,
  then in `tasks.md` only T-n's marker changes from `[ ]` to `[x]` (every other byte unchanged), and the
  ticket's task progress increases by one; unticking reverses it. Given a ticket not at the implement
  stage, then the task list offers no checkboxes and a tick request is rejected by the main process.
- **AC-6** — Given a document was loaded for editing with content A, when the file on disk changes to
  B (outside the cockpit) and the user then saves or ticks, then nothing is written, a conflict is
  shown, and the user can either reload B (dropping the edits) or overwrite with their text. Given the
  same document is open with no unsaved edits, when the file changes on disk, then the editor shows B
  within 2 seconds without user action.
- **AC-7** — Given unsaved edits, when the user selects another ticket, another document or another
  view, then a confirmation is shown, and on cancel the edits and the selection stay; and while there
  are unsaved edits, Advance and Approve are disabled.
- **AC-8** — Given the new draft option of `spec.mjs gate`, when it is run with a document's content
  on stdin, then its JSON result equals the result of `spec gate --json` with that content written to
  the file, no file is written, and `spec gate`, `status`, `list` and `advance` without the option
  produce byte-identical output and exit codes as before.

## Impact

| Area | Impact |
|---|---|
| Modules | developer-cockpit (Electron main, preload/IPC, shared types, renderer). Also `specs/tools/spec.mjs` (additive draft-gate option), which is tooling, not a module. |
| Contracts (OpenAPI / Avro) | none |
| Data (tables, migrations) | none; the documents in `specs/` stay the source of truth |
| Events / Kafka topics | none. Reuses the in-app `specs:tickets-changed` event from SPEC-0002. |
| Consumers (oms-ui, oms-mcp-server, downstream) | none. `spec.mjs` behaviour without the new option is unchanged, so Claude Code skills, hooks and CI (`spec-gates.yml`) are unaffected. |
| Knowledge base | `developer-cockpit/spec/03-features.md` §1 (editing, live gate, ticking), `04-backend-services.md` and `05-data-model.md` (write/draft-gate service and types), `specs/README.md` (draft gate option). |

## Open Questions

- [resolved] Which documents are editable? → assumption: only the current stage's document of an
  active ticket. Editing an already passed or approved stage silently would bypass its gate and
  approval; the workflow's answer to that is Reopen. Easy to relax later.
- [resolved] Should live feedback re-implement the gate rules in TypeScript? → assumption: no. As in
  SPEC-0002, `spec.mjs` stays the only implementation; it gets an additive option to gate a draft
  read from stdin (AC-8).
- [resolved] Changing `specs/tools/spec.mjs` while this ticket runs on autopilot → the PreToolUse hook
  blocks edits under `specs/tools/` while any ticket is on autopilot. assumption: the implement stage
  switches autopilot off for the `spec.mjs` task (an additive change covered by AC-8 and reviewed at
  verify), then back on. **The approver should confirm this**, or say they will make that change
  themselves.
- [resolved] Editor component → assumption: reuse Monaco (`@monaco-editor/react`, already used by
  the Specs Editor) in Markdown mode, with the existing rendered view as the read mode.
- [resolved] What may a human tick? → any task, at the implement stage. The "only tick when its verify
  passes" rule binds agents; the cockpit does not second-guess the human, and the verify gate still
  requires all tasks ticked plus fresh evidence.
- [deferred] Editing earlier-stage documents without Reopen, and editing `ticket.md` fields (goal,
  owner) → safe to defer: Reopen and the CLI (`spec set`) cover them today.
