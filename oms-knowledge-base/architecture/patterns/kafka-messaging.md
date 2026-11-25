---
type: Pattern
title: "Kafka Messaging"
description: "How services consume and produce Kafka messages in the OMS: Avro records from oms-contracts, consumers that decode, dispatch in one transaction and retry or dead-letter, and producers that only publish through the transactional outbox."
tags: [pattern, kafka, avro, consumer, producer, outbox]
status: draft
updated: "2026-11-25T12:00:00Z"
sources:
  - resource: "repo:oms-core/src/main/java/org/example/oms/config/CommandListener.java"
  - resource: "repo:oms-core/src/main/java/org/example/oms/config/KafkaConsumerConfig.java"
  - resource: "repo:oms-core/src/main/java/org/example/oms/config/CommandBackOffs.java"
  - resource: "repo:oms-core/src/main/java/org/example/oms/config/KafkaTopicProvisioner.java"
  - resource: "repo:oms-core/src/main/java/org/example/oms/service/OutboxRelay.java"
  - resource: "repo:oms-core/src/main/java/org/example/oms/service/MessagePublisher.java"
  - resource: "repo:oms-streaming-service/src/main/java/org/example/streaming/config/KafkaConfig.java"
  - resource: "repo:oms-core/src/test/java/org/example/oms/integration/CommandRetryBudgetIntegrationTest.java"
  - resource: "repo:oms-core/src/test/java/org/example/oms/integration/CommandDeadLetterIntegrationTest.java"
---
# Kafka Messaging

**Use this pattern for any new topic, consumer or producer.** Topics, keys and schemas are
documented on the [Message API](../../domain/interfaces/message-api.md); the reasons are in
[ADR-005 Transactional Outbox](../decisions/ADR-005-transactional-outbox.md).

## Messages

- Every record is an Avro class generated from `oms-contracts/src/main/avro`
  ([Contract-first Code Generation](contract-first-codegen.md)). No JSON payloads, no hand-written
  message classes.
- Subjects are registered ahead of deployment (`registerSchemas`); services run with
  `auto.register.schemas=false`.
- **Key = the aggregate.** Records of one order tree are keyed by `rootOrderId` (the order's own id
  while every order is its own root), so they share a partition and keep their order.

## Consuming (oms-core `commands`)

1. **Decode yourself.** `CommandListener` receives the value as bytes and decodes it with
   `CommandDecoder`. A record that cannot be decoded, or a type with no handler, goes to
   `commands.DLT` exactly as it arrived, without retries.
2. **Put the ids in the log context.** `commandId` and `correlationId` go into the MDC for every
   line logged while the command is processed ([Logging and Tracing](logging-and-tracing.md)).
3. **Dispatch in one transaction.** The command goes to `CommandDispatcher.dispatch`, which runs
   the processor, records the outcome in the command log and stages outgoing messages in the outbox,
   all in one database transaction ([Transaction Handling](transaction-handling.md)).
4. **Refusals are answers, not failures.** A command refused by the business rules (illegal state,
   duplicate `commandId`, `expectedVersion` mismatch) is logged as `REFUSED` and acknowledged.
5. **Failures retry, then dead-letter.** `KafkaConsumerConfig.commandErrorHandler` retries with
   exponential back-off and sends the record to `<topic>.DLT` when the budget is spent.
   - **What the record keeps.** Its original bytes, and Spring's `kafka_dlt-*` headers: the
     exception class, message and cause, and the original topic, partition, offset and time.
   - **Where operators see it.** oms-ui's **Dead letters** tab lists every `.DLT` topic and shows its
     latest records, with those details and the value decoded through the schema registry. It
     reads without consuming: no consumer group, no commit (SPEC-0075; [Query API](../../domain/interfaces/query-api.md#operations-outbox-and-dead-letters)).
   - **Resending** is a follow-up ticket.
   Concurrency failures (a lost version race, lock timeout, deadlock) are retried without a budget,
   capped at `kafka.consumer.concurrency-max-interval-ms` (`CommandBackOffs`).
6. **Be idempotent.** Delivery is at least once. oms-core de-duplicates lifecycle commands on
   `(orderId, commandId)`; a consumer of the event topics de-duplicates on the record's natural key
   (for fills `(orderId, execId, orderVersion)`).

Listener concurrency equals the topic's partition count; `KafkaTopicProvisioner` creates missing
topics at startup and never resizes an existing one.

Reactive consumers (the streaming service) use Reactor Kafka with one `ReceiverOptions` per topic
and observation enabled, so each record's span continues the producer's trace.

## Producing

- **Never call `KafkaTemplate` from a command path.** Stage the message in the `outbox` table in the
  command's transaction (`OrderEventAppender` does this for order and execution changes).
- `OutboxRelay` (one leader per database) drains the outbox after commit, in commit order per
  aggregate, through `MessagePublisher`. A failing aggregate holds only its own later messages.
- Services that are not the system of record (the exchange simulator) produce commands directly
  to `commands`; they own no state that the message must agree with.

## Testing

Integration tests extend `AbstractKafkaPostgresIntegrationTest` (Testcontainers Kafka and
PostgreSQL). Examples: `CommandRetryBudgetIntegrationTest`, `CommandDeadLetterIntegrationTest`,
`OrderExecutionPublicationIntegrationTest` (ordering on a three-partition topic).
