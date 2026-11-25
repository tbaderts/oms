---
id: SPEC-0070
title: Specify the executions query over stored fills
type: feature
status: done
awaiting:
autopilot: false
modules: [oms-contracts, oms-core, oms-ui, oms-knowledge-base]
approvals: [proposal]
owner: Toni Badertscher
created: 2026-11-24
blocked_from:
blocked_reason:
---

# SPEC-0070 — Specify the executions query over stored fills

<!-- This file belongs to the requester and the spec CLI. Agents change state only through
     `node specs/tools/spec.mjs …`; the hooks block direct edits. -->

## Goal

the order_execution_projection was designed for booking and other downstream applications. the oms-ui should use only order and executions streams, not the projection. as for the other stuff, cache and execution qeuery support, create tickets as needed so we ger thinsg cleaned up

## Log

- 2026-11-24 created
- 2026-11-24 11:53 — autopilot on
- 2026-11-24 11:54 — proposal gate passed; awaiting human approval
- 2026-11-24 11:55 — proposal approved by Toni Badertscher
- 2026-11-24 11:55 — proposal → design
- 2026-11-24 11:56 — design → plan
- 2026-11-24 11:57 — plan → implement
- 2026-11-24 12:22 — verify run: pass
- 2026-11-24 12:32 — verify run: pass
- 2026-11-24 12:33 — implement → verify
- 2026-11-24 12:33 — verify → done
- 2026-11-24 12:33 — autopilot off
