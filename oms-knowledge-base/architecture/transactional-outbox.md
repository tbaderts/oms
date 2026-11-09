---
type: Decision
title: "Decision: Transactional Outbox"
description: "Kafka messages are staged in the database with the change and published by a relay."
tags: [decision, outbox, kafka]
status: draft
generated: { by: claude-code/claude-opus-5-5, at: "2026-10-27T17:30:00Z" }
sources:
  - resource: "repo:oms-core/src/main/java/org/example/oms/service/OutboxRelay.java"
  - resource: "repo:specs/policies/architecture-policies.md"
---
# Decision: Transactional Outbox

## Context
Publishing to Kafka from the command path lets the database and Kafka disagree after a failure.

## Decision
Stage messages in `outbox` in the command's transaction; only `OutboxRelay` publishes (policy P-06).

## Consequences
- At-least-once delivery, ordered per order; consumers must be idempotent.
- Kafka outages delay publication but do not fail commands.
- A message that cannot be published delays only its own aggregate (topic and key): the relay
  sends different aggregates in parallel and holds the later messages of a failing one behind it
  (SPEC-0026). A message that exhausted its attempts holds its aggregate until an operator acts.
- Ordering rests on one relay leader per database (SPEC-0048) and, as a safety net, on the relay
  never claiming one order's rows out of version order (SPEC-0047).
- `ORDER` and `EXECUTION` rows are pointers (SPEC-0047): the relay reads the order's snapshot
  from `order_events` and the execution from `executions` at publish time, on its drain thread.
  The fill's write set is one copy of the order instead of three, at the cost of one indexed read
  per row when publishing.

Capability: [Event Publication](../capabilities/event-publication.md).

Context: [System Context](system-context.md).
