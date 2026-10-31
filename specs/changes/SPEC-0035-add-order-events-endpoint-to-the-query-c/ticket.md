---
id: SPEC-0035
title: Add order-events endpoint to the query contract
type: fix
status: done
awaiting:
autopilot: false
modules: [oms-contracts, oms-core, developer-cockpit]
approvals: [proposal]
owner: Toni Badertscher
created: 2026-10-31
blocked_from:
blocked_reason:
---

# SPEC-0035 — Add order-events endpoint to the query contract

<!-- This file belongs to the requester and the spec CLI. Agents change state only through
     `node specs/tools/spec.mjs …`; the hooks block direct edits. -->

## Goal

Contract the order-events endpoint: /api/order-events/orderId/{orderId} is @Hidden and not in oms-query-api.yml; add it as a query operation, as agreed in the SPEC-0007 proposal, and plan a fix for anything that breaks.

## Log

- 2026-10-31 created
- 2026-10-31 17:51 — autopilot on
- 2026-10-31 17:52 — proposal gate passed; awaiting human approval
- 2026-10-31 17:53 — proposal approved by Toni Badertscher
- 2026-10-31 17:53 — proposal → design
- 2026-10-31 17:56 — design → plan
- 2026-10-31 17:56 — plan → implement
- 2026-10-31 18:09 — verify run: pass
- 2026-10-31 18:10 — implement → verify
- 2026-10-31 18:16 — verify run: pass
- 2026-10-31 18:17 — verify → done
- 2026-10-31 18:17 — autopilot off
