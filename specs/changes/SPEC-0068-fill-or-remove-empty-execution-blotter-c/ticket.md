---
id: SPEC-0068
title: Fill or remove empty execution blotter columns
type: fix
status: done
awaiting:
autopilot: false
modules: [oms-core, oms-streaming-service, oms-ui, oms-knowledge-base]
approvals: [proposal]
owner: Toni Badertscher
created: 2026-11-17
blocked_from:
blocked_reason:
---

# SPEC-0068 — Fill or remove empty execution blotter columns

<!-- This file belongs to the requester and the spec CLI. Agents change state only through
     `node specs/tools/spec.mjs …`; the hooks block direct edits. -->

## Goal

oms-ui execution blotter doesn't show a value for a number of fields like quantity, price etc. ... fix the empty execution columns

## Log

- 2026-11-17 created
- 2026-11-17 15:42 — autopilot on
- 2026-11-17 22:22 — autopilot off
- 2026-11-17 22:54 — set modules = oms-core, oms-streaming-service, oms-ui, oms-knowledge-base
- 2026-11-17 22:54 — autopilot on
- 2026-11-17 22:54 — proposal gate passed; awaiting human approval
- 2026-11-18 06:10 — proposal approved by Toni Badertscher
- 2026-11-18 06:10 — proposal → design
- 2026-11-18 06:11 — design → plan
- 2026-11-18 06:11 — plan → implement
- 2026-11-24 05:01 — autopilot on
- 2026-11-24 05:13 — verify run: pass
- 2026-11-24 05:13 — implement → verify
- 2026-11-24 05:15 — verify → done
- 2026-11-24 05:15 — autopilot off
