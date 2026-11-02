# Proposal — SPEC-0026: Isolate failing aggregates in the outbox relay

> **Stage 1 of 3 — why and what, not how.** The acceptance criteria below are the contract that
> the verify stage checks. If they are vague, the goal cannot be proven met.

## Why

Finding 7 of the architecture review (`oms-core/docs/architecture-review-2026-10-30.md`, §8 table;
[ticket Goal](./ticket.md)).

`OutboxRelay.drain` claims up to 100 rows in id order and publishes them one at a time, blocking
on each broker acknowledgement. On the first failed send it stops the whole batch, to keep a later
row of the same order from overtaking the failed one. The cost of that rule:

- **One poison message stalls everyone.** A row that cannot be published (for example, a payload
  the serializer rejects, or a subject missing in the registry) is retried on every poll until it
  exhausts its 10 attempts. Until then, every row behind it, of every order, waits. That is about
  ten polls of standstill for the whole OMS, caused by one order.
- **Throughput is capped by round trips.** One synchronous send per row means one broker round trip
  per message: roughly 500 messages per second per instance at a 2 ms round trip, whatever the
  batch size.
- **No early warning.** `oms.outbox.pending` counts rows but says nothing about how long they have
  waited. A stalled relay and a busy one look the same until the stuck gauge moves, ten polls later.

The ordering rule the stop protects is real, but it only concerns the rows of the failed order. A
failure should hold back that order, not everyone.

## What Changes

- **Isolation.** When a row fails, only the later rows of the same **aggregate** (the same topic
  and Kafka key, so the same partition and the same ordering scope) are held back for the rest of
  the batch. Every other aggregate's rows are published as usual. The failed row keeps its attempt
  count and is retried on the next poll, as today.
- **Asynchronous send.** The relay sends the batch without waiting for each acknowledgement, then
  awaits the outcome before committing. Rows of different aggregates are in flight together.
  Within one aggregate, a row is published only after the row before it was acknowledged, so a
  failure can never let a later row of the same aggregate reach Kafka ahead of an earlier one. Rows
  are deleted only after their acknowledgement, as today.
- **A stuck row holds its aggregate.** Today a row that exhausts its attempts is skipped for good,
  and the next poll publishes the rows behind it, out of order. Now the later rows of that
  aggregate stay in the outbox with the stuck row until an operator resolves it. Other aggregates
  are unaffected (see Open Questions).
- **Gauge.** `oms.outbox.oldest.age` reports the age in seconds of the oldest row still waiting to
  be published (0 when there is none).
- **Docs.** The event-publication capability and the outbox pages describe the per-aggregate
  isolation, the held aggregate and the new gauge.

## Scope

### In scope

- `OutboxRelay` (claiming, sending, failure handling), `MessagePublisher` (an asynchronous send),
  the outbox repository query, the new gauge.
- Knowledge base: `capabilities/event-publication.md`, `domain/outbox-message.md`,
  `architecture/transactional-outbox.md` where it describes the relay.

### Out of scope

- Ordering across several relay instances. `SKIP LOCKED` lets a second instance claim later rows
  of an order whose earlier rows the first instance holds. oms-core runs one relay per deployment
  today; making several safe (for example, partitioning the claim by aggregate) is a separate
  change.
- Replaying or deleting stuck rows (an operator tool or endpoint).
- Batch size, poll interval and attempt budget: unchanged defaults.
- Ordering across topics, which was never promised (`interfaces/kafka-topics.md`).

## Acceptance Criteria

- **AC-1** — Given a batch with rows of aggregates A and B (interleaved in id order), when the send
  of A's first row fails, then:
  - every row of B is published and deleted in the same drain;
  - no later row of A is sent;
  - A's failed row is still in the outbox with its attempt count incremented and the error
    recorded.
- **AC-2** — Given several rows of one aggregate, when they are drained (with or without a failure
  in the batch), then they reach the broker in id order. A row is never published while an earlier
  row of the same aggregate (same topic and key) is unpublished in the outbox. This holds for a
  failure that surfaces when sending as well as one that surfaces while awaiting the
  acknowledgement.
- **AC-3** — Given rows of many aggregates and a broker acknowledgement that takes time, when a batch
  is drained, then the rows of different aggregates are in flight at the same time, and the drain
  completes in about the time of the slowest aggregate's chain of acknowledgements, not the sum of
  all of them. Given the existing integration suites, publication still works end to end on a real
  broker, keyed and ordered as before (`OrderExecutionPublicationIntegrationTest`).
- **AC-4** — Given an aggregate whose earliest row has exhausted its attempts, when later polls run,
  then:
  - the later rows of that aggregate are not published and stay in the outbox;
  - the rows of other aggregates are published;
  - `oms.outbox.stuck` still counts the stuck row.
- **AC-5** — Given pending rows, when `oms.outbox.oldest.age` is read, then it reports the age in
  seconds of the oldest row that is still to be published (attempts below the limit), and 0 when
  there is none. It is exposed on `/actuator/prometheus`.

## Impact

| Area | Impact |
|---|---|
| Modules | oms-core, oms-knowledge-base |
| Contracts (OpenAPI / Avro) | None |
| Data (tables, migrations) | Possibly an index on `outbox (topic, aggregate_id)` for the held-aggregate query; no data change (decided in the design) |
| Events / Kafka topics | Same topics, keys and payloads. Per-aggregate order is preserved; rows of different aggregates may now reach the broker in a different relative order than their ids, which no consumer may rely on (ordering is per key) |
| Consumers (oms-ui, oms-mcp-server, downstream) | No change. A failure of one order no longer delays the others' messages |
| Knowledge base | `capabilities/event-publication.md`, `domain/outbox-message.md`, `architecture/transactional-outbox.md` |

## Open Questions

- [resolved] What is an "aggregate" for isolation: the order (`aggregateId`) or the topic and key?
  → **topic and key**. Kafka orders records per partition, and the key picks the partition per
  topic, so a failure on `oms_executions` need not hold `oms_orders` for the same order. Ordering
  across topics was never promised.
- [resolved] Should the rows behind a stuck row stay held (new) or be published past it (today)?
  → assumption: **held**. Publishing past it puts a later state of the order on Kafka before an
  earlier one, and the earlier one may later be replayed by an operator, out of order. Holding
  delays one order until someone acts, which is visible: the stuck gauge, the new age gauge and
  the error log. **Please confirm at approval**; the alternative is to keep today's behaviour.
- [resolved] Should rows of one aggregate also be pipelined, several in flight at once, relying on
  the idempotent producer? → assumption: **no**. A failure that surfaces when sending (for example,
  a serializer error) does not stop the producer sending the next record of the same key, so only
  waiting for each acknowledgement guarantees AC-2. Parallelism comes from different aggregates.
- [deferred] Several relay instances → out of scope, see Scope. Safe to defer while one instance
  runs.
