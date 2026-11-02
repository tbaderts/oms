# Design — SPEC-0026: Isolate failing aggregates in the outbox relay

> **Stage 2 of 3 — how.** Concrete enough that the plan can be written without re-reading the
> code, and checked line by line against the architecture policies. Write "None — <reason>" for a
> section that genuinely does not apply.

## Context

The proposal was approved without notes, so its assumptions stand: isolation per topic and key;
the rows behind a stuck row stay held; no pipelining within one aggregate; one relay instance.

**Today:**
- `oms-core/src/main/java/org/example/oms/service/OutboxRelay.java#drain` is
  `@Scheduled(fixedDelay 200 ms)` and `@Transactional`. It works like this:
  1. `OutboxRepository.claimPending(maxAttempts, Limit.of(100))` takes rows with
     `attempts < maxAttempts`, ordered by id, `PESSIMISTIC_WRITE` with `SKIP LOCKED` (lock timeout
     -2).
  2. For each row in turn, `MessagePublisher.publish(row)` blocks on
     `kafkaTemplate.send(topic, aggregateId, payload).get(10 s)`; the relay then calls
     `outboxRepository.delete(row)`.
  3. On the first exception, the relay calls `row.recordFailure(msg)` (attempts + 1, `lastError`)
     and returns, so the remaining rows wait for the next poll.
- A row with `attempts >= maxAttempts` is never claimed again. The next poll then publishes the
  rows behind it, out of order.
- Two gauges exist: `oms.outbox.pending` (count) and `oms.outbox.stuck`.
- `MessagePublisher.publish` maps the row to its Avro payload by `aggregateType` (ORDER,
  EXECUTION, ORDER_EXECUTION, PROJECTION), sends it keyed by `aggregateId`, and logs the offset.
  The relay is its only caller.
- `OutboxMessage` (entity) has `id`, `aggregateType`, `aggregateId`, `topic`,
  `aggregateVersion`, the payload columns, `createdAt` (Instant), `attempts`, `lastError` and
  `recordFailure(String)`.
- `outbox` (changelog 003) has a primary key and an index `idx_outbox_created_at`. There is no
  index on `(topic, aggregate_id)`.
- The producer is idempotent (`enable.idempotence`, `max.in.flight=5`, `acks=all`).

**Tests:**
- `OutboxRelayTest` (Mockito) covers publish-and-delete, failure-keeps-row, stop-at-first-failure
  and nothing-pending.
- `OrderExecutionPublicationIntegrationTest` and `ExchangeWorkflowIntegrationTest` prove keying and
  per-key order on a real broker (3-partition topics).

**Read:** `capabilities/event-publication.md`, `domain/outbox-message.md`,
`architecture/transactional-outbox.md`, `oms-framework/testing-patterns.md`.

**Closest example:** the relay itself; its metrics follow its existing gauges.

## Approach

```mermaid
sequenceDiagram
  participant R as OutboxRelay.drain (tx)
  participant DB as outbox
  participant E as relay executor
  participant P as MessagePublisher.publishAsync
  participant K as Kafka
  R->>DB: claimPending (not held, id order, SKIP LOCKED)
  R->>R: group by (topic, aggregateId), keep id order
  loop each aggregate, chains run concurrently
    E->>P: send row 1
    P->>K: send (async)
    K-->>E: ack
    E->>P: send row 2 (only after ack 1)
    K-->>E: failure → stop this chain
  end
  R->>R: await all chains (deadline)
  R->>DB: delete acked rows; recordFailure on each chain's failed row
```

1. **Claim.** `OutboxRepository.claimPending` gains a held-aggregate condition:

   ```sql
   SELECT o FROM OutboxMessage o
   WHERE o.attempts < :maxAttempts
     AND NOT EXISTS (SELECT 1 FROM OutboxMessage s
                     WHERE s.topic = o.topic AND s.aggregateId = o.aggregateId
                       AND s.attempts >= :maxAttempts)
   ORDER BY o.id ASC
   ```

   The lock and `SKIP LOCKED` hint are unchanged.
   - Rows of an aggregate with a stuck row are no longer claimed (AC-4). The stuck row itself was
     already excluded.
   - A stuck row is always the earliest row of its aggregate: every later row was held behind it
     while it failed, so nothing older can remain.
