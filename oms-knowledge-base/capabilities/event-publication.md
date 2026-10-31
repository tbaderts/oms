---
type: Capability
title: "Event Publication"
description: "Getting order and execution changes onto Kafka reliably through the transactional outbox."
tags: [kafka, outbox, events]
status: draft
maturity: "implemented"
commands: []
generated: { by: claude-code/claude-opus-5-5, at: "2026-10-27T17:30:00Z" }
sources:
  - resource: "repo:oms-core/src/main/java/org/example/oms/service/OutboxRelay.java"
  - resource: "repo:oms-core/src/main/java/org/example/oms/service/MessagePublisher.java"
---
# Event Publication

## Summary

Downstream systems learn about every order change from Kafka, never from a direct send in the command path.

## Actors

Streaming service, exchange simulator and any downstream consumer.

## Behaviour

Commands stage [outbox messages](../domain/outbox-message.md); `OutboxRelay` drains them through
`MessagePublisher` (the only Kafka producer). The broker is off the request path. See the
[Transactional Outbox decision](../architecture/transactional-outbox.md).

Every order change stages an `ORDER` row. An applied fill stages, in the same transaction and in
this order, `ORDER` and `EXECUTION` rows, then the [projections](../oms-concepts/projections.md)
stage theirs: the order-execution projection a `PROJECTION` row with the `OrderExecution` record
as a generic payload (SPEC-0020; SPEC-0019 introduced the message as an `ORDER_EXECUTION` row).
All carry the same event version, for `oms_orders`, `oms_executions` and `oms_order_executions`.
A refused fill rolls back and stages nothing. All rows are keyed by the order's `rootOrderId`, or its own `orderId` when it
has none (`OrderEventAppender.partitionKey`), so one order tree stays on one partition per topic.

## Requirements

- [FR-023 Publish staged messages in commit order](../functional-requirements/FR-023-relay-outbox-in-order.md)
- [FR-024 Retry failed publication](../functional-requirements/FR-024-retry-failed-publication.md)
- [NFR-004 Reliable publication](../non-functional-requirements/NFR-004-reliable-publication.md)

## Interfaces and domain

[Kafka Topics](../interfaces/kafka-topics.md), [Avro Messages](../interfaces/avro-messages.md).

## Detailed specifications

- [Trade Blotter Backend Component Specification](../oms-concepts/streaming-architecture.md) (consumer side)

## Known gaps

None known.

## Verification

`OutboxRelayTest`, `EventSourcingIntegrationTest`, `MessagePublisherTest`. Conventions: [Testing Patterns](../oms-framework/testing-patterns.md).
