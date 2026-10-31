---
name: spec-run
description: Autopilot for the OMS spec workflow. Drive a spec ticket from its current stage through proposal, design, plan, implement and verify to done with minimal supervision, stopping only at human approval gates or when genuinely blocked. Use when the user says "run", "autopilot", "take it to done", "implement SPEC-xxxx end to end".
argument-hint: "<ticket id>"
---

# Autopilot

`spec` means `node specs/tools/spec.mjs`. Ticket: $ARGUMENTS.

## Start

```bash
node specs/tools/spec.mjs autopilot <id> on
node specs/tools/spec.mjs status <id>
```

With autopilot on, two hooks hold you to the process:
- **Stop hook**: if you try to end your turn before the ticket is done, awaiting approval or
  blocked, you are told to continue. If you stop twice without changing anything, autopilot
  switches itself off.
- **PreToolUse hook**: blocks code edits in `oms-*` modules until the plan gate has passed,
  edits to generated code, stray contract folders, `ticket.md`, `evidence/`, the policies or the
  gate config, and running `spec approve`.

## Loop

Repeat until the ticket is `done`, `awaiting` approval, or `blocked`:

1. `spec status <id>` → read the stage.
2. Follow the stage skill fully (read its SKILL.md if it is not loaded):
   | stage | skill |
   |---|---|
   | proposal | spec-propose |
   | design | spec-design |
   | plan | spec-plan |
   | implement | spec-implement |
   | verify | spec-verify |
3. `spec advance <id>`:
   - exit 0: next stage, continue the loop;
   - exit 1: fix the gate errors. After `autopilot.maxGateAttempts` (see `specs/config.json`)
     failed attempts on the *same* errors, block;
   - exit 3: awaiting human approval. Stop and report (below).

## Autonomy rules

- **Decide reversible things yourself.** Naming, internal structure, test layout, and which existing
  pattern to follow: decide and record the decision in design.md. Don't ask.
- **Escalate irreversible or semantic things.** Changes to the goal, money/quantity/state semantics,
  public contract breaks, policy exceptions, data migrations that lose information. These surface
  at an approval gate (open question in the proposal, or `exception` in the design), or you block.
- **Never weaken the gates.** Don't delete ACs to pass verification, mark FAIL as PASS, change
  policies or rules, skip tests, or tick tasks whose verify did not pass. If a gate seems wrong,
  block and say why.
- **Go back rather than drift.** If implementation contradicts the design, `spec reopen` the
  earlier stage and fix the document first.
- **Block with a useful reason:** what is blocked, what you tried, what decision or resource you
  need. `spec block <id> "<reason>"`, then stop.

## Report when stopping

Whatever the reason (done, awaiting approval, blocked), end with a short report:
- ticket, stage reached, and why you stopped;
- for approval: what to review (file and the key decisions or assumptions) and how to approve:
  in the developer cockpit, or `! node specs/tools/spec.mjs approve <id>`;
- for done: the AC → evidence table summary and follow-ups;
- for blocked: the reason and what would unblock it.

When done, `spec autopilot <id> off`.

## Wait for the human

When stopping for approval or a block, after the report run `spec wait <id>` with the Bash tool's
`run_in_background` and end your turn. Don't poll it; you are re-invoked when it exits, which is
when a human approves, unblocks, reopens or archives the ticket. Then:
- read its output: the new stage and the log lines written meanwhile (approvals, notes with the
  human's decision, the unblock);
- if the ticket is still awaiting or blocked (the wait was interrupted), start the wait again;
- otherwise continue the loop from `spec status <id>`, taking any note as the decision you asked for.

If the user types `/spec-run <id>` while a wait is running, stop that wait and carry on.