2. **Group.** The claimed rows go into a `LinkedHashMap<AggregateKey, List<OutboxMessage>>`, with
   `record AggregateKey(String topic, String aggregateId)`. Each list keeps id order.
3. **Chain per aggregate.** For each list, the relay builds a `CompletableFuture` chain on its own
   executor, a single-threaded `ExecutorService` named `outbox-relay-send`:
   - The next row is sent with `thenComposeAsync(..., executor)` only after the previous row's send
     completed successfully. Calling the producer from its own callback thread could block that
     thread when the buffer is full, so the next send never runs there.
   - A send that throws synchronously, such as a serializer error from `MessagePublisher`, becomes
     a failed future.
   - The first failure ends the chain. Later rows of that aggregate are not sent in this drain
     (AC-1, AC-2).
   - Each row's outcome goes into a per-drain result: `Map<OutboxMessage, Throwable>` for failures
     and a set for acknowledged rows.
   - Before each send, the chain checks a per-drain `AtomicBoolean closed`. Once the drain has
     stopped waiting, no new row is sent.
4. **Await.** `CompletableFuture.allOf(chains).get(deadline)`. The deadline is
   `kafka.outbox.drain-timeout-ms` (default 30000), which is longer than one send timeout so a
   chain of several rows can finish. On a timeout the relay sets `closed` and leaves every
   unfinished row untouched: no attempt and no error (superseded by the review changes in
   Alternatives & Decisions; the first version charged them). A row still in flight may reach the
   broker. Its aggregate is skipped until that send settles, and the next drain then re-sends the
   row, a duplicate in order, which is the at-least-once contract consumers already handle.
5. **Apply, on the drain thread inside the transaction.** The relay deletes every acknowledged
   row and calls `recordFailure(message)` on each failed row, with the same error logs as today:
   the attempt count, and an "exhausted its retry budget" line when it reaches the limit. Rows
   that were not sent are untouched. JPA entities are only modified on the drain thread.
6. **`MessagePublisher.publishAsync(OutboxMessage)`** returns
   `CompletableFuture<SendResult<String, Object>>`.
   - Mapping is unchanged.
   - `kafkaTemplate.send(...)` with no `.get()`; the offset log moves to the future's completion.
   - A mapping or serialization exception is thrown or returned as a failed future; the relay
     treats both the same.
   - The `@Observed` span covers the call.
   - The blocking `publish` is removed; the relay was its only caller.
7. **Gauge.**
   - `OutboxRepository.findOldestPendingCreatedAt(int maxAttempts)`:
     `SELECT MIN(o.createdAt) FROM OutboxMessage o WHERE o.attempts < :maxAttempts`, returning an
     `Optional<Instant>`.
   - `Gauge.builder("oms.outbox.oldest.age", ...).baseUnit("seconds")`: the seconds between that
     instant and now, or 0 when empty. It appears on Prometheus as
     `oms_outbox_oldest_age_seconds` (AC-5).
   - The rows behind a stuck row are counted, because they are still to be published. That is
     intended: they are waiting, and the age shows it.
8. **Shutdown.** `@PreDestroy` shuts the executor down.

| What Changes (proposal) | Where |
|---|---|
| Isolation per aggregate | `OutboxRelay` (group, chain, apply) |
| Asynchronous send, awaited | `MessagePublisher.publishAsync`, `OutboxRelay` chains and `allOf` |
| A stuck row holds its aggregate | `OutboxRepository.claimPending` query |
| Gauge | `OutboxRepository.findOldestPendingCreatedAt`, `OutboxRelay` constructor |
| Docs | Knowledge Base Updates |

## Contract Changes

None — no OpenAPI or Avro change. Topics, keys and payloads are unchanged.

## Data & Persistence

New changelog `009-outbox-aggregate-index.yaml`, included last in `db.changelog-master.yaml`, with
one changeset:

