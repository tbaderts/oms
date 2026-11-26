# Proposal — SPEC-0077: Dead-letter and retry policy for every Kafka client

> **Stage 1 of 3 — why and what, not how.** The acceptance criteria below are the contract that
> the verify stage checks. If they are vague, the goal cannot be proven met.

## Why

SPEC-0075 made dead-letter topics visible in oms-ui, but only one Kafka client in the system writes
to one. Today:

| Service | Client | On a failure |
|---|---|---|
| oms-core | command listener (`commands`) | Retries 4 times (about 7 s, by count), then `commands.DLT`. Only `DeserializationException` and `IllegalArgumentException` skip the retries; a `NullPointerException` or a permission error is retried like a transient fault |
| oms-core | outbox relay (producer to `oms_orders`, `oms_executions`) | Retries up to `max-attempts` (10) times, by count; then the row stays in the table as *stuck*. A serialization error is retried 10 times though it can never succeed |
| oms-exchange-simulator | order listener (`oms_orders`) | Spring's default handler: 9 retries, then the record is **logged and skipped**. A lost order message means the venue never answers that order |
| oms-exchange-simulator | command gateway (producer to `commands`) | One synchronous send; a failure is logged and the command (an ack, a fill) is **dropped** |
| oms-streaming-service | order and execution receivers (Reactor Kafka) | No error handling per record. A record that cannot be deserialized fails the whole stream, which re-subscribes from the last committed offset and fails on the same record again, forever: one poison message stops the trade blotter's live updates |

The requester wants every consumer and producer in every service to follow one rule: retryable
failures are retried for a configurable amount of time; failures that cannot succeed on a retry
(a null pointer, a permission denied) go to a dead-letter topic at once. Without it, records are
lost silently (simulator), streams wedge (streaming service), and partitions block on errors that
will never clear (oms-core).

Related: `oms-knowledge-base/architecture/patterns/kafka-messaging.md`,
`capabilities/event-publication.md`, FR-024, SPEC-0075 (dead-letter screen).

## What Changes

- **One error policy per Kafka client, the same in every service.** Each failure is classified:
  - *not retryable*: a record that cannot be read (deserialization), a programming error
    (`NullPointerException`, `ClassCastException`, `IllegalArgumentException`,
    `IllegalStateException` from mapping), a permission error (Kafka `AuthorizationException`,
    `SecurityException`, database "insufficient privilege" SQLState `42501`), a record the broker
    will never accept (`SerializationException`, `RecordTooLargeException`, `InvalidTopicException`);
  - *retryable*: everything else (timeouts, an unavailable broker or database, a lost connection).
  - oms-core's concurrency conflicts keep their SPEC-0048 behaviour: retried until they clear, never
    dead-lettered.
- **Retry for a configurable time, not a count.** Retryable failures back off exponentially until a
  per-service window (`kafka.error-policy.retry-for`, default 2 minutes) has passed; then the record
  is dead-lettered like a non-retryable one.
- **Consumers dead-letter to `<topic>.<service>.DLT`**, with the original key and value bytes and the
  failure in the record headers, then continue with the next record. The service name in the topic
  name keeps the dead letters of two consumers of the same topic apart (the simulator and the
  streaming service both read `oms_orders`). **BREAKING for operators:** oms-core's command dead
  letters move from `commands.DLT` to `commands.oms-core.DLT`; the old topic stays readable on the
  SPEC-0075 screen.
- **Producers dead-letter too.** A record that cannot be sent (not retryable, or still failing after
  the window) is written to `<topic>.<service>.DLT` with the failure headers and
  `dlt-source: producer`.
  - oms-core's outbox marks the row *dead-lettered*. The later rows of the same aggregate stay held,
    as for a stuck row today, so consumers never see an order's messages out of order.
  - The simulator's command gateway retries within the window instead of dropping the command.
- **The streaming service survives a poison record:** it is dead-lettered and the live stream
  continues with the next record.
- **Every dead-letter topic is created at startup** with the partitions of its source topic, so it
  is listed on the SPEC-0075 dead-letter screen before the first dead letter, and every dead letter
  is counted in a metric.
- **A test per service fails when a Kafka consumer or producer is added without the policy.**

## Scope

### In scope

- The five clients in the table: oms-core's command listener and outbox relay, the simulator's
  order listener and command gateway, the streaming service's two receivers.
- The shared classification, the time-based retry window and its configuration, the dead-letter
  topic naming, provisioning, headers and metric.
