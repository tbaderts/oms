---
id: SPEC-0040
title: Withdraw a spec ticket that is no longer needed
type: chore
status: done
awaiting:
autopilot: false
modules: [developer-cockpit, oms-knowledge-base]
approvals: [proposal]
owner: Toni Badertscher
created: 2026-11-01
blocked_from:
blocked_reason:
---

# SPEC-0040 — Withdraw a spec ticket that is no longer needed

<!-- This file belongs to the requester and the spec CLI. Agents change state only through
     `node specs/tools/spec.mjs …`; the hooks block direct edits. -->

## Goal

The spec workflow has no way to close a ticket that will not be implemented (superseded by another ticket, merged, or dropped): archive only accepts done tickets, so the only options are blocking it forever or deleting its folder. Add a withdrawn state: a 'spec withdraw <id> "<reason>"' command (human or agent, any stage before done) that records the reason in the ticket log, marks the ticket withdrawn, and archives it, so it leaves the active list but keeps its history; withdrawn tickets are excluded from gates, the Stop hook and 'spec ci'. The developer cockpit shows withdrawn tickets distinctly (list, dashboard, stage donut) and offers the action with a required reason. Update specs/README.md and the spec-workflow pages. First use: SPEC-0028, superseded by SPEC-0039.

## Log

- 2026-11-01 created
- 2026-11-01 06:44 — autopilot on
- 2026-11-01 06:45 — proposal gate passed; awaiting human approval
- 2026-11-01 06:54 — proposal approved by Toni Badertscher
- 2026-11-01 06:54 — proposal → design
- 2026-11-01 06:55 — design → plan
- 2026-11-01 06:55 — plan → implement
- 2026-11-01 06:59 — blocked: T-5 needs your decision: it edits specs/tools/spec.mjs, which the PreToolUse hook blocks while any ticket is on autopilot (this one), by design. T-1 to T-4 are done: CLI tests written (red until T-5), cockpit service, UI and docs green. Options: A) switch autopilot off for SPEC-0040 (cockpit switch or 'spec autopilot SPEC-0040 off') and unblock; I then implement T-5 and finish the ticket in this session without autopilot. B) edit spec.mjs yourself to the design (cmdWithdraw, moveToArchive, list/status output, hook rule, HELP) and unblock; I verify. Add a note naming A or B.
- 2026-11-01 07:06 — autopilot off
- 2026-11-01 07:06 — unblocked → implement
- 2026-11-01 07:08 — verify run: fail
- 2026-11-01 07:10 — verify run: pass
- 2026-11-01 07:10 — implement → verify
- 2026-11-01 07:13 — reopened at implement: Review: withdrawn tickets show proposal as current stage (stageIndex); detail closes after withdraw; withdrawn tickets fall under In progress with Show archived; status prints Next: undefined; withdraw not robust if the archive move fails, blank reason accepted; spec-run skill lacks the withdrawal rule; AC-2 messages untested.
- 2026-11-01 07:16 — verify run: pass
- 2026-11-01 07:17 — implement → verify
- 2026-11-01 07:17 — verify → done