```yaml
databaseChangeLog:
  - changeSet:
      id: 020-outbox-topic-aggregate-index
      author: oms
      changes:
        - createIndex:
            tableName: outbox
            indexName: idx_outbox_topic_aggregate_id
            columns:
              - column: { name: topic }
              - column: { name: aggregate_id }
      rollback:
        - dropIndex: { tableName: outbox, indexName: idx_outbox_topic_aggregate_id }
```

The changeset id continues the numbering after 008's last id. It serves the `NOT EXISTS` probe of
the claim query. No data change, and no edits to changelogs 001–008. The entity is unchanged.

## Events & Messaging

- **`order_events` (P-05):** unchanged.
- **Outbox (P-06):** still the only path to Kafka; the relay remains the only publisher.
- **Ordering:**
  - Per `(topic, key)`: each row is sent only after the previous row of its aggregate was
    acknowledged, and none is sent after a failure in the same drain. In the next drain the failed
    row is the earliest of its aggregate again, so it goes first.
  - Across aggregates: no order. Rows of different keys may reach the broker in another relative
    order than their ids; nothing promised otherwise (`interfaces/kafka-topics.md`).
- **Duplicates:** at least once, as today. Only a timed-out drain can resend a row that did reach
  the broker, and it is resent in order.
- **Several relay instances:** out of scope. This is unchanged from today and documented.

## Domain, State & Orchestration

None — no state machine, pipeline or validation change. Command processing and staging are
untouched.

## Alternatives & Decisions

- **Per-aggregate chains on `CompletableFuture`**, rather than sending the whole batch at once and
  relying on the idempotent producer. A record that fails before reaching the producer (for
  example, a serializer or schema-registry error) does not stop the producer sending the next
  record of the same key. So only acknowledgement-gated chaining guarantees AC-2. Parallelism
  across aggregates gives the throughput (AC-3).
- **One single-threaded executor for the chain steps.** The work per step is a non-blocking
  `send` plus bookkeeping, so one thread is enough. It keeps producer calls off the producer's
  callback thread. A virtual-thread executor would work too; one platform thread is simpler to
  reason about. No new dependency.
- **The held-aggregate rule in the claim query**, rather than skipping rows in Java. The query
  never locks or loads rows it will not publish, and other aggregates still fill the batch up to
  100.
- **A drain deadline (`kafka.outbox.drain-timeout-ms`, default 30 s)** instead of the per-send
  10 s. A chain can hold several rows, and the per-send timeout of the producer
  (`delivery.timeout.ms`) still bounds each send. `kafka.send-timeout-seconds` is no longer used by
  the publisher and is removed from configuration if nothing else reads it.
- **Remove the blocking `publish`** rather than keep both: one way to send, and no dead code.
- **No new library.** The build is unchanged (P-17).
- **Changed during implementation (independent review, 2026-11-02): only a definitive failure
  costs an attempt.** The first version recorded "Timed out awaiting the broker", and so charged
  an attempt, on the first unfinished row of every chain when the drain deadline passed. That
  included rows that were never sent. With a broker down for a few minutes, every pending
  aggregate would have exhausted its attempts within 10 drains and been held for good, which is
  the opposite of the Goal. Now:
  - An attempt is charged only for a failure raised by `publishAsync` or reported by its future
    before the drain stops waiting: serialization or registry errors, or a broker rejection.
  - A row still in flight, or never sent, when the drain stops waiting is left untouched: no
    attempt, no error. It is resent in order on the next poll, and the oldest-age gauge shows the
    wait. The relay logs a warning with the number of unfinished aggregates.
  - A late outcome after the drain has applied its results changes nothing.

  The producer's retriable errors are retried inside the producer until `delivery.timeout.ms`
  (default 120 s, longer than the drain). So a broker outage delays publication without spending
  attempt budgets, as `transactional-outbox.md` promises.
