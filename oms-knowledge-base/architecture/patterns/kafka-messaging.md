---
type: Pattern
title: "Kafka Messaging"
description: "How services consume and produce Kafka messages in the OMS: Avro records from oms-contracts, one error policy for every client (retry what may succeed for a configurable window, dead-letter what cannot), consumers that decode and dispatch in one transaction, and producers that only publish through the transactional outbox."
tags: [pattern, kafka, avro, consumer, producer, outbox, dead-letter, retry]
status: draft
updated: "2026-11-25T20:00:00Z"
sources:
  - resource: "repo:oms-core/src/main/java/org/example/oms/config/CommandListener.java"
  - resource: "repo:oms-core/src/main/java/org/example/oms/config/KafkaConsumerConfig.java"
  - resource: "repo:oms-core/src/main/java/org/example/oms/config/CommandBackOffs.java"
  - resource: "repo:oms-core/src/main/java/org/example/oms/kafka/errors/ErrorClassifier.java"
  - resource: "repo:oms-core/src/main/java/org/example/oms/kafka/errors/ErrorPolicyProperties.java"
  - resource: "repo:oms-core/src/main/java/org/example/oms/kafka/errors/DeadLetters.java"
  - resource: "repo:oms-core/src/main/java/org/example/oms/kafka/errors/DeadLetterTopicProvisioner.java"
  - resource: "repo:oms-core/src/main/java/org/example/oms/service/OutboxDeadLetterPublisher.java"
  - resource: "repo:oms-exchange-simulator/src/main/java/org/example/simulator/kafka/errors/KafkaErrorHandlingConfig.java"
  - resource: "repo:oms-exchange-simulator/src/main/java/org/example/simulator/kafka/CommandGateway.java"
  - resource: "repo:oms-streaming-service/src/main/java/org/example/streaming/kafka/errors/RecordErrorPolicy.java"
  - resource: "repo:oms-core/src/test/java/org/example/oms/kafka/errors/KafkaClientCoverageTest.java"
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

## Error policy (every consumer and producer)

Every Kafka client in every service follows one policy (SPEC-0077). Each service has its own copy of
the `kafka.errors` package (`ErrorClassifier`, `ErrorPolicyProperties`, `DeadLetters`,
`DeadLetterMetrics`, `DeadLetterTopicProvisioner`). The copies are kept identical, with the same unit
tests.

- **Retryable or not.** `ErrorClassifier` looks at the whole cause chain.
  - **Not retryable**, dead-lettered at once: `NullPointerException`, `ClassCastException`,
    `IllegalArgumentException`, `IndexOutOfBoundsException`, `UnsupportedOperationException`,
    `SecurityException`, `AccessDeniedException` (file and Spring Security), Kafka
    `AuthorizationException`, SQLState `42501` (permission denied), and (de)serialization, Avro and
    message-conversion errors.
  - **Except** a (de)serialization error caused by an `IOException`: that is the schema registry
    being unreachable, not bad data, so it is retried.
  - **Everything else is retryable**, including `IllegalStateException` and broker timeouts.
- **The retry window.** A retryable failure is retried with exponential back-off until
  `retry-for` has passed since the record first failed; then it is dead-lettered.
  ```yaml
  kafka.error-policy:
    service-name: oms-core      # names the dead-letter topics and tags the metrics
    retry-for: PT2M             # how long a retryable failure is retried
    initial-interval: PT0.5S
    max-interval: PT30S         # <= retry-for, and below max.poll.interval.ms (5 minutes)
    multiplier: 2.0
  ```
- **Dead-letter topics.** `<source topic>.<service-name>.DLT`, e.g. `commands.oms-core.DLT` or
  `oms_orders.oms-streaming-service.DLT`: one per source topic and service, so two services never
  write to the same one. `DeadLetterTopicProvisioner` creates them at startup with the source
  topic's partition count, and grows one that has fewer. A dead letter goes to the partition its
  record came from. A source topic that does not exist yet at startup (on a fresh stack oms-core
  creates its topics after its migrations) is retried in the background every 10 s until it does.
- **What a dead letter carries.**
  - The value exactly as it arrived (for a producer, as it was to be sent), with the original key
    and headers.
  - Spring's `kafka_dlt-*` headers: exception class, message, stack trace (bounded to 8 KB), and the
    original topic, partition, offset and time.
  - `dlt-source` (`consumer` or `producer`) and `dlt-service`.
- **Metrics.** `kafka.dead.letters{service,topic,side,exception}` counts dead letters;
  `kafka.dead.letters.failed{service,topic}` counts dead letters that could not be written. A
  consumed record whose dead letter fails is not acknowledged, so it is read again.
- **Producers.** The Kafka client's own retries are the window: `delivery.timeout.ms = retry-for`,
  `request.timeout.ms` between 1 s and 30 s, `retries` unbounded. A send that still fails is
  dead-lettered.
- **Coverage.** Each service has a `KafkaClientCoverageTest`. It finds every class holding a Kafka
  client and fails unless the class is listed with how it follows the policy, or why it is exempt.
  Add every new consumer or producer there.

### Where each service applies it

