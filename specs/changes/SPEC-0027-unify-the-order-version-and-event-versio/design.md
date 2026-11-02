# Design — SPEC-0027: Unify the order version and event version

> **Stage 2 of 3 — how.** Concrete enough that the plan can be written without re-reading the
> code, and checked line by line against the architecture policies. Write "None — <reason>" for a
> section that genuinely does not apply.

## Context

The proposal was approved without notes. That confirms its assumptions: the concurrency mechanism
may change as long as AC-3 holds, the old `tx_nr` values may be overwritten, and the field is not
renamed.

**Today:**
- **`org.example.common.model.Order#txNr`** (oms-core) is `@Version`, `@Column(nullable = false)`,
  with no setter. Hibernate inserts 0 and increments it at each flush of a dirty order.
- **`OrderEventAppender#appendOrderEvent(order, event, command)`** computes
  `nextVersion(orderId) = orderEventRepository.findMaxVersionByOrderId(orderId) + 1`, which is one
  query per event. It then saves the `OrderEvent` (version, transaction, `command_id`, resulting
  state, `orderSnapshot` = the order) and stages the outbox row with `aggregateVersion = version`.
  `appendExecutionEvent` calls it, then stages the execution row.
- **Every order write appends exactly one event in the same transaction:**

  | Command path | Order write | Event append |
  |---|---|---|
  | Create | `PersistOrderTask` `saveAndFlush` (insert) | `PublishOrderEventTask` |
  | Accept | `OrderAcceptCommandProcessor` `save` | the appender, right after |
  | Fill | `UpdateOrderTask` `save` | `PublishExecutionEventTask` |
  | Lifecycle (reject, cancel, cancel request, cancel reject) | `SaveOrderTask` `saveAndFlush`, after `LoadOrderTask` took a row lock (`findLockedByOrderId`) | `PublishOrderEventTask` |

  No other code writes `orders` (`ProjectionRebuilder` writes only the view).
- **Concurrency:** a stale fill or accept fails at flush with
  `ObjectOptimisticLockingFailureException`. `GlobalExceptionHandler` answers 409
  `urn:oms:error:concurrent-modification` with `retryable: true`. The Kafka error handler retries it.
- **`order_events`** has `uq_order_events_order_id_version` (changelog 003) and
  `uq_order_events_order_id_command_id` (006).
- **`OrderReplayService.replayAt`** returns the snapshot of the latest event at or below a
  version. Old snapshots carry the old `txNr`.
- **`OrderQueryService.search`** runs `OrderEventRepository.findLatestVersions(orderIds)` per page
  to fill `eventVersion`; `getOrder` does the same for one order. The `OrderSearchResult(orders,
  eventVersions)` map feeds the DTO mapper.
- **`OutboxMessage.aggregateVersion`** Javadoc explains why `txNr` cannot be used.

**Read:** `domain/order.md`, `capabilities/event-sourcing-and-replay.md`,
`interfaces/query-api.md`, `oms-framework/state-query-store_spec.md`,
`oms-framework/testing-patterns.md`.

**Closest example:** the appender itself; the migration follows `006-order-event-command-id.yaml`,
with a tag before the change.

## Approach

1. **`Order#txNr`** loses `@Version` and gains `@Setter`; it stays `@Column(name = "tx_nr",
   nullable = false)`. Its Javadoc reads: the version of the order's last event, 0 before the
   first; set only by `OrderEventAppender`.
