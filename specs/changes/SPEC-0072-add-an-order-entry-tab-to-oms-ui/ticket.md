---
id: SPEC-0072
title: Add an order entry tab to oms-ui
type: feature
status: done
awaiting:
autopilot: false
modules: [oms-contracts, oms-ui, oms-knowledge-base]
approvals: [proposal]
owner: Toni Badertscher
created: 2026-11-24
blocked_from:
blocked_reason:
---

# SPEC-0072 — Add an order entry tab to oms-ui

<!-- This file belongs to the requester and the spec CLI. Agents change state only through
     `node specs/tools/spec.mjs …`; the hooks block direct edits. -->

## Goal

for oms-ui I would like to have an order entry tab that lets me enter new orders with all the necessary information like economics, account etc, so that it can be submitted to oms-core. as far as securities related information is concerned like instrument names/symbols, ask/bid price etc, we can use some opensource api like www.alphavantage.co or similar

## Log

- 2026-11-24 created
- 2026-11-24 15:18 — autopilot on
- 2026-11-24 15:19 — set modules = oms-contracts, oms-ui, oms-knowledge-base
- 2026-11-24 15:19 — proposal gate passed; awaiting human approval
- 2026-11-24 15:22 — proposal approved by Toni Badertscher
- 2026-11-24 15:22 — proposal → design
- 2026-11-24 15:25 — design → plan
- 2026-11-24 15:25 — plan → implement
- 2026-11-24 16:01 — verify run: pass
- 2026-11-24 16:06 — verify run: pass
- 2026-11-24 16:10 — implement → verify
- 2026-11-24 16:10 — verify → done
- 2026-11-24 16:10 — autopilot off
