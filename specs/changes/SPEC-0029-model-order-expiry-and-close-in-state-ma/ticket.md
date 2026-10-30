---
id: SPEC-0029
title: Model order expiry and close in state machine
type: feature
status: proposal
awaiting:
autopilot: false
modules: [oms-core, oms-knowledge-base]
approvals: []
owner: Toni Badertscher
created: 2026-10-30
blocked_from:
blocked_reason:
---

# SPEC-0029 — Model order expiry and close in state machine

<!-- This file belongs to the requester and the spec CLI. Agents change state only through
     `node specs/tools/spec.mjs …`; the hooks block direct edits. -->

## Goal

Address finding 12 of the architecture review (oms-core/docs/architecture-review-2026-10-30.md): the standard state machine has no LIVE to EXP transition and nothing ever reaches CLOSED, so expiry and end of day are not modelled. Decide which configuration is the product one, add the missing transitions and the commands or scheduled step that drive them, and prepare for one configuration per leg once order trees exist.

## Log

- 2026-10-30 created