2. **`OrderEventAppender#appendOrderEvent`:**
   - `long version = order.getTxNr() + 1; order.setTxNr(version);` comes before the event is
     built, so the snapshot and the outbox payload carry the new version.
   - The order passed in is the managed instance each path already holds (the result of
     `save`/`saveAndFlush`, or the pipeline context's order), so Hibernate writes the new `tx_nr`
     with the transaction.
   - The event is saved with **`saveAndFlush`**. A concurrent writer that appended the same version
     first makes the insert fail here, inside the appender.
   - A `DataIntegrityViolationException` whose cause names `uq_order_events_order_id_version` is
     rethrown as `OptimisticLockingFailureException("Order <id> was modified concurrently (event
     version <n> already exists)")`. Every caller and the 409 handler see the same exception type
     as today. Other violations propagate unchanged; for example
     `uq_order_events_order_id_command_id` still means a duplicate command.
   - `nextVersion` and `OrderEventRepository.findMaxVersionByOrderId` are deleted (AC-2).
3. **Why this keeps AC-3.** Two transactions that read the order at version n both try to insert
   event n + 1. Postgres makes the second insert wait for the first transaction, then fail on the
   unique key. The loser rolls back completely: its order update, event and outbox rows. Over REST
   it answers 409 as today; over Kafka it is retried, re-reads version n + 1 and applies. Lifecycle
   commands already take a row lock, so they are serialised before reaching this point. This is the
   classic event-store check: the event log, not the order row, is the source of truth for the
   version.
4. **Replay.** `OrderReplayService.replayAt` sets the returned snapshot's `txNr` to that event's
   `version`, so replay agrees with the row for migrated history too (AC-6).
   - New snapshots already carry it; old ones carry the old counter.
   - `isContiguous` is unchanged.
5. **Query API.** `OrderQueryService` fills the `eventVersions` map from the loaded orders:
   `txNr > 0`, the order's id to its `txNr`. That keeps `OrderSearchResult` and the mapper
   unchanged. `findLatestVersions` and the `OrderVersion` projection are deleted if nothing else
   uses them (AC-5).
6. **Outbox.** The `OutboxMessage.aggregateVersion` Javadoc is updated: the version is the
   order's, carried on the row so the publisher needs no join. The field stays.
7. **Migration** `010-unify-order-version.yaml` (Data & Persistence).

| What Changes (proposal) | Where |
|---|---|
| One version per order; appender sets it; no max query | `Order`, `OrderEventAppender`, `OrderEventRepository` |
| Concurrency stays explicit | `OrderEventAppender` (flush, translate the version conflict) |
| Existing data | changelog 010 |
| Query API reads it from the row | `OrderQueryService` |

## Contract Changes

None — no OpenAPI or Avro change. The value of the query API's `OrderDto.txNr` now equals
`eventVersion`: 1 after creation, where Hibernate's counter gave 0. That was approved as a value
change, documented in the knowledge base.

## Data & Persistence

New changelog `oms-core/src/main/resources/db/changelog/010-unify-order-version.yaml`, included
last:

```yaml
databaseChangeLog:
  - changeSet:
      id: 021-tag-before-unified-order-version
      author: oms
      changes:
        - tagDatabase: { tag: before-010-unified-order-version }
  - changeSet:
      id: 022-unify-order-version
      author: oms
      changes:
        - sql:
            sql: >-
              UPDATE orders o SET tx_nr = COALESCE(
                (SELECT MAX(e.version) FROM order_events e WHERE e.order_id = o.order_id), 0)
      rollback:
        - sql:
            # The old Hibernate counters are not kept (approved): rolling back leaves the
            # unified values, which an @Version column accepts as a starting point.
            sql: SELECT 1
```

- No schema change: the column, its `NOT NULL` and its type stay.
- No existing changeset is edited (P-07).
- The migration is idempotent; running it again sets the same values.

## Events & Messaging

- **`order_events` (P-05):** one event per command, as today. `version` is the order's previous
  version + 1, the same numbers as `max + 1` gave for a contiguous log. The snapshot now carries
  `txNr = version`.
- **Outbox (P-06):** unchanged rows; `aggregateVersion` has the same value as before.
- **Kafka:** `eventId`/`orderVersion` unchanged.
- **Idempotency:** unchanged. Deduplication still uses `command_id`, `execId` and
  `(sessionId, clOrdId)`.

## Domain, State & Orchestration

None — no state machine or pipeline step changes. The lifecycle row lock stays. A concurrent
conflict still surfaces as an `OptimisticLockingFailureException`, now from the appender rather
than the order flush. `OrderLifecycleCommandProcessor` and the error handling (P-13) are unchanged.

## Alternatives & Decisions

- **Drop `@Version`; the event log's unique version is the optimistic lock** — chosen over keeping
  `@Version`.
  - Hibernate owns a `@Version` value: the application must not set it, and it is seeded at 0 on
    insert. So "the appender sets it" and "1 after creation" cannot both hold with `@Version`.
  - Deriving the event version from Hibernate's value after a flush instead needs either a +1
    offset forever, or renumbering the published history. The offset keeps two meanings; the
    renumbering changes published `eventId`s.
  - The unique constraint already exists. Every order write appends an event in the same
    transaction (Context table), so a lost update is impossible.
- **Flush the event in the appender and translate the version conflict** — chosen over letting
  the violation surface at commit. Callers and the 409/retry handling keep the exception type and
  the place where the conflict appears. The translation is narrowed to the version constraint, so
  the duplicate-command constraint keeps its meaning.
- **Replay sets `txNr` from the event's version** — chosen over rewriting old snapshots in the
  migration. No history is rewritten; the log stays append-only.
- **Keep the `eventVersions` map in `OrderSearchResult`** and fill it from the row — the smallest
  change that removes the query.
- **No new dependency; no build change** (P-17).
- **Changed during implementation (independent review): every concurrency failure is rethrown,
  not only the optimistic one.**
  - Because the appender flushes inside the pipeline, a fill (no lock) racing a lifecycle command
    (row lock) can now deadlock in Postgres: the fill's event insert holds a key while it waits
    for the row lock.
  - The loser gets a `PessimisticLockingFailureException`/`CannotAcquireLockException`. Before, it
    was not rethrown, so it was reported as a refusal and acknowledged on Kafka.
  - Now `PipelineResults.rethrowConcurrencyFailure` rethrows any Spring
    `ConcurrencyFailureException` found in a failed task's cause chain (optimistic, pessimistic,
    deadlock). `GlobalExceptionHandler` answers every such failure with the existing 409
    `concurrent-modification` problem, `retryable: true`. Kafka retries it, since it is not in the
    not-retryable list.
  - The appender recognises the version conflict by Hibernate's
    `ConstraintViolationException#getConstraintName()`, with the message text only as a fallback.
