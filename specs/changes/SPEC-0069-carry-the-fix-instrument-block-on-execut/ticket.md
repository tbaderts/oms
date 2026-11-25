---
id: SPEC-0069
title: Carry the FIX instrument block on executions
type: feature
status: done
awaiting:
autopilot: false
modules: [oms-contracts, oms-core, oms-exchange-simulator, oms-streaming-service, oms-ui, oms-knowledge-base, developer-cockpit]
approvals: [proposal]
owner: Toni Badertscher
created: 2026-11-24
blocked_from:
blocked_reason:
---

# SPEC-0069 — Carry the FIX instrument block on executions

<!-- This file belongs to the requester and the spec CLI. Agents change state only through
     `node specs/tools/spec.mjs …`; the hooks block direct edits. -->

## Goal

execution report (FIX protocol) has an instrument block that is mandatory (either symbol or securityId). so execution should have whatever came back from exchange/simulator. if it's missing there, we can add it.

## Log

- 2026-11-24 created
- 2026-11-24 10:32 — autopilot on
- 2026-11-24 10:34 — set modules = oms-contracts, oms-core, oms-exchange-simulator, oms-ui, oms-knowledge-base, developer-cockpit
- 2026-11-24 10:34 — proposal gate passed; awaiting human approval
- 2026-11-24 10:42 — proposal approved by Toni Badertscher
- 2026-11-24 10:42 — proposal → design
- 2026-11-24 10:46 — set modules = oms-contracts, oms-core, oms-exchange-simulator, oms-streaming-service, oms-ui, oms-knowledge-base, developer-cockpit
- 2026-11-24 10:46 — design → plan
- 2026-11-24 10:47 — plan → implement
- 2026-11-24 11:21 — verify run: fail
- 2026-11-24 11:32 — verify run: pass
- 2026-11-24 11:44 — verify run: pass
- 2026-11-24 11:45 — implement → verify
- 2026-11-24 11:45 — verify → done
- 2026-11-24 11:45 — autopilot off
