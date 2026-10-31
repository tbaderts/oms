# Proposal — SPEC-0018: Fix outbox key, audit and dedup defects

> **Stage 1 of 3 — why and what, not how.** The acceptance criteria below are the contract that
> the verify stage checks. If they are vague, the goal cannot be proven met.

## Why

The architecture review of 2026-10-30 (`oms-core/docs/architecture-review-2026-10-30.md`, §8,
findings 1–5) lists five small defects. They sit in the code that the projection and order-tree
work (SPEC-0019 to SPEC-0023) will build on, so the review's roadmap puts this ticket first
([ticket Goal](./ticket.md)). This is how the system behaves today:

1. **Execution key.** `OrderEventAppender.appendExecutionEvent` stages each fill with
   `aggregateId = execID`, and `MessagePublisher` uses `aggregateId` as the Kafka key. So two fills
   of one order can land on different partitions of `oms_executions`, and a consumer can see them
   out of order. The knowledge base already says the key is `orderId`
   (`oms-concepts/booking-integration.md` §3.2), and `interfaces/kafka-topics.md` documents no key
   at all.
2. **REST fills lose their command.** `CommandController` calls
   `executionCommandProcessor.process(execution)`, the command-less overload, so the
   `order_events.transaction` of a fill received over REST is `null`. Fills received over Kafka
   keep their command. This is an audit gap, and it rules out replaying the log by command.
3. **Streaming snapshot deduplication.** When a client subscribes with a snapshot,
   `KafkaEventStreamProvider` maps the query DTO's database `id` to `eventId`. Live events carry
   the per-order event version in `eventId`. The two numbers have nothing to do with each other.
   The snapshot set also ignores `orderId`, so version 3 of order A suppresses a live event with
   version 3 of order B. A subscriber can therefore receive a duplicate or stale update, or miss a
   real one.
4. **Deduplication cost.** `DeduplicateCommandTask` loads and deserialises the order's whole event
   history on every lifecycle command, so the cost grows with the order's age. The check-then-act
   also has a race: two copies of the same command processed at the same moment can both pass it.
5. **Tree finder.** `OrderRepository.findByRootOrderId` returns `Optional<Order>`. It will throw as
   soon as a root has more than one order under it, and there is no way to find an order's
   children. Nothing calls it yet. The tree tickets will.

If nothing is done, consumers can process one order's fills in the wrong order. The audit log also
has holes, the trade blotter can show wrong rows right after subscribing, lifecycle commands get
slower with every event an order collects, and the tree work starts from a finder that cannot work.

## What Changes

- **Execution messages are keyed by `orderId`.** Every record on `oms_executions` carries the
  fill's `orderId` as its Kafka key, as records on `oms_orders` already do. All messages of one
  order therefore go to the same partition of each topic. The payloads do not change.