- **Changed during implementation (independent review): AC-3 proven through the pipeline.**
  - `OrderVersionIntegrationTest#concurrentFillsThroughThePipelineOneWaitsThenFails`: fill A's
    transaction appends its event and stays open; fill B then runs through
    `ExecutionCommandProcessor`, waits on A's uncommitted event key, and fails with a conflict once
    A commits. B leaves no execution and no event; retried, it applies, and `cumQty` is the sum.
  - `#kafkaFillRetriedAfterAConflict`: a fill over Kafka meets a planted next version, fails and
    is retried; the planted row is removed, and the retry applies.
- **Changed during implementation: `OrderQueryService.search` no longer runs in
  REPEATABLE_READ.** It reads one table, so there is nothing to keep consistent.
  `QuerySearchIsolationIntegrationTest` (SPEC-0018), which pinned that isolation, is replaced by
  `QuerySearchVersionIntegrationTest`.
- **Changed during implementation: upgrade rule.** An instance running the old code after the
  migration would create orders at `tx_nr = 0` with event 1, and the new code could then never
  append to them. The changelog comment and `domain/order.md` say all old instances must be
  stopped before the migration runs: a stop-and-start deploy, as the docker-compose setup does.
- **Changed during implementation: pipelines rethrow a concurrency conflict.** With `@Version`,
  a stale fill failed at commit, outside the task pipeline, and the exception reached the caller.
  The conflict now surfaces in the appender, which runs inside `PublishExecutionEventTask` and
  `PublishOrderEventTask`. Those tasks wrap failures in `TaskExecutionException`, and the
  orchestrator turns them into a failed result. `ExecutionCommandProcessor` would then report a
  conflicting fill as a refusal: acknowledged on Kafka, so the fill would be lost, and a 400 on
  REST. The fix:
  - A shared `PipelineResults.rethrowConcurrencyConflict(PipelineResult)` finds an
    `OptimisticLockingFailureException` anywhere in a failed task's cause chain and rethrows it.
  - `ExecutionCommandProcessor` calls it after marking the transaction for rollback. A new order
    cannot conflict, so the create path needs no change.
  - `OrderLifecycleCommandProcessor`'s private version is replaced by it; it did not unwrap the
    cause and only worked because the lifecycle row lock makes the conflict unlikely.

  The caller then retries (Kafka) or gets 409 (REST), as before. AC-3 is proven through the fill
  pipeline: `OrderVersionIntegrationTest#fillConflictingWithAConcurrentWriterIsRethrownNotRefused`
  plants the next event version, as a concurrent writer would have, and posts a fill over REST. The
  result must be 409 `concurrent-modification` with no execution row. `PipelineResultsTest` covers
  the unwrapping.

