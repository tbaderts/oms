---
id: SPEC-0077
title: Dead-letter and retry policy for every Kafka client
type: feature
status: done
awaiting:
autopilot: false
modules: [oms-contracts, oms-core, oms-streaming-service, oms-exchange-simulator, oms-knowledge-base]
approvals: [proposal]
owner: Toni Badertscher
created: 2026-11-25
blocked_from:
blocked_reason:
---

# SPEC-0077 — Dead-letter and retry policy for every Kafka client

<!-- This file belongs to the requester and the spec CLI. Agents change state only through
     `node specs/tools/spec.mjs …`; the hooks block direct edits. -->

## Goal

in SPEC-0075 we added dead letter topic monitoring for kafka. now we need to make sure that all kafka consumers across all services actually have a dead letter topic logic configured. same for producers. stuff that is retryable should be retried for a configurable amount of time and stuff that is not retriable like null pointer or permission denies should move to DLT

## Log

- 2026-11-25 created
- 2026-11-25 18:12 — autopilot on
- 2026-11-25 18:14 — proposal gate passed; awaiting human approval
- 2026-11-25 18:23 — proposal approved by Toni Badertscher
- 2026-11-25 18:23 — proposal → design
- 2026-11-25 18:27 — design → plan
- 2026-11-25 18:27 — set modules = oms-contracts, oms-core, oms-streaming-service, oms-exchange-simulator, oms-knowledge-base
- 2026-11-25 18:28 — plan → implement
- 2026-11-25 19:36 — verify run: fail
- 2026-11-25 19:53 — verify run: fail
- 2026-11-25 20:08 — verify run: pass
- 2026-11-25 20:09 — implement → verify
- 2026-11-26 06:34 — verify run: pass
- 2026-11-26 06:34 — verify → done
- 2026-11-26 06:34 — autopilot off
