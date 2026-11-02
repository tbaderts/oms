---
id: SPEC-0029
title: Model order expiry and close in state machine
type: feature
status: done
awaiting:
autopilot: false
modules: [oms-contracts, oms-core, oms-exchange-simulator, oms-knowledge-base, developer-cockpit]
approvals: [proposal]
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
- 2026-11-02 08:08 — autopilot on
- 2026-11-02 08:09 — set modules = oms-contracts, oms-core, oms-exchange-simulator, oms-knowledge-base
- 2026-11-02 08:10 — proposal gate passed; awaiting human approval
- 2026-11-02 10:52 — proposal approved by Toni Badertscher
- 2026-11-02 10:52 — proposal → design
- 2026-11-02 10:55 — design → plan
- 2026-11-02 10:55 — set modules = oms-contracts, oms-core, oms-exchange-simulator, oms-knowledge-base, developer-cockpit
- 2026-11-02 10:55 — plan → implement
- 2026-11-02 11:17 — verify run: pass
- 2026-11-02 11:17 — implement → verify
- 2026-11-02 11:26 — reopened at implement: Review: end of day shares the single scheduler thread with the outbox relay; a non-concurrency error aborts the loop; orders without timeInForce (FIX default DAY) never expire; cancel reject accepted on CLOSED; time property parsing; KB gaps
- 2026-11-02 11:33 — verify run: pass
- 2026-11-02 11:33 — implement → verify
- 2026-11-02 11:39 — verify run: pass
- 2026-11-02 11:40 — verify → done
- 2026-11-02 11:40 — autopilot off