## Risks & Mitigations

| Risk | Mitigation |
|---|---|
| A future code path writes `orders` without appending an event, so a concurrent write goes undetected | `Order#txNr` Javadoc and `domain/order.md` state the rule. `OrderVersionIntegrationTest` asserts txNr = latest event version after every command type |
| The order passed to the appender is a detached copy, so the new `tx_nr` is not written | Every caller passes the instance returned by `save`/`saveAndFlush` or the pipeline's managed order. AC-1's test reads the row back after each command |
| A non-contiguous legacy log makes `txNr + 1` collide with an existing version | The migration sets `tx_nr` to the max version, so the next one is max + 1, as before |
| Flushing in the appender changes the statement order | All writes are in one transaction. Only the moment a conflict is detected moves earlier, which is intended |
| oms-ui users see `txNr` one higher | Documented; the field is display-only |

## Test Strategy

| AC | Level (unit / web-mvc / integration / e2e) | Test class#method | What it asserts |
|---|---|---|---|
| AC-1 | integration | `OrderVersionIntegrationTest#txNrIsTheLatestEventVersionAfterEveryCommand` (new, extends `AbstractFillFlowIntegrationTest`) | An order created over REST, accepted over Kafka, filled over REST and Kafka, then cancel-requested and cancelled. After each command, `txNr` equals the max `order_events.version` and the expected sequence. The outbox and `oms_orders` messages carry the same `eventId`. Existing `txNr` delta assertions in `ExchangeWorkflowIntegrationTest`, `EventSourcingIntegrationTest`, `OrderLifecycleIntegrationTest` and `ProjectionIntegrationTest` still pass |
| AC-2 | unit | `OrderEventAppenderTest#appendsTheOrdersNextVersionWithoutQuerying` (new) | The appender uses the order's `txNr + 1`, sets it on the order, saves the event with that version, and never calls a max-version query: no interaction with `OrderEventRepository` other than `saveAndFlush`. The method `findMaxVersionByOrderId` is removed, so it does not compile if reintroduced |
| AC-3 | unit + integration | `OrderEventAppenderTest#versionConflictBecomesOptimisticLockingFailure`, `#otherConstraintViolationsPropagate`; `OrderVersionIntegrationTest#concurrentWritersAppliedOnceThenRetried` | Unit: a violation of `uq_order_events_order_id_version` is rethrown as `OptimisticLockingFailureException`; a `command_id` violation is not. Integration: two transactions load the same order and each applies a different fill through the pipeline in parallel. Exactly one commits; the other fails with `OptimisticLockingFailureException` and leaves no event, execution or outbox row. Re-running the loser applies it, and `cumQty` is the sum with contiguous versions |
| AC-4 | integration | `UnifiedOrderVersionMigrationIntegrationTest#migrationSetsTxNrToTheLatestEventVersion` (new, the pattern of `CommandIdBackfillMigrationIntegrationTest`/`DecimalPrecisionMigrationIntegrationTest`) | Migrate to the tag, insert an order with `tx_nr = 7` and events 1–3, plus an order without events. After the remaining changesets: 3 and 0. Appending to the first gives version 4 |
| AC-5 | integration | `OrderVersionIntegrationTest#queryApiReportsTxNrEqualToEventVersion`; existing `ExchangeWorkflowIntegrationTest#queryApi_reportsTheLatestEventVersion` | `GET /orders/{id}` and `GET /orders` return `txNr == eventVersion` for orders with events. `OrderEventRepository` no longer has `findLatestVersions`, so the query cannot be issued |
| AC-6 | unit + integration | `OrderReplayServiceTest#replaySetsTheVersionFromTheEvent` (new); `OrderVersionIntegrationTest#replayMatchesTheStoredOrderIncludingVersion` | A snapshot with an old `txNr` is returned with the event's version. After the AC-1 sequence, replay equals the row's state, quantities and `txNr` |