| Service | Consumers | Producers |
|---|---|---|
| oms-core | `commands`: `commandErrorHandler` (Spring `DefaultErrorHandler`) | the outbox relay, see [Producing](#producing) |
| oms-exchange-simulator | `oms_orders`: `orderErrorHandler`, applied by Boot to the listener factory | `CommandGateway`: asynchronous sends, dead-lettered by `CommandDeadLetterPublisher` |
| oms-streaming-service | both Reactor receivers: `RecordErrorPolicy.process` per record | only the dead-letter sender |

## Consuming (oms-core `commands`)

1. **Decode yourself.** `CommandListener` receives the value as bytes and decodes it with
   `CommandDecoder`. A record that cannot be decoded, or a type with no handler, goes to
   `commands.oms-core.DLT` exactly as it arrived, without retries. Every consumer reads bytes and
   decodes in code for this reason: a deserializer that throws inside the client never reaches the
   error policy.
2. **Put the ids in the log context.** `commandId` and `correlationId` go into the MDC for every
   line logged while the command is processed ([Logging and Tracing](logging-and-tracing.md)).
3. **Dispatch in one transaction.** The command goes to `CommandDispatcher.dispatch`, which runs
   the processor, records the outcome in the command log and stages outgoing messages in the outbox,
   all in one database transaction ([Transaction Handling](transaction-handling.md)).
4. **Refusals are answers, not failures.** A command refused by the business rules (illegal state,
   duplicate `commandId`, `expectedVersion` mismatch) is logged as `REFUSED` and acknowledged.
5. **Failures follow the [error policy](#error-policy-every-consumer-and-producer).**
   `KafkaConsumerConfig.commandErrorHandler` retries a retryable failure for the window. It sends the
   record to `commands.oms-core.DLT` once the window has passed, or at once if the failure cannot
   succeed.
   - **Where operators see it.** oms-ui's **Dead letters** tab lists every `.DLT` topic and shows its
     latest records, with those details and the value decoded through the schema registry. It
     reads without consuming: no consumer group, no commit (SPEC-0075; [Query API](../../domain/interfaces/query-api.md#operations-outbox-and-dead-letters)).
   - **Resending** is a follow-up ticket.
   Concurrency failures (a lost version race, lock timeout, deadlock) take precedence. They are
   retried with their own back-off, capped at `kafka.consumer.concurrency-max-interval-ms`, and are
   never dead-lettered; after `kafka.consumer.concurrency-error-after-attempts` each retry is logged
   as an error (`CommandBackOffs`).
6. **Be idempotent.** Delivery is at least once. oms-core de-duplicates lifecycle commands on
   `(orderId, commandId)`; a consumer of the event topics de-duplicates on the record's natural key
   (for fills `(orderId, execId, orderVersion)`).

Listener concurrency equals the topic's partition count; `KafkaTopicProvisioner` creates missing
topics at startup and never resizes an existing one.

Reactive consumers (the streaming service) use Reactor Kafka with one `ReceiverOptions` per topic
and observation enabled, so each record's span continues the producer's trace. Records are handled
one at a time (`concatMap`) through `RecordErrorPolicy`. An offset is acknowledged only once its
record was handled or dead-lettered.

## Producing

- **Never call `KafkaTemplate` from a command path.** Stage the message in the `outbox` table in the
  command's transaction (`OrderEventAppender` does this for order and execution changes).
- `OutboxRelay` (one leader per database) drains the outbox after commit, in commit order per
  aggregate, through `MessagePublisher`. A failing aggregate holds only its own later messages.
- **Outbox failures follow the error policy.**
  - A retryable failure waits out its back-off (`next_attempt_at`). It is retried until `retry-for`
    has passed since it first failed (`first_failed_at`).
  - Then, or at once for a failure that cannot succeed, the message is sent to
    `<topic>.oms-core.DLT` and parked (`parked_at`, `dead_letter_topic`). A parked message keeps
    holding its aggregate's later messages until an operator deals with it.
  - **An unreachable broker is not the message's fault.** While Kafka is down, rows are retried
    without counting against the window, and nothing is dead-lettered; a failure after the outage
    starts a fresh window.
  - **The dead letter's value** is the Avro record as it would have been sent, serialized under the
    source topic's subject (the dead-letter topics have no registered subject of their own). If the record cannot
    be built or serialized, it is a JSON document of the row (`content-type: application/json`).
    If the dead-letter topic refuses it, the row is parked without a dead letter and
    `kafka.dead.letters.failed` counts it. If the broker is unreachable, the row stays pending and
    is tried again.
  - `outbox.max-attempts` (default 50) is only a backstop.
- Services that are not the system of record (the exchange simulator) produce commands directly
  to `commands`; they own no state that the message must agree with.

## Testing

Integration tests extend `AbstractKafkaPostgresIntegrationTest` (Testcontainers Kafka and
PostgreSQL). Examples: `CommandRetryBudgetIntegrationTest`, `CommandDeadLetterIntegrationTest`,
`CommandErrorPolicyIntegrationTest`, `OutboxDeadLetterIntegrationTest`,
`OrderExecutionPublicationIntegrationTest` (ordering on a three-partition topic).

The simulator (`OrderListenerErrorPolicyIntegrationTest`, `CommandGatewayIntegrationTest`) and the
streaming service (`StreamErrorPolicyIntegrationTest`) prove the policy against a Testcontainers
broker. Tests shorten the window to `retry-for: PT3S`.
