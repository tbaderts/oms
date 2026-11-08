# Proposal — SPEC-0048: Make oms-core safe to run with several instances

> **Stage 1 of 3 — why and what, not how.** The acceptance criteria below are the contract that
> the verify stage checks. If they are vague, the goal cannot be proven met.

## Why

oms-core is correct with one instance only (review
`oms-core/docs/event-sourcing-cqrs-review-2026-11-07.md`; target architecture sections 3, 5.2, 6.1
and 9):

- **Three concurrency strategies (F-5, severity H).** Lifecycle commands lock the order row. Fills
  check only the version, so a lost race becomes an `OptimisticLockingFailureException`. On Kafka
  that failure uses the retry budget and can **dead-letter a fill after four attempts**.
- **The relay assumes one instance (F-6, H).** Its per-aggregate ordering relies on in-process
  state (`inFlight`). Two instances draining together could publish an aggregate's records out of
  order.
- **Publication latency has a 200 ms floor (F-7, M).** The relay waits for its poll. A backlog
  drains one batch per poll.
- **One consumer thread, topics not declared (F-8, M).** Partition counts are whatever the broker
  defaults to.
- **Schedulers run everywhere (F-16, L).** End of day and GTD expiry run in every instance;
  command-id dedup is the only thing preventing double work.

Scaling out, or simply running two instances for availability, is unsafe until these are fixed.
SPEC-0022 (order trees) builds on the root lock this ticket introduces.

## What Changes

- **Lock first everywhere.**
  - The fill pipeline loads its order with the row lock (`findLockedByOrderId`), as the lifecycle
    pipeline already does. Accept takes the lock through the lifecycle pipeline since SPEC-0046.
  - Once trees exist, the lock is the root order's (SPEC-0022). Today every order is its own root.
  - The `(order_id, version)` check stays as the safety net. Concurrent fills on one order wait,
    instead of failing.
- **Concurrency failures don't consume the dead-letter budget.** On the Kafka listener, a
  `ConcurrencyFailureException` is retried with capped backoff until it succeeds. Every other
  failure keeps today's retry-then-dead-letter rule.
- **One outbox relay leader.** It is elected with a PostgreSQL advisory lock. Other instances skip
  draining. Health reports whether this instance holds the relay leadership. If the leader goes
  away, another instance takes over. Hash-partitioned relay slices are written down as the next
  step, not built.
- **Faster publication.** After a command commits, its instance nudges the relay to drain at once.
  A drain loops while its batch was full. The poll stays as the fallback for crashes and for other
  instances' commits.
- **Topics and listener.**
  - **Declared topics.** The four topics (`commands`, `oms_orders`, `oms_executions`,
    `oms_order_executions`) are declared with configurable partition counts.
  - **Listener concurrency** equals the partition count of `commands`.
  - **Per-key order** stays safe: the key is the root order id, and the root lock serialises each
    key.
- **One scheduler leader.** End of day and GTD expiry run only on the instance holding their
  advisory lock.
- **Proof.** Integration tests run two application contexts against one database and one broker.

## Scope

### In scope

- The fill pipeline's root lock, and the listener's error-handler rule for concurrency failures.
- An advisory-lock leader helper, used by the relay and the schedulers, with a health indicator.
- The commit nudge and draining loop.
- Topic declarations and listener concurrency.
- A two-context integration test base, and the contention test.
- Knowledge base: event publication, outbox, operations and deployment pages.

### Out of scope

- Building hash-partitioned relay slices. They are designed and documented only.
- Pooled sequences and pointer outbox rows (SPEC-0047).
- Order trees (SPEC-0022). The lock is taken on the order, which is its own root today.
- Kubernetes or compose changes that run two instances by default.

## Acceptance Criteria

- **AC-1** — Given a LIVE order of quantity 100, when 10 fills of 10 are applied to it concurrently
  from 10 threads through the fill pipeline, then every fill applies, the order ends FILLED with
  cumQty 100, its event versions are contiguous, and no `OptimisticLockingFailureException` is
  thrown.