## Policy Compliance

| Policy | Title | Status | How / Justification |
|---|---|---|---|
| P-01 | Contracts live only in oms-contracts | n/a | No contract change |
| P-02 | Specification before code, generated models only | n/a | No API or message change |
| P-03 | Never edit generated code | n/a | None involved |
| P-04 | Contracts evolve compatibly | comply | No shape change; the value of `txNr` is documented. `eventId`/`orderVersion` unchanged |
| P-05 | Every state change is recorded in the event log | comply | Unchanged one event per command. The version is now the order's own, so the order row names the event that produced it |
| P-06 | Kafka only through the transactional outbox | comply | Outbox rows unchanged |
| P-07 | Schema changes through new Liquibase changesets | comply | New `010-unify-order-version.yaml` (021 tag, 022 data update); no edits to 001–009 |
| P-08 | Concurrency and idempotency are explicit | comply | Optimistic concurrency through the unique `(order_id, version)` on the event log, flushed and translated in the appender. The lifecycle row lock is kept. AC-3 proves one winner and a full rollback |
| P-09 | Commands and queries stay separate | comply | The query side reads the version from the row; no command logic in queries |
| P-10 | State transitions go through the state machine and task pipeline | comply | No transition changes |
| P-11 | Layering and conventions | comply | Changes stay in the appender, the entity, the repository and the query service |
| P-12 | Jackson 3 only | n/a | No Jackson use |
| P-13 | Errors and validation follow the framework specs | comply | A conflict keeps its 409 `concurrent-modification` problem and Kafka retry |
| P-14 | Test first, every acceptance criterion is proven by an automated test | comply | Test Strategy above |
| P-15 | Observability | comply | The conflict is logged by the existing handler; no new flow |
| P-16 | Security | n/a | No exposure change |
| P-17 | Simplicity and dependencies | comply | Removes a query and a sequence; no dependency |
| P-18 | Modules build standalone | comply | oms-core only |
| P-19 | Documentation follows behaviour | comply | Knowledge Base Updates below |

## Knowledge Base Updates

- `domain/order.md` — `txNr` is the version of the order's last event, set by the appender; the
  rule that every order write appends an event.
- `capabilities/event-sourcing-and-replay.md` — one version sequence; optimistic concurrency
  through the event log; replay sets the version.
- `interfaces/query-api.md` — `txNr` equals `eventVersion`; the value change.
- `domain/outbox-message.md` — `aggregateVersion` is the order's version.
- `architecture/event-sourcing.md`, if it describes the two sequences.
