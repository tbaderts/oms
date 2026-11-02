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

### The relay (SPEC-0026)

Every 200 ms the relay claims up to 100 rows in id order and groups them by **aggregate**: one
topic and key, and so one partition.

- **Order within an aggregate.** Its rows are sent one after another, each only after the broker
  acknowledged the previous one, so they reach Kafka in id order.
- **Aggregates run in parallel.** Different aggregates are in flight together. The relay awaits
  the whole batch, at most `kafka.outbox.drain-timeout-ms` (default 30 s), then deletes the
  acknowledged rows in the claiming transaction.
- **A failure holds only its aggregate.** The failed row keeps its place, its attempt count goes
  up and its error is recorded, and the later rows of that aggregate are not sent in this drain.
  Other aggregates are published as usual. On the next poll the failed row is the first of its
  aggregate again.
- **A stuck row holds its aggregate.** A row that fails `kafka.outbox.max-attempts` times (default
  10) is no longer retried. The later rows of its aggregate stay in the outbox behind it, never
  published out of order, until an operator replays or removes it.
- **Only a definitive failure costs an attempt.** These are problems with the message itself:
  serialization, a record too large, authorization, a row without a payload. A **transient**
  failure costs no attempt. It means a Kafka retriable error, such as a send that waited longer
  than the producer's `max.block.ms` (10 s) for topic metadata, or an I/O error reaching the schema
  registry. A transient failure stops the aggregate for the drain and records `lastError`. A row
  the drain stopped waiting for is left untouched. Both are sent again on a later poll, in order.
  So a broker or registry outage, including one during a restart, delays publication; it never
  exhausts attempts and holds orders.
- **Delivery is at least once.** A row that was in flight when the drain stopped waiting may reach
  Kafka twice. While that send has not settled, later drains skip its aggregate, so the resend
  always follows it: duplicates arrive in order.
- **Sends do not block each other.** Each chain step runs on a virtual thread, so a send blocked
  inside the producer stalls only its own aggregate.
- **Limits.**
  - Isolation works within a batch. If the 100 oldest pending rows all belong to aggregates that
    cannot progress (failing transiently, for example on a partition without a leader, or with a
    send still in flight), every drain claims only those rows and newer aggregates wait until
    they recover. Watch `oms.outbox.oldest.age`.
  - A misconfigured or missing topic fails transiently (unknown topic, metadata timeout). It
    never becomes stuck: its rows wait, with `lastError` set and the age gauge growing, until the
    configuration is fixed.
- **One relay instance.** Ordering assumes a single relay per deployment: with several, `SKIP LOCKED`
  could let a second one claim later rows of an aggregate the first is still publishing.

Metrics:
- `oms.outbox.pending`: rows in the outbox;
- `oms.outbox.stuck`: rows that exhausted their attempts;
- `oms.outbox.oldest.age` (`oms_outbox_oldest_age_seconds`): how long the oldest row still to be
  published has waited, 0 when none. A held aggregate makes it grow.

**Rolling out SPEC-0026.** Rows that an earlier relay left stuck start holding their aggregates
once this version runs: every new message for that topic and root order would wait behind them.
Before deploying, check `oms.outbox.stuck` (or
`select id, topic, aggregate_id, last_error from outbox where attempts >= 10`). Replay or delete
each stuck row; the old relay has usually already published the later messages past it.

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