- **AC-2** — Given a Kafka command whose processing throws `ConcurrencyFailureException` more times
  than `kafka.consumer.retry-attempts`, when it is consumed, then it is applied once the failures
  stop, and nothing is sent to `commands.DLT`. Given a command that fails with any other exception,
  then it is still dead-lettered after the retry budget, as today.
- **AC-3** — Given two application contexts on one database and broker, when both are running,
  then:
  - exactly one reports relay leadership in `/actuator/health`, and only that one publishes outbox
    rows;
  - when the leader context closes, the other reports leadership and publishes the pending rows
    within 10 seconds.
- **AC-4** — Given the relay poll interval set to 10 seconds, when a command commits, then its
  records reach Kafka within 1 second. Given more pending rows than `kafka.outbox.batch-size`, when
  the relay drains, then all of them are published without waiting for another poll.
- **AC-5** — Given a fresh broker, when oms-core starts, then the four topics exist with their
  configured partition counts, and the command listener's concurrency equals the partition count of
  `commands`. Given an existing topic with fewer partitions, then oms-core does not change it and
  logs a warning naming the topic and both counts.
- **AC-6** — Given two application contexts with their schedulers enabled, when both trigger GTD
  expiry and end of day for the same due orders, then each order gets exactly one `EXP` and one
  `CLOSE` event, and only the leader logs scheduler commands in the command log.
- **AC-7** — Given two application contexts both consuming `commands`, when 50 fills for one order
  and 50 fills spread over 10 orders are sent, then:
  - no fill reaches `commands.DLT`;
  - every order's cumQty equals the sum of its fills;
  - on each topic, the records of each key are published in event-version order.

  The scenarios of `OrderVersionIntegrationTest` and `OutboxHoldIntegrationTest` also pass with two
  contexts.

## Impact

| Area | Impact |
|---|---|
| Modules | oms-core, oms-knowledge-base (set on the ticket) |
| Contracts (OpenAPI / Avro) | None |
| Data (tables, migrations) | None. Advisory locks need no schema |
| Events / Kafka topics | The four topics are declared by oms-core with configurable partition counts. Records, keys and per-key order are unchanged; publication usually happens within milliseconds of the commit instead of up to 200 ms |
| Consumers (oms-ui, oms-mcp-server, downstream) | None in content. A fresh broker gets more partitions per topic, and consumers keep per-key order |
| Knowledge base | `capabilities/event-publication.md`, `domain/outbox-message.md`, `interfaces/kafka-topics.md`, an operations note on running several instances, and the relay-slices design |

## Open Questions

- [resolved] What should happen to topics that already exist with fewer partitions? →
  assumption: oms-core creates missing topics with the configured counts (default 6 each) and
  never resizes an existing one. Adding partitions remaps keys to partitions and would break
  per-key order for records in flight. A resize stays an operator step: drain, resize, restart. It
  is logged as a warning (AC-5). **Please confirm the default of 6 and this rule at approval.**
- [resolved] Is SPEC-0047 a hard prerequisite? → assumption: no. This ticket keeps `outbox_seq`
  unpooled, and the root lock serialises each aggregate's commits, so ids within an aggregate still
  follow commit order. Either ticket can land first. If SPEC-0047's several-instance ordering check
  moves here (proposed there), AC-7's per-key order assertion covers it.
- [resolved] Should concurrency failures retry without limit? → assumption: yes, with backoff
  capped at 5 seconds. A conflict cannot be a poison message, and it ends when the competing
  command commits. A command still conflicting after 10 minutes is logged at ERROR each retry so
  it is visible.
- [resolved] How is the leader lost? → assumption: a session-level advisory lock held on a
  dedicated connection. If that connection breaks or the instance stops, PostgreSQL releases the
  lock and another instance takes it on its next attempt (AC-3).
