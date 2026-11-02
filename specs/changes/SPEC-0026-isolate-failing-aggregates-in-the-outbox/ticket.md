---
id: SPEC-0026
title: Isolate failing aggregates in the outbox relay
type: fix
status: done
awaiting:
autopilot: false
modules: [oms-core]
approvals: [proposal]
owner: Toni Badertscher
created: 2026-10-30
blocked_from:
blocked_reason:
---

# SPEC-0026 — Isolate failing aggregates in the outbox relay

<!-- This file belongs to the requester and the spec CLI. Agents change state only through
     `node specs/tools/spec.mjs …`; the hooks block direct edits. -->

## Goal

Address finding 7 of the architecture review (oms-core/docs/architecture-review-2026-10-30.md): the relay stops the whole batch on one failed send, so one poison message delays every aggregate for up to ten polls, and one synchronous send per row caps throughput near 500 messages per second per instance. Skip only rows of the failed aggregate for the rest of the batch, send the batch asynchronously and await it, and add a gauge for the age of the oldest pending outbox row.

## Log

- 2026-10-30 created
- 2026-11-02 05:55 — autopilot on
- 2026-11-02 05:57 — proposal gate passed; awaiting human approval
- 2026-11-02 06:16 — proposal approved by Toni Badertscher
- 2026-11-02 06:16 — proposal → design
- 2026-11-02 06:18 — design → plan
- 2026-11-02 06:19 — plan → implement
- 2026-11-02 06:29 — verify run: pass
- 2026-11-02 06:29 — implement → verify
- 2026-11-02 06:36 — reopened at implement: Review: a drain timeout charged an attempt to every unfinished aggregate (even never-sent rows), so a Kafka outage would make all pending aggregates stuck and held; timeout path untested
- 2026-11-02 06:41 — verify run: pass
- 2026-11-02 06:41 — implement → verify
- 2026-11-02 06:43 — reopened at implement: Re-review: retriable Kafka errors (metadata TimeoutException after max.block.ms) were charged as attempts, so an outage at startup could still exhaust and hold aggregates; a send still blocked from an earlier drain could land a duplicate after a newer row
- 2026-11-02 06:48 — verify run: pass
- 2026-11-02 06:48 — implement → verify
- 2026-11-02 06:50 — reopened at implement: Third review (verdict MET): close the in-flight race window (mark in flight before the closed check) and document the batch-fill and misconfigured-topic limits
- 2026-11-02 06:52 — verify run: pass
- 2026-11-02 06:53 — implement → verify
- 2026-11-02 06:53 — verify → done
- 2026-11-02 06:53 — autopilot off