- **Every topic's key is documented** on `oms-knowledge-base/interfaces/kafka-topics.md`:
  `commands` (the producer's `orderId`), `oms_orders` and `oms_executions` (`orderId`).
- **REST fills record their command.** A fill posted as `ExecutionCreateCmd` is stored in
  `order_events.transaction`, as fills received over Kafka already are.
- **The query API's `OrderDto` gets `eventVersion`**: the order's latest event-log version, the
  same number its newest `oms_orders` message carries as `eventId`. This is an additive, optional
  field in `oms-query-api.yml`.
- **The streaming snapshot deduplicates per order on the event version.** After the snapshot, a
  live order event is dropped when its `eventId` is at or below the snapshot's `eventVersion` for
  the same order. Live events for other orders, and newer events, pass.
- **Lifecycle deduplication uses a stored `command_id`.** `order_events` gets a `command_id`
  column with a unique index on `(order_id, command_id)`. It is filled from the command's
  `commandId` for every event whose command has one, and backfilled for existing rows. A
  lifecycle command whose `commandId` the order has already applied is refused, as today: REST
  answers `400 FAILED` and Kafka acknowledges it without a retry. The order and its log stay
  unchanged. The check no longer reads the order's event history, and two concurrent copies of a
  command cannot both be applied.
- **`OrderRepository.findByRootOrderId` returns a `List<Order>`**, and a new
  `findByParentOrderId` returns an order's direct children.
- No **BREAKING** changes. The query field is additive. The execution key change keeps every
  payload as it is, and only strengthens ordering: no consumer reads the key today (oms-streaming-service
  takes `orderId` from the payload). Records keyed by `execId` that are already on the topic stay
  where they are.

## Scope

### In scope

- Findings 1–5 of the review's §8, as described above.
- The KB pages these findings touch: `interfaces/kafka-topics.md` (keys);
  `oms-concepts/booking-integration.md` §3.2 (check that it matches); the dedup description in
  `functional-requirements/FR-010-deduplicate-lifecycle-commands.md` and
  `non-functional-requirements/NFR-001-idempotent-command-handling.md`; the query `OrderDto` and
  the streaming snapshot in `oms-concepts/streaming-architecture.md`, where they describe it.

### Out of scope

- Keying by `rootOrderId`. The tree tickets (SPEC-0022/0023) switch the key when trees exist.
- Unifying `txNr` and the event version (finding 6, SPEC-0027).
- Outbox relay batching and poison-message isolation (finding 7, SPEC-0026).
- New fields on the execution message, such as order context or `orderVersion` (SPEC-0019).
- Deduplicating `OrderCreateCmd`, `OrderAcceptCmd` or `ExecutionCreateCmd` by `commandId`. Only the
  lifecycle commands carry one today, and fills are already unique on `(orderId, execID)`.
- Any change to the trade blotter's execution-to-order mapping (finding 15).

## Acceptance Criteria

- **AC-1** — Given an accepted order `O`, when two fills with different `execId`s are processed for it, then both records published to `oms_executions` have the Kafka key `O`, and the record published to `oms_orders` for each fill also has the key `O`.
- **AC-2** — Given an accepted order, when a fill is posted to the command API as an `ExecutionCreateCmd`, then the response is `201`, and the `order_events` row appended for that fill has a non-null `transaction` that is an `ExecutionCreateCmd` with the posted `execId`.
- **AC-3** — Given an order whose event log holds versions 1 to 3, when the query API is searched for it, then its `OrderDto` has `eventVersion` 3. After one more event, the same search returns `eventVersion` 4.
- **AC-4** — Given a streaming subscription with snapshot, where the snapshot holds order `A` at `eventVersion` 3 and order `B` at `eventVersion` 1, when live order events arrive for `A` with `eventId` 2, 3 and 4 and for `B` with `eventId` 3, then the subscriber receives `A`'s event 4 and `B`'s event 3, and does not receive `A`'s events 2 and 3.
- **AC-5** — Given an order that has applied a lifecycle command with `commandId` `C`, when a command with the same `commandId` `C` arrives for that order again (over REST or Kafka), then it is refused (REST `400` with status `FAILED` and a message naming `C`; Kafka acknowledged, not retried or dead-lettered), and the order's state, `txNr` and event count are unchanged.
- **AC-6** — Given an order, when a lifecycle command with `commandId` `C` is applied, then its new `order_events` row has `command_id` = `C`. A command without a `commandId` is still applied subject to its state preconditions, and leaves `command_id` null.
- **AC-7** — Given an order, when two copies of the same lifecycle command (same `commandId`) are processed concurrently, then exactly one is applied: the order's log holds exactly one event with that `command_id`, and the other copy is refused as in AC-5.
- **AC-8** — Given `order_events` rows written before this change whose `transaction` holds a `commandId`, when the Liquibase migration runs, then each such row's `command_id` equals that `commandId`, and a redelivery of that command afterwards is refused as in AC-5.
- **AC-9** — Given a root order `R` with two children whose `parentOrderId` and `rootOrderId` are `R`, and a grandchild whose `parentOrderId` is one of those children and whose `rootOrderId` is `R`, when `findByRootOrderId(R)` and `findByParentOrderId(R)` are called, then the first returns all three descendants without throwing, and the second returns exactly the two children.

## Impact

| Area | Impact |
|---|---|
| Modules | oms-contracts, oms-core, oms-streaming-service, oms-knowledge-base |
| Contracts (OpenAPI / Avro) | `oms-query-api.yml`: an optional `eventVersion` (int64) on `OrderDto`, additive. No Avro change |
| Data (tables, migrations) | New Liquibase changeset: a nullable `command_id` column on `order_events`, backfilled from `transaction->>'commandId'`, plus a unique index on `(order_id, command_id)`. Whatever source the design picks for `eventVersion` in queries |
| Events / Kafka topics | `oms_executions` record key changes from `execId` to `orderId`. Payloads unchanged |
| Consumers (oms-ui, oms-mcp-server, downstream) | oms-streaming-service: snapshot deduplication rewritten. oms-mcp-server and the exchange simulator consume the regenerated query models and need no code change. oms-ui: none |
| Knowledge base | `interfaces/kafka-topics.md`, `oms-concepts/booking-integration.md` §3.2, `functional-requirements/FR-010-…`, `non-functional-requirements/NFR-001-…`, `oms-concepts/streaming-architecture.md`, `domain/order-event.md` (new column) |

## Open Questions

- [resolved] Key by `orderId` or `rootOrderId`? → `orderId`. Trees do not exist yet, and `oms_orders` is keyed by `orderId`. The tree tickets switch both topics at once (from the Goal: "rootOrderId once trees exist").
- [resolved] Is `commandId` unique per order across command types, or only within one command type as today? → assumption: across types. A `commandId` names one command. The unique index on `(order_id, command_id)` would refuse a different lifecycle command that reuses a `commandId` already applied to the same order. Today's check would accept it if the class differs. **Please confirm at approval.**
- [resolved] Backfill existing rows? → assumption: yes, from the stored `transaction` JSON. Otherwise a redelivery of a command applied before the deployment would get through (AC-8). The migration fails if existing rows already hold the same `commandId` twice for one order. The current check prevents that within one command type, so it is acceptable for the dev databases this project runs.
- [resolved] What should the streaming service do with a live event older than the snapshot? → assumption: drop every live event at or below the snapshot's `eventVersion` for that order, not only an equal one, because an older event would roll the subscriber's view back.
- [resolved] Keep the command-less `ExecutionCommandProcessor.process(execution)` overload? → left to the design. AC-2 only requires that the REST path passes the command.
- [deferred] Records already on `oms_executions` keyed by `execId` → safe to defer: no consumer reads the key, and new records use the new key.