- A coverage test per service that finds every Kafka client and checks it is wired to the policy.
- Knowledge-base updates (Kafka messaging pattern, event publication, FR-024, the dead-letter
  topics' description from SPEC-0075).

### Out of scope

- **Replaying dead letters** (still SPEC-0075's deferred follow-up).
- oms-core's `DeadLetterReader`: it reads dead-letter topics for the admin API with assigned
  partitions and no commits, so it has nothing to dead-letter. The coverage test lists it as exempt.
- Alerting on dead letters (the metric makes it possible; rules are a later ticket).
- oms-mcp-server and oms-ui: they have no Kafka clients.
- Moving the existing records of `commands.DLT` to the new topic.

## Acceptance Criteria

- **AC-1** — Given any of the four consumers and a record whose processing throws a retryable
  exception a few times and then succeeds, when the consumer runs, then the record is retried with
  backoff, processed once, its offset is committed only after success, and nothing is written to a
  dead-letter topic.
- **AC-2** — Given any of the four consumers and a record whose processing keeps throwing a
  retryable exception, when the configured retry window (shortened in the test) has passed, then
  the record is on `<topic>.<service>.DLT` with its original key and value bytes and headers naming
  the exception class, message, source topic, partition and offset, and the next record is
  processed.
- **AC-3** — Given any of the four consumers and a record whose processing throws a non-retryable
  exception (`NullPointerException`, a permission error, an undeserializable value), when it is
  consumed, then it is dead-lettered on the first failure, without retries, and the next record is
  processed.
- **AC-4** — Given the streaming service and an `oms_orders` record that cannot be deserialized,
  when it is consumed, then it is on `oms_orders.oms-streaming-service.DLT` and a later valid order
  update still reaches a blotter subscriber.
- **AC-5** — Given oms-core's command listener and a concurrency conflict that clears, when it is
  retried, then it is never dead-lettered, even after the retry window (SPEC-0048 behaviour kept).
- **AC-6** — Given the oms-core outbox or the simulator's command gateway and a send that fails
  with a retryable error and then succeeds within the window, when it is retried, then the record
  is delivered once and nothing is dead-lettered. For the outbox, a broker that is down for longer
  than the window does not dead-letter (the message waits for the broker, as today).
- **AC-7** — Given the oms-core outbox or the simulator's command gateway and a send that fails
  with a non-retryable error, or a retryable one past the window, when it is handled, then the
  record is on `<topic>.<service>.DLT` with the failure headers and `dlt-source: producer`. For the
  outbox, the row is marked dead-lettered and later rows of the same aggregate are not sent while
  it stays so.
- **AC-8** — Given a service starting, when it is ready, then every dead-letter topic its clients
  can write to exists with at least the partition count of its source topic, and each dead letter
  increments `kafka.dead.letters{service, topic, side, exception}`.
- **AC-9** — Given the code of each service, when its tests run, then a coverage test finds every
  `@KafkaListener`, `KafkaReceiver` and `KafkaTemplate`/producer in it and fails if one is not wired
  to the error policy (or listed as exempt with a reason).
- **AC-10** — Given each service's `application.yml`, when it is read, then the retry window and
  backoff are configurable (`kafka.error-policy.retry-for`, `initial-interval`, `max-interval`)
  and documented, with the same defaults in every service.

## Impact

| Area | Impact |
|---|---|
| Modules | oms-core, oms-streaming-service, oms-exchange-simulator, oms-knowledge-base |
| Contracts (OpenAPI / Avro) | None. Dead letters carry the original bytes; failure details are record headers |
| Data (tables, migrations) | oms-core: the outbox row gets a dead-lettered state (new Liquibase changeset, additive) |
| Events / Kafka topics | New dead-letter topics `<topic>.<service>.DLT` for `commands` (oms-core consumer, simulator producer), `oms_orders` (simulator, streaming service consumers; oms-core producer), `oms_executions` (streaming service consumer; oms-core producer). `commands.DLT` is no longer written (**BREAKING for operators**) |
| Consumers (oms-ui, oms-mcp-server, downstream) | oms-ui's dead-letter screen lists the new topics without change (it lists every `.DLT`). No message format change |
| Knowledge base | `architecture/patterns/kafka-messaging.md`, `capabilities/event-publication.md`, FR-024, `domain/model/outbox-message.md`, `architecture/context/exchange-simulator.md`, `architecture/context/streaming-service.md`, the SPEC-0075 dead-letter page |

## Open Questions

- [resolved] What happens to a retryable failure after the window? → assumption: it is dead-lettered
  like a non-retryable one (Spring's behaviour), except oms-core's concurrency conflicts (AC-5) and
  a broker outage for producers (AC-6), where dead-lettering is impossible or wrong.
- [resolved] Default retry window? → assumption: 2 minutes, with backoff from 500 ms doubling to
  30 s. A blocked partition holds every later record of that partition, so the window bounds that
  delay; it is configurable per service.
- [resolved] Dead-letter topic name? → assumption: `<topic>.<service>.DLT` for consumers and
  producers alike (the header `dlt-source` says which). It keeps SPEC-0075's `.DLT` suffix, and the
  service in the name separates two consumers of the same topic. **Review this**: it renames
  oms-core's existing `commands.DLT`.
- [resolved] Does a dead-lettered outbox row release the later messages of its order? →
  assumption: **no**. They stay held, as they do for a stuck row today, so no consumer sees an
  order's state or fills out of order; an operator resolves the head of the chain. **Review this**:
  the alternative (release and continue) keeps orders moving but delivers later states without the
  dead-lettered one, and for executions that means a downstream system misses a fill.
- [resolved] Is the outbox attempt count kept? → assumption: replaced by the time window for
  retryable errors; non-retryable errors no longer use up attempts. The `oms.outbox.stuck` gauge
  then counts dead-lettered rows that the DLT itself refused.
- [deferred] Resending dead letters → SPEC-0075's follow-up; this ticket only makes sure every
  failure ends up there.
