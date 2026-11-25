---
type: Methodology
title: "Spec-Driven Development"
description: "How a change goes from intent to verified result in the OMS: spec tickets with proposal, design, plan, implement and verify stages, gates run by specs/tools/spec.mjs, human approvals, autopilot, and where the developer cockpit fits."
tags: [process, spec-driven, workflow, gates, agents]
status: stable
updated: "2026-11-14T12:00:00Z"
sources:
  - resource: "repo:specs/README.md"
  - resource: "repo:specs/config.json"
  - resource: "repo:specs/policies/architecture-policies.md"
  - resource: "repo:specs/tools/spec.mjs"
---
# Spec-Driven Development

Every non-trivial change to the OMS is a **spec ticket** in `specs/changes/`. The ticket fixes the
goal in the requester's words; everything after it is judged against that goal. The full process
is in `specs/README.md`; this page is the overview.

## Stages and gates

| Stage | Document | What it fixes | Gate |
|---|---|---|---|
| Proposal | `proposal.md` | Why, what changes, scope, testable acceptance criteria (AC-n) | Human approval (default) |
| Design | `design.md` | How: contracts, persistence, events, state machine, decisions, test per AC, a ruling on every architecture policy | Automatic, unless a policy exception needs approval |
| Plan | `tasks.md` | Ordered, test-first tasks, each tracing to ACs with its own verify command | Automatic |
| Implement | code + ticked tasks | Red, green, tick only when the task's verify passes | Policy rules on the diff |
| Verify | `verification.md` | Evidence per AC, policy compliance, an independent review, a verdict | Automatic |

`node specs/tools/spec.mjs` runs the gates (`advance`, `verify`, `check`). The
[architecture policies](../architecture/index.md) P-01 to P-19 in
`specs/policies/architecture-policies.md` are what designs and verifications are judged by; their
machine-checkable part is `specs/policies/rules.json`. Only humans approve (`spec approve`).

## Working with agents

- Claude Code skills drive each stage: `/spec-new`, `/spec-propose`, `/spec-design`, `/spec-plan`,
  `/spec-implement`, `/spec-verify`, `/spec-archive`, and `/spec-run` for autopilot.
- Autopilot runs stage after stage and stops at human gates or when blocked; hooks stop it from
  editing code before the plan passes, editing generated code or policies, or approving.
- The [knowledge server](../tools/knowledge-server.md) gives agents the specifications and
  capabilities to design against; designs cite the [capabilities](../capabilities/index.md) and
  update the knowledge base in the same ticket (policy P-19).

## In the developer cockpit

The [Developer Cockpit](../tools/developer-cockpit.md) lists tickets by stage, shows and edits
their documents, runs gates and approvals, and shows the capability catalogue the tickets change.
It is a generic tool with its own repository (SPEC-0076); it finds this workflow through
`specs.cli: specs/tools/spec.mjs` in the repository's `cockpit.yaml` and only calls that CLI, so
the workflow rules stay here.

## Git

Work happens on `main` while there is one maintainer; tickets do not create branches
(`git.branchPerTicket: false`) and agents do not commit per task. See CLAUDE.md for the commit
conventions.
