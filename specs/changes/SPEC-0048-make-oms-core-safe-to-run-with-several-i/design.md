# Design — SPEC-0048: Make oms-core safe to run with several instances

> **Stage 2 of 3 — how.** Concrete enough that the plan can be written without re-reading the
> code, and checked line by line against the architecture policies. Write "None — <reason>" for a
> section that genuinely does not apply.

## Context

- **Fill path.** `ExecutionCommandProcessor.loadOrder` reads the order with `findByOrderId`, with no
  lock. Two fills on one order race to the next `order_events` version, and the loser gets an
  `OptimisticLockingFailureException` (SPEC-0027). The lifecycle pipeline, which includes accept
  since SPEC-0046, already loads with `OrderRepository.findLockedByOrderId` (`PESSIMISTIC_WRITE`).
- **Kafka errors.** `KafkaConsumerConfig.commandErrorHandler` is a `DefaultErrorHandler` with
  exponential backoff and `retry-attempts` (4), then `DeadLetterPublishingRecoverer` to `<topic>.DLT`.
  `IllegalArgumentException` and `DeserializationException` are not retryable. A concurrency
  failure is retried and then dead-lettered like any other exception.
- **Relay.** `OutboxRelay.drain` is `@Scheduled(fixedDelay = poll-interval-ms 200)` and
  `@Transactional`. It claims with `claimPending` (`FOR UPDATE SKIP LOCKED`, ordered by id) and
  publishes each aggregate's rows in a chain. Its `inFlight` set is in-process, and its Javadoc
  states ordering holds for one instance. One batch is drained per poll.
- **Schedulers.** `EndOfDayScheduler` runs end of day (cron) and GTD expiry (fixed delay) on its own
  one-thread scheduler in every instance.
- **Topics.** Nothing declares the topics. The test base `AbstractKafkaPostgresIntegrationTest`
  pre-creates the outbound topics with 3 partitions. The listener has default concurrency (1).
- **Health.** `show-details: when_authorized`; there is no custom health indicator.
- **After-commit hooks** exist: `OrderFlowMetrics.afterCommit` registers a
  `TransactionSynchronization`.

**Closest examples followed.**
- After-commit hook: `OrderFlowMetrics`.
- Error-handler wiring: `KafkaConsumerConfig`.
- Test base with singleton containers: `AbstractKafkaPostgresIntegrationTest`.
- Admin client usage: its `createOutboundTopics`.

**Specs read:** target architecture sections 3, 5.2, 6.1, 9; review F-5 to F-8 and F-16;
`streaming-architecture.md`; `testing-patterns.md`.

## Approach

### 1. Lock first in the fill pipeline (AC-1)

`ExecutionCommandProcessor.loadOrder` uses `orderRepository.findLockedByOrderId(rootOrderIdOf(orderId))`.
Today the root is the order itself, so the lookup is the same id. A comment marks where SPEC-0022
changes it to the root.
- **Concurrent fills now wait.** A second fill on the same order waits for the first to commit,
  then reads the committed quantities and applies on top.
- **The version check stays** in the appender, as the safety net.
- **Accept** already takes the lock in the lifecycle pipeline (SPEC-0046).

### 2. Concurrency failures retry without the dead-letter budget (AC-2)

`commandErrorHandler` gets a back-off function:

```java
errorHandler.setBackOffFunction((record, ex) -> isConcurrencyFailure(ex) ? concurrencyBackOff : null);
```

- **`concurrencyBackOff`** is an `ExponentialBackOff(initialInterval, 2.0)` with
  `maxInterval = kafka.consumer.concurrency-max-interval-ms` (default 5000) and no maximum number
  of attempts.