- **Changed during implementation (same review): a virtual-thread executor** instead of one
  platform thread. `KafkaProducer.send` can block synchronously (topic metadata, a full buffer, a
  schema-registry lookup in the serializer, up to `max.block.ms`). On one shared thread that
  stalled every other aggregate. Each chain step now runs on its own virtual thread; a blocked
  send stalls only its aggregate. Java 25 does not pin virtual threads on `synchronized`. The
  producer's `max.block.ms` is set to 10 s
  (`spring.kafka.producer.properties.max.block.ms`). A send blocked on a missing topic or
  metadata then fails within the 30 s drain and is charged as a definitive failure. The executor
  is shut down gracefully, waiting briefly for running steps.
- **Changed during implementation (second review): failures are classified.** A send blocked on
  missing topic metadata fails after `max.block.ms` with Kafka's `TimeoutException`. That is a
  `RetriableException`, and it arrives within the drain, so the first fix still let an outage at
  startup exhaust attempts. Now:
  - A failure is **transient** when its cause chain holds a Kafka `RetriableException` or a
    `java.io.IOException` (the schema registry unreachable from the serializer). A transient
    failure stops its aggregate for the drain and records `lastError`
    (`OutboxMessage.recordTransientFailure`), but costs no attempt.
  - Only **definitive** failures count: serialization, record too large, authorization, a mapping
    `IllegalStateException`, and anything else not transient.
- **Changed during implementation (second review): one send in flight per aggregate across
  drains.** With a thread per step, a send still blocked from drain N could complete after drain
  N+1 had resent the row and sent the next one, landing a duplicate after a newer record. The
  relay now keeps the set of aggregates with a send in flight; it is added before the send and
  removed when that send's future completes. A drain skips those aggregates entirely, so their
  rows are untouched until the earlier send settles. A resend then always follows the earlier
  copy, so duplicates stay in order.
- **Changed during implementation (second review): scope of `max.block.ms`.** It is set on the
  shared producer properties, so it also applies to the dead-letter template of the command
  consumer (SPEC-0025). A 10 s bound on blocking is acceptable there too.
- **Changed during implementation (same review): rollout.** Rows that the old relay left stuck
  will hold their aggregates once this is deployed. The runbook in `capabilities/event-publication.md`
  says to check `oms.outbox.stuck` before deploying, and to replay or delete stuck rows.

## Risks & Mitigations

| Risk | Mitigation |
|---|---|
| A later row of an aggregate overtakes a failed one | Acknowledgement-gated chain; unit tests for both synchronous and asynchronous failures (AC-2) |
| A drain times out while sends are in flight | `closed` stops further sends; unfinished rows stay and are resent in order (a duplicate, at least once) |
| The held-aggregate query is slow on a large outbox | `NOT EXISTS` probes the new `(topic, aggregate_id)` index; the outbox stays small in normal operation |
| A stuck row blocks an order indefinitely | Approved trade-off; visible through `oms.outbox.stuck`, `oms.outbox.oldest.age` and the error log; documented in the outbox pages |
| A callback thread calls the producer | All chain steps run on the relay executor (`thenComposeAsync`) |
| Entity state modified off the transaction's thread | Outcomes are collected in concurrent structures; deletes and `recordFailure` run on the drain thread after the await |

## Test Strategy

