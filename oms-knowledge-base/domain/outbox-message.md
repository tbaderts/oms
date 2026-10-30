---
type: Domain Concept
title: "Outbox Message"
description: "A message staged in the outbox table in the same transaction as a state change, later published to Kafka by the outbox relay."
tags: [outbox, kafka, entity]
status: draft
entity: "OutboxMessage"
generated: { by: claude-code/claude-opus-5-5, at: "2026-10-27T17:30:00Z" }
sources:
  - resource: "repo:oms-core/src/main/java/org/example/oms/model/OutboxMessage.java"
  - resource: "repo:oms-core/src/main/java/org/example/oms/service/OutboxRelay.java"
  - resource: "repo:oms-core/src/main/resources/db/changelog/003-event-sourcing-and-outbox.yaml"
  - resource: "repo:oms-core/src/test/java/org/example/oms/service/OutboxRelayTest.java"
---
# Outbox Message

An outbox message is a Kafka message that has not been sent yet. It is written in the same database
transaction as the change it announces, so the database and Kafka cannot disagree: either both the
change and the message exist, or neither does.

## Structure

| Field | Meaning |
|---|---|
| `id` | Primary key; the relay publishes in id order, which preserves per-order ordering |
| `aggregateType`, `aggregateId`, `aggregateVersion` | What the message is about and which event version produced it |
| `topic` | Target topic (`oms_orders` or `oms_executions`) |
| `orderPayload`, `executionPayload` | The order or execution to publish |
| `createdAt`, `attempts`, `lastError` | Bookkeeping for retries; after `kafka.outbox.max-attempts` (default 10) a message is no longer retried and stays in the table for investigation |

## Related

- [Event Publication](../capabilities/event-publication.md)
- Decision: [Transactional Outbox](../architecture/transactional-outbox.md)
- [Kafka Topics](../interfaces/kafka-topics.md)
