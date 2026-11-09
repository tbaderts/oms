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
| `id` | Primary key, from `outbox_seq` one at a time. The relay publishes each aggregate's rows (same `topic` and `aggregateId`) in id order, which preserves per-order ordering: the rows are staged under the order's row lock, and exactly one instance, the relay leader, drains them (SPEC-0048). As a safety net, one order's rows are never published out of version order: if an order's pending rows on a topic have a lower version at a higher id, only its lowest version is claimed until that clears (SPEC-0047) |
| `aggregateType` | `ORDER`, `EXECUTION`, `PROJECTION` (a message staged by a [projection](../oms-concepts/projections.md), SPEC-0020), or `ORDER_EXECUTION` (rows staged before SPEC-0020); selects the message and the payload columns read |
| `aggregateId` | The Kafka key: the order's `rootOrderId`, or its own `orderId` when it has none |
| `aggregateVersion` | The event-log version that produced the message (`eventId` / `orderVersion` on the wire); equal to the order's `txNr` at staging (SPEC-0027) |
| `orderId`, `execId` | The order the message is about and, for `EXECUTION`, the execution (SPEC-0047). `ORDER` and `EXECUTION` rows are **pointers**: the relay reads the record back at publish time, the order from `order_events` by `(order_id, version)` and the execution from `executions` by `(order_id, execid)`. Null on rows staged before SPEC-0047 |
| `topic` | Target topic (`oms_orders`, `oms_executions` or `oms_order_executions`) |
| `orderPayload`, `executionPayload` | Only on rows staged before SPEC-0047 (`EXECUTION` and `ORDER_EXECUTION` rows carry both), which still publish from them. Rows staged since are pointers and leave both empty, so a fill serializes the order once, in `order_events` |
| `payloadType`, `payload` | For `PROJECTION` rows: the Avro record's schema full name and its binary encoding |
| `createdAt`, `attempts`, `lastError` | Bookkeeping for retries. After `kafka.outbox.max-attempts` (default 10) a message is no longer retried and stays in the table for investigation; the later messages of its aggregate stay too, held behind it (SPEC-0026). `createdAt` of the oldest pending message feeds `oms.outbox.oldest.age` |

The index `idx_outbox_topic_aggregate_id` (changelog 009) serves the relay's check for a held
aggregate, and `idx_outbox_order_version` (changelog 015) its per-order version check.

A pointer whose event or execution cannot be read fails definitively: `lastError` names the order
and the version, its attempts count, and after `max-attempts` its aggregate is held like any
stuck row. The target is committed in the same transaction as the row, so a missing one is a
defect, not a race. How the relay claims, sends and retries: [Event Publication](../capabilities/event-publication.md#the-relay-spec-0026).

## Related

- [Event Publication](../capabilities/event-publication.md)
- Decision: [Transactional Outbox](../architecture/transactional-outbox.md)
- [Kafka Topics](../interfaces/kafka-topics.md)
