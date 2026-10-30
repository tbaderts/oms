---
id: SPEC-0003
title: Store venue reject reason on the order
type: feature
status: done
awaiting:
autopilot: false
modules: [oms-contracts, oms-core, oms-streaming-service, oms-ui, oms-exchange-simulator, oms-knowledge-base]
approvals: [proposal]
owner: Toni Badertscher
created: 2026-10-25
blocked_from:
blocked_reason:
---

# SPEC-0003 — Store venue reject reason on the order

<!-- This file belongs to the requester and the spec CLI. Agents change state only through
     `node specs/tools/spec.mjs …`; the hooks block direct edits. -->

## Goal

I'm not sure if we get back a reject reason and if we do something with it. if that's missing, we should add in to model, oms and make sure simultor returns it and it's also displayed in oms-ui. lets add something on the order to store the error. not sure if there is something in FIX protocol for that. after adding the model change, update all components to use in including oms-ui.

## Log

- 2026-10-25 created
- 2026-10-25 06:22 — set modules = oms-contracts, oms-core, oms-streaming-service, oms-ui, oms-exchange-simulator, oms-knowledge-base
- 2026-10-25 06:22 — proposal gate passed; awaiting human approval
- 2026-10-25 06:29 — proposal approved by Toni Badertscher
- 2026-10-25 06:29 — proposal → design
- 2026-10-25 06:29 — autopilot on
- 2026-10-25 06:31 — design → plan
- 2026-10-25 06:32 — plan → implement
- 2026-10-25 06:44 — verify run: pass
- 2026-10-25 06:44 — implement → verify
- 2026-10-25 06:48 — reopened at implement: Review minors: reject without text must clear a stale reason; truncation test must prove prefix; stale KB line in order-lifecycle.md 4.2
- 2026-10-25 06:51 — verify run: pass
- 2026-10-25 06:52 — implement → verify
- 2026-10-25 06:52 — verify → done
- 2026-10-25 06:52 — autopilot off
