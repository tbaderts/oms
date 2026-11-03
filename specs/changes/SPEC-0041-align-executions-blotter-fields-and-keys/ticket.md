---
id: SPEC-0041
title: Align executions blotter fields and keys with orders
type: fix
status: done
awaiting:
autopilot: false
modules: [oms-contracts, oms-core, oms-streaming-service, oms-ui, oms-knowledge-base]
approvals: [proposal]
owner: Toni Badertscher
created: 2026-11-03
blocked_from:
blocked_reason:
---

# SPEC-0041 — Align executions blotter fields and keys with orders

<!-- This file belongs to the requester and the spec CLI. Agents change state only through
     `node specs/tools/spec.mjs …`; the hooks block direct edits. -->

## Goal

oms-ui executions blotter doesn't show certain fields like id, execution id, avgPx. there is also confusion about id vs executionId. I think executionId should be the primary key, or lets say we follow the same approch as on the orders blotter

## Log

- 2026-11-03 created
- 2026-11-03 08:43 — autopilot on
- 2026-11-03 08:45 — set modules = oms-contracts, oms-core, oms-streaming-service, oms-ui, oms-knowledge-base
- 2026-11-03 08:45 — proposal gate passed; awaiting human approval
- 2026-11-03 09:48 — proposal approved by Toni Badertscher
- 2026-11-03 09:48 — proposal → design
- 2026-11-03 09:51 — design → plan
- 2026-11-03 09:51 — plan → implement
- 2026-11-03 10:03 — verify run: pass
- 2026-11-03 10:03 — implement → verify
- 2026-11-03 10:08 — reopened at implement: Independent review: AC-5/AC-6 component wiring (StreamingBlotter/Blotter getRowId) untested; HALF_EVEN test does not discriminate; stale execID/executionId in further KB pages
- 2026-11-03 10:14 — verify run: pass
- 2026-11-03 10:14 — implement → verify
- 2026-11-03 10:15 — verify → done
- 2026-11-03 10:15 — autopilot off
