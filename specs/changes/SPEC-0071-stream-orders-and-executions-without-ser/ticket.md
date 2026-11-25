---
id: SPEC-0071
title: Stream orders and executions without service caches
type: refactor
status: done
awaiting:
autopilot: false
modules: [oms-streaming-service, oms-ui, oms-knowledge-base]
approvals: [proposal]
owner: Toni Badertscher
created: 2026-11-24
blocked_from:
blocked_reason:
---

# SPEC-0071 — Stream orders and executions without service caches

<!-- This file belongs to the requester and the spec CLI. Agents change state only through
     `node specs/tools/spec.mjs …`; the hooks block direct edits. -->

## Goal

the order_execution_projection was designed for booking and other downstream applications. the oms-ui should use only order and executions streams, not the projection. also, not sure why there is a cache inside streaming-service. maybe that's a letfover from the past. do we really need this? as for the other stuff, cache and execution qeuery support, create tickets as needed so we ger thinsg cleaned up

## Log

- 2026-11-24 created
- 2026-11-24 13:11 — autopilot on
- 2026-11-24 13:12 — proposal gate passed; awaiting human approval
- 2026-11-24 13:21 — proposal approved by Toni Badertscher
- 2026-11-24 13:21 — proposal → design
- 2026-11-24 13:23 — design → plan
- 2026-11-24 13:23 — plan → implement
- 2026-11-24 13:33 — verify run: pass
- 2026-11-24 13:40 — verify run: fail
- 2026-11-24 13:41 — verify run: pass
- 2026-11-24 13:42 — implement → verify
- 2026-11-24 13:42 — verify → done
- 2026-11-24 13:42 — autopilot off