| AC | Level (unit / web-mvc / integration / e2e) | Test class#method | What it asserts |
|---|---|---|---|
| AC-1 | unit | `OutboxRelayTest#failureHoldsOnlyItsAggregate` | Rows A1, B1, A2, B2 (ids 1–4); A1's send fails. B1 and B2 are sent and deleted; A2 is never sent; A1 is not deleted, has attempts 1 and the error recorded |
| AC-2 | unit | `OutboxRelayTest#rowsOfOneAggregateAreSentInIdOrderAfterEachAck`, `#synchronousFailureStopsTheAggregate`, `#asynchronousFailureStopsTheAggregate`; integration `OrderExecutionPublicationIntegrationTest` (existing, per-key order on 3 partitions) | With a publisher whose futures the test completes by hand, A2 is not sent before A1's future completes. A failure thrown by `publishAsync` and a failed future each stop the chain (A2 never sent, not deleted). The existing integration tests still observe per-key order |
| AC-3 | unit + integration | `OutboxRelayTest#aggregatesAreInFlightTogether`; existing `OrderExecutionPublicationIntegrationTest`, `ExchangeWorkflowIntegrationTest` | 20 aggregates of one row each, every future completed after 200 ms by a scheduler. The drain takes well under the sequential 4 s (asserted < 2 s), and the maximum number of concurrent in-flight sends observed is > 1. The integration suites publish end to end, keyed as before |
| AC-4 | integration | `OutboxHoldIntegrationTest#rowsBehindAStuckRowAreHeld` (new, extends `AbstractKafkaPostgresIntegrationTest`) | Order A is created and published. An `ORDER` row for A on `oms_orders` is inserted with `attempts = max`. Then A is accepted (staging a later row for A), and order B is created. B's rows are deleted (published), and B's message reaches `oms_orders`. A's accept row stays in the outbox, unattempted, and no `OrderMessage` of A with the accept's version reaches the topic. `oms.outbox.stuck` ≥ 1. Unit: `OutboxRelayTest` passes `maxAttempts` to `claimPending` (unchanged signature) |
| AC-5 | integration | `OutboxHoldIntegrationTest#oldestAgeGaugeReportsTheHeldRow`; unit `OutboxRelayTest#oldestAgeIsZeroWhenNothingPending` | With the held row older than a second, `oms.outbox.oldest.age` is ≥ 1 and `/actuator/prometheus` contains `oms_outbox_oldest_age_seconds`. In the unit test, an empty repository result gives 0 |

The existing `OutboxRelayTest` tests are rewritten for `publishAsync`, keeping their intent:
publish and delete; failure keeps the row; nothing pending. The stop-at-first-failure test becomes
the per-aggregate one. `MessagePublisherTest` moves to `publishAsync`. `LiquibaseMigrationIntegrationTest`
(existing) runs the new changelog.

## Policy Compliance

| Policy | Title | Status | How / Justification |
|---|---|---|---|
| P-01 | Contracts live only in oms-contracts | n/a | No contract change |
| P-02 | Specification before code, generated models only | n/a | No API or message change |
| P-03 | Never edit generated code | n/a | None involved |
| P-04 | Contracts evolve compatibly | n/a | Topics, keys and payloads unchanged |
| P-05 | Every state change is recorded in the event log | n/a | No order state change; the event log is untouched |
| P-06 | Kafka only through the transactional outbox | comply | The relay stays the only publisher and still deletes a row only after its acknowledgement, in the claiming transaction |
| P-07 | Schema changes through new Liquibase changesets | comply | New `009-outbox-aggregate-index.yaml` with rollback; no edits to 001–008 |
| P-08 | Concurrency and idempotency are explicit | comply | Per-aggregate ordering by acknowledgement-gated chains; at-least-once with in-order duplicates after a timeout; `SKIP LOCKED` claim unchanged; the multi-instance limit is documented |
| P-09 | Commands and queries stay separate | n/a | Publication infrastructure only |
| P-10 | State transitions go through the state machine and task pipeline | n/a | No transitions |
| P-11 | Layering and conventions | comply | Relay and publisher stay in `service/`, the query in `repository/` |
| P-12 | Jackson 3 only | n/a | No Jackson use |
| P-13 | Errors and validation follow the framework specs | comply | Failures are recorded on the row (attempts, `lastError`) and logged as today; nothing is swallowed |
| P-14 | Test first, every acceptance criterion is proven by an automated test | comply | Test Strategy above; red first in the plan |
| P-15 | Observability | comply | New `oms.outbox.oldest.age` gauge; the existing gauges and error logs are kept; the `@Observed` publish span is kept |
| P-16 | Security | n/a | No input, secrets or exposure change |
| P-17 | Simplicity and dependencies | comply | JDK `CompletableFuture` and executor only; no build change |
| P-18 | Modules build standalone | comply | oms-core only |
| P-19 | Documentation follows behaviour | comply | Knowledge Base Updates below |

## Knowledge Base Updates

- `capabilities/event-publication.md` — per-aggregate isolation, asynchronous sends, held
  aggregates, the new gauge.
- `domain/outbox-message.md` — claim order and the held-aggregate rule; the new index.
- `architecture/transactional-outbox.md` — the relay's failure handling and its single-instance
  ordering assumption.
