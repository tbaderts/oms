---
id: SPEC-0048
title: Make oms-core safe to run with several instances
type: feature
status: proposal
awaiting:
autopilot: false
modules: [oms-core, oms-knowledge-base]
approvals: []
owner: Toni Badertscher
created: 2026-11-07
blocked_from:
blocked_reason:
---

# SPEC-0048 — Make oms-core safe to run with several instances

<!-- This file belongs to the requester and the spec CLI. Agents change state only through
     `node specs/tools/spec.mjs …`; the hooks block direct edits. -->

## Goal

Ticket D of the event sourcing and CQRS review (findings F-5, F-6, F-7, F-8 and F-16; target architecture sections 3, 5.2, 6.1 and 9): two or more command instances run correctly and the publication floor drops below the poll interval. Lock the root order row first in the fill and accept pipelines as the lifecycle pipeline already does, keeping the version check as the safety net; retry ConcurrencyFailureException on the Kafka listener without consuming the dead-letter budget; elect exactly one outbox relay with a PostgreSQL advisory lock and report it in health, with hash-partitioned relay slices designed as the next step; nudge the relay after each commit on its instance and loop drains while a batch is full, keeping the poll as the fallback; declare the four topics with their partition counts and set the listener concurrency to the partition count; run the end-of-day and GTD schedulers on one leader with the same lock pattern; prove it with integration tests that run two application contexts against one database and one broker and pass OrderVersionIntegrationTest, OutboxHoldIntegrationTest and a contention test in which no fill reaches the dead-letter topic.

## Log

- 2026-11-07 created
- 2026-11-07 12:48 — Created from the target architecture. Depends on SPEC-0046 and SPEC-0047. SPEC-0022 depends on its root lock.