- **Other exceptions** fall back to the existing bounded back-off (`null` means the default).
- **`isConcurrencyFailure`** walks the cause chain (the container wraps the listener's exception)
  for `org.springframework.dao.ConcurrencyFailureException`.
- **A retry listener** logs each concurrency retry at WARN. From
  `kafka.consumer.concurrency-error-after-attempts` (default 120, about 10 minutes at the 5 s cap)
  it logs at ERROR, with the topic, partition, offset and attempt.

### 3. Leadership with PostgreSQL advisory locks (AC-3, AC-6)

New `org.example.oms.service.leadership.Leadership` component and `Role` enum:
`OUTBOX_RELAY` (lock key `0x4F4D5301`) and `SCHEDULER` (`0x4F4D5302`).

- **A dedicated connection.** It is opened from the application's `DataSourceProperties`,
  outside the Hikari pool, so the pool keeps its full size. It is held open for the instance's
  lifetime. Session-level advisory locks belong to that connection.
- **`boolean holds(Role role)`**:
  - if the role is held and the connection is valid (`isValid(1)`), return true;
  - otherwise run `select pg_try_advisory_lock(?)` and remember the result.
  - On any `SQLException`, the connection is closed and replaced on the next call, and the role is
    reported as not held. A broken connection cannot leave a false leader: PostgreSQL released the
    lock with the session.
- **Shutdown.** `@PreDestroy` releases both locks and closes the connection, so a stopped leader
  hands over at once (AC-3).
- **Thread safety.** All calls are `synchronized`. They are rare and cheap: once per relay poll and
  per scheduler run.
- **Health.** A `LeadershipHealthIndicator` (`leadership`) is always `UP`, with details
  `outboxRelay: true|false` and `scheduler: true|false`. It is exposed with details in a health
  group: `management.endpoint.health.group.leadership.include=leadership` and
  `show-details: always`. `GET /actuator/health/leadership` therefore shows it without
  authorization; leadership is not sensitive.
- **`EndOfDayScheduler`** runs `endOfDay` and `expireDueGtd` only when
  `leadership.holds(SCHEDULER)`, and logs at DEBUG when it skips.

### 4. Relay: one leader, nudged after commit, draining while full (AC-3, AC-4)

`OutboxRelay` is restructured. Batch processing is unchanged.

- **`@Scheduled poll()`** calls `drainAll()`. It is the fallback.
- **`nudge()`** submits `drainAll()` to a one-thread executor, coalesced. If a nudge is already
  queued, a second one is dropped.
- **`drainAll()`**:
  - returns at once unless `leadership.holds(OUTBOX_RELAY)`;
  - otherwise takes an in-process `ReentrantLock` with `tryLock`. If another drain is running, it
    sets `again = true` and returns. Two drains of one instance must never claim rows concurrently:
    `SKIP LOCKED` would let the second claim later rows of an aggregate the first holds.
  - With the lock, it loops: run one batch in its own transaction (`TransactionTemplate`, the
    existing body of `drain`, now `drainBatch()` returning the number claimed), and repeat while
    the batch was full and made progress. If `again` was set meanwhile, it runs once more.
- **The commit hook.** `OrderEventAppender` registers one after-commit synchronization per
  transaction that stages outbox rows (`OutboxNudge.afterCommit()`, the same pattern as
  `OrderFlowMetrics`). It calls `outboxRelay.nudge()` through an `ObjectProvider`, because the relay
  only exists when `kafka.enabled`.
- **The relay Javadoc** changes from "one instance" to "one *leader*". Other instances' relays do
  nothing, and per-aggregate order rests on there being exactly one drainer.

**Hash-partitioned relay slices (designed, not built).**
- **Shape.** N relay leaders, each holding the advisory lock `0x4F4D5310 + i` for slice `i`. A
  slice claims only rows with `abs(hashtext(aggregate_id)) % N = i`.
- **Why it keeps order.** All rows of an aggregate fall in one slice, so per-aggregate order holds
  with no shared state.
- **When.** Only once one relay is the measured ceiling (SPEC-0024).
- **Where.** Recorded in `capabilities/event-publication.md` as the next step.

### 5. Topics and listener concurrency (AC-5)

New `KafkaTopicProvisioner` bean (`config` package, `kafka.enabled` only).
- **At construction**, it uses an `Admin` client from `KafkaAdmin`'s configuration to describe
  `kafka.command-topic`, `kafka.order-topic`, `kafka.execution-topic` and
  `kafka.order-execution-topic`.
- **Missing topics** are created with `kafka.topics.partitions` (default 6) and
  `kafka.topics.replication-factor` (default 1).
- **An existing topic with fewer partitions** is not changed. A WARN is logged with the topic, the
  existing count and the configured count, and the proposal's rule that resizing is an operator
  step.
- **`commandPartitions()`** returns the actual partition count of the command topic after
  provisioning. `kafkaListenerContainerFactory` takes the provisioner and calls
  `factory.setConcurrency(provisioner.commandPartitions())`.
- **Kafka unreachable.** Within `kafka.topics.provision-timeout-ms` (default 30000) it logs an
  ERROR and falls back to the configured count, so a broker outage at startup degrades instead of
  failing.

Spring's `NewTopic` beans are not used, because `KafkaAdmin` raises the partition count of
existing topics. The rule here is the opposite.

### 6. Two-instance tests

- **`SecondInstance`** is a test helper. It starts a second `OmsApplication` context with
  `SpringApplicationBuilder`, on the same singleton Postgres and Kafka containers, with the same
  properties as the base class, `server.port=0` and `oms.end-of-day.enabled` as given. It closes in
  `@AfterAll`.
- **`OrderVersionTwoInstanceIntegrationTest`** and **`OutboxHoldTwoInstanceIntegrationTest`**
  extend the existing classes, so their tests are inherited, and keep a second instance up for the
  class.
- **`TwoInstanceIntegrationTest`** has the leadership tests (AC-3, AC-6) and the contention test
  (AC-7).

## Contract Changes

None. No OpenAPI or Avro change. Topic names, keys and records are unchanged.

## Data & Persistence

None. Advisory locks need no schema. `findLockedByOrderId` exists.

## Events & Messaging

- **`order_events`, outbox and relay** (P-05, P-06). Unchanged in content. The relay still
  publishes only staged rows. One leader drains, triggered by commit or poll.
- **Per-key ordering.** Within an aggregate, rows are staged under the root row lock, so their ids
  follow commit order. One leader drains, serially within the instance, so a later row of an
  aggregate is never claimed while an earlier one is in another drain.
- **Consumers.** The listener runs `commandPartitions()` consumers in the group. A key maps to one
  partition, hence to one consumer at a time, and the root lock serialises the same order across
  instances and paths (REST, Kafka, scheduler).
- **Redelivery.** Concurrency retries redeliver the same record. Its processing rolled back, so
  dedup (SPEC-0046) and the order state make the retry safe.

## Domain, State & Orchestration

No state machine or pipeline changes. The fill pipeline's load changes from an unlocked to a locked
read. Errors: unchanged. A REST fill that loses a deadlock still answers 409 concurrent-modification
(SPEC-0027).

## Alternatives & Decisions

- **Decision: advisory locks, not ShedLock or a leader table.**
  - Rejected: ShedLock, a new dependency (P-17).
  - Rejected: a table-row lease. It needs a heartbeat and a timeout to detect a dead leader.
  - A session-level advisory lock is released by PostgreSQL the moment the session dies.
- **Decision: a dedicated connection outside the pool.** Holding a pooled connection permanently
  would shrink the pool, and Hikari could recycle it (`maxLifetime`), silently dropping the lock.
- **Decision: provision topics ourselves instead of `NewTopic` beans.** `KafkaAdmin` would raise
  partition counts of existing topics, which the approved proposal forbids.
- **Decision: a back-off function for concurrency failures, instead of classifying them
  not-retryable.** They must be retried, just not counted against the dead-letter budget.
- **Decision: serialize drains in-process with `tryLock` plus an `again` flag.** A queue of drain
  requests is unnecessary, since one more drain covers every nudge that arrived meanwhile.
- **Decision: `OrderVersionIntegrationTest#concurrentFillsThroughThePipelineOneWaitsThenFails`
  becomes `…OneWaitsThenApplies`.** That is the behaviour AC-1 asks for: the second fill now waits
  on the row lock and applies.
- No new dependency or build change (P-17).

## Risks & Mitigations

| Risk | Mitigation |
|---|---|
| A held lock blocks fills longer than before | The lock covers only the fill transaction, which already held the event-version key. Waiting replaces failing and retrying, which cost more |
| Deadlock between a fill and a lifecycle command | Both lock the same single row first; no second row is locked before it. A deadlock surfaces as `ConcurrencyFailureException` and is retried (AC-2) |
| The leader's connection breaks and nobody notices | `holds` validates the connection each call. PostgreSQL drops the lock with the session, so another instance acquires it on its next poll |
| Two drains in one instance (poll and nudge) | Serialized by `tryLock` and the `again` flag |
| Unbounded retries hide a stuck command | WARN each retry, ERROR past the threshold, and `oms.commands.consumed{outcome=failed}` keeps counting attempts |
| Topic provisioning slows startup or fails without Kafka | Bounded timeout, then fall back to the configured concurrency with an ERROR |
| The second test context interferes with other test classes | It lives only for the two-instance classes and closes in `@AfterAll`. The consumer group rebalances back afterwards |

## Test Strategy

| AC | Level | Test class#method | What it asserts |
|---|---|---|---|
| AC-1 | integration | `OrderVersionIntegrationTest#concurrentFillsThroughThePipelineOneWaitsThenApplies` (changed); `TwoInstanceIntegrationTest#tenConcurrentFillsAllApply` (new; 10 threads, same order, one context) | All applied, FILLED, cumQty 100, contiguous versions, no conflict exception |
| AC-2 | unit + integration | `KafkaConsumerConfigTest#concurrencyFailureHasUnboundedBackOff`, `#otherFailuresKeepTheBudget` (new, on the error handler's back-off function); `OrderVersionIntegrationTest#kafkaFillRetriedAfterAConflict` extended: the conflict is held past `retry-attempts` (6 failures), then the fill applies, and `commands.DLT` stays empty for the key | Unbounded for conflicts, bounded for others; applied after more attempts than the budget; no dead letter |
| AC-3 | integration (two contexts) | `TwoInstanceIntegrationTest#exactlyOneRelayLeaderAndTakeover` (new) | `/actuator/health/leadership` shows outboxRelay true on one and false on the other; rows publish; after the leader closes, the other leads and publishes staged rows within 10 s |
| AC-4 | integration | `OutboxNudgeIntegrationTest#commitIsPublishedWithoutWaitingForThePoll`, `#backlogLargerThanABatchDrainsInOneGo` (new; poll interval 10 s, batch size 5) | A record on the topic within 1 s; 12 rows published with no poll in between |
| AC-5 | integration + unit | `KafkaTopicProvisionerIntegrationTest#createsMissingTopicsAndSetsListenerConcurrency`, `#leavesASmallerExistingTopicAloneAndWarns` (new) | Partition counts via `Admin`; the container's concurrency; the WARN log line names the topic and counts |
| AC-6 | integration (two contexts) | `TwoInstanceIntegrationTest#schedulersRunOnTheLeaderOnly` (new) | Both trigger; one EXP and one CLOSE per order; scheduler rows in the command log only from the leader (one row per order per job) |
| AC-7 | integration (two contexts) | `TwoInstanceIntegrationTest#contentionLeavesNothingDeadLettered` (new); `OrderVersionTwoInstanceIntegrationTest`, `OutboxHoldTwoInstanceIntegrationTest` (new subclasses running the existing tests with a second instance up) | No DLT records; cumQty sums; per-key eventId increasing on `orders`; the inherited tests pass |

Unit: `LeadershipTest` (acquire, hold, connection loss reported as not held, release),
`OutboxRelayTest` updated (a non-leader does nothing; serial drains; loop while full).

## Policy Compliance

| Policy | Title | Status | How / Justification |
|---|---|---|---|
| P-01 | Contracts live only in oms-contracts | n/a | No contract change |
| P-02 | Specification before code, generated models only | n/a | No API or message change |
| P-03 | Never edit generated code | comply | Nothing generated is touched |
| P-04 | Contracts evolve compatibly | n/a | No contract change; topics and records are unchanged |
| P-05 | Every state change is recorded in the event log | comply | The appender path is unchanged; locking changes only when a fill reads its order |
| P-06 | Kafka only through the transactional outbox | comply | The relay remains the only publisher; the nudge only triggers it |
| P-07 | Schema changes through new Liquibase changesets | n/a | No schema change |
| P-08 | Concurrency and idempotency are explicit | comply | Lock-first on every pipeline; the version check stays; concurrency retries are idempotent via dedup and state |
| P-09 | Commands and queries stay separate | comply | Unchanged |
| P-10 | State transitions go through the state machine and task pipeline | comply | Unchanged pipelines |
| P-11 | Layering and conventions | comply | `Leadership` service, config beans, a health indicator; constructor injection |
| P-12 | Jackson 3 only | n/a | No JSON code |
| P-13 | Errors and validation follow the framework specs | comply | Answers unchanged; a conflict is still 409 |
| P-14 | Test first, every acceptance criterion is proven by an automated test | comply | Table above |
| P-15 | Observability | comply | Leadership in health; retry logging; existing relay gauges keep working on the leader |
| P-16 | Security | comply | No secrets. The leadership health group exposes two booleans only |
| P-17 | Simplicity and dependencies | comply | No new library; advisory locks and Kafka's `Admin`, both already available |
| P-18 | Modules build standalone | comply | `spec verify` runs oms-core `check` |
| P-19 | Documentation follows behaviour | comply | Pages below |

## Knowledge Base Updates

- `oms-knowledge-base/capabilities/event-publication.md`: the relay leader, nudge and draining loop;
  the relay-slices design as the next step.
- `oms-knowledge-base/domain/outbox-message.md`: ordering under one leader.
- `oms-knowledge-base/interfaces/kafka-topics.md`: oms-core declares the four topics, partition
  defaults, the no-resize rule, listener concurrency.
- `oms-knowledge-base/capabilities/execution-processing.md`: fills lock the order first.
- An operations note on running several instances (leadership health, schedulers, resizing topics):
  in the page that documents deployment, or `capabilities/event-publication.md` if there is none.

### Changed during implementation

- **Leader-elected tests run in a world of their own.** Cached test contexts share one database, so
  the first to take relay leadership drains for all of them; a context with a slow poll starved the
  others. Advisory locks are per database, so the nudge and two-instance tests run in databases
  `oms_<name>` with their own command topic and consumer group
  (`AbstractKafkaPostgresIntegrationTest.isolate` and `isolatedDatabaseUrl`).
  - Spring runs a test class's `@DynamicPropertySource` methods subclass first and the base's last,
    so a subclass cannot override the base's values. It asks the base, through a thread-local read
    during registration. `OutboxNudgeIntegrationTest#runsInItsOwnDatabaseAndTopic` guards this.
- **The health contributor is `instanceRoles`**, shown by the `leadership` group at
  `/actuator/health/leadership`. A contributor may not share its name with a group.
- **`SecondInstance` passes its settings as command-line arguments.**
  `SpringApplicationBuilder.properties` sets defaults, which `application.yml` outranks. The second
  instance took port 8090 and the configured database.
- **Takeover and scheduler tests start two further instances in their own databases**, not the
  test's context plus one. The test's own context can neither be stopped nor guaranteed to be a
  follower.
- **`OrderVersionTwoInstanceIntegrationTest` sums the failed-attempt counter over both instances.**
  With two consumers, a command's failed attempts are counted by whichever instance consumed it;
  `OrderVersionIntegrationTest#failedFills` became protected for this.
- **`Leadership` is a `SmartLifecycle` that releases its roles when the context stops**, and takes
  none until started again. Stopping is phased first in shutdown, so a successor takes over at once
  instead of waiting for the session to end.
  - Found by the full suite: Spring 7 pauses cached test contexts by stopping their lifecycle beans,
    including the relay's scheduler. A paused context kept its advisory lock while no longer
    draining, so nothing published.
  - Production has the same shape: an instance shutting down should not stay leader while its relay
    stops. `LeadershipTest#aStoppedInstanceReleasesAndTakesNothingUntilStarted` covers it.

### Changed after the independent review: leader handover

The review found that two relays could drain at once during a handover, and that the claim then
published an aggregate's later rows first:
- the relay checked leadership once per `drainAll`, then kept draining batches;
- `Leadership.stop()` released the lock without waiting for a running drain;
- `claimPending` used `SKIP LOCKED`.

The fix has four parts.

1. **The claim waits instead of skipping.** `claimPending` takes `FOR UPDATE` without
   `SKIP LOCKED`. With one intended drainer, skipping buys nothing. A successor that overlaps the
   old leader waits for the old leader's claiming transaction, then sees exactly the rows it left,
   so it can never claim an aggregate's later rows past rows the old leader holds.
   `OutboxClaimIntegrationTest` proves the second claim blocks rather than skipping.
2. **Leadership is re-checked before every batch,** not once per drain.
3. **The relay stops before leadership is released.** `OutboxRelay` is a `SmartLifecycle` with a
   higher phase than `Leadership`, so it stops first. Its `stop()`:
   - refuses new nudges and drains;
   - waits, up to `drain-timeout-ms`, for a running drain and for sends still in flight;
   - only then lets `Leadership.stop()` release the lock.

   A clean handover therefore leaves nothing in flight. After session loss in the middle of a
   drain, the blocking claim still keeps order. The old producer may deliver a timed-out send late,
   as a duplicate of an older version, which consumers already drop: they deduplicate on the
   version (at least once).
4. **Leadership connection hygiene.** A session that fails `isValid(5)` is closed before a new one
   is opened, so an orphaned session cannot keep the lock. The dedicated connection is opened with
   `tcpKeepAlive=true` and a `socketTimeout`, so a partitioned leader's session dies in minutes,
   not hours. Operators set `tcp_keepalives_idle` on the server (operations note).

**Observability (P-15)** gains two meters:
- `oms.outbox.drains`, counting batches claimed per instance;
- `oms.leadership.held{role}`, a gauge that is 1 while the instance holds the role.

**Tests strengthened, as the review asked:**
- **AC-2:** a retryable non-concurrency failure reaches the DLT after the budget
  (`CommandRetryBudgetIntegrationTest`).
- **AC-3:** the follower claims nothing (its `oms.outbox.drains` stays 0), and takeover plus
  publication fit one 10 s budget.
- **AC-6:** per-instance end-of-day counters, with both instances triggered at once.
- **AC-7:** version order on all three topics; cumQty asserted for every order.
- **AC-5:** the WARN check matches the counts in context.

Also from the review, two fixes:
- the provisioner treats `TopicExistsException` (two instances starting together) as success.
  Its test, which starts four provisioners at once, then found a second race: the instance that
  lost could describe the topic before the broker knew it, getting
  `UnknownTopicOrPartitionException`. The describe is now retried within the same timeout;
- the contention test's unused `root` parameter is removed.
