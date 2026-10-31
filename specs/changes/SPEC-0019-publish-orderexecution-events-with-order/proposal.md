# Proposal — SPEC-0019: Publish OrderExecution events with order context

> **Stage 1 of 3 — why and what, not how.** The acceptance criteria below are the contract that
> the verify stage checks. If they are vague, the goal cannot be proven met.

## Why

This is roadmap ticket B of the architecture review (`oms-core/docs/architecture-review-2026-10-30.md`,
§5 "Recommended design" items 1, 5 and 6, and §8 findings 15 and 16; [ticket Goal](./ticket.md)).
SPEC-0018 (ticket A, done) fixed the keys and audit gaps it depends on.

Today a fill is published on `oms_executions` as a bare `Execution`: `execId`, `orderId`,
quantities and prices, with no account, side, instrument, order version, root order or trade date.
The order's new state goes out separately on `oms_orders`. The two topics are not ordered against
each other, so a consumer that needs the order behind a fill has to call `/api/query/search` and may
get the order before the fill's change, or, on a future read replica, not at all. The booking
concept paper (`oms-knowledge-base/oms-concepts/booking-integration.md`) lists this as problems P1
and P8 and asks for contract changes E1–E3: `rootOrderId`, the order version and `tradeDate` on
executions.

The streaming service shows the same gap to traders: `TradeBlotterController.toOrderEvent` turns an
execution into a blotter event carrying only ids, so fills appear as empty rows in the combined
stream (finding 15). And no test anywhere consumes the published topics to prove what a consumer
can rely on: ordering and deduplication (finding 16).

All the data a fill consumer needs is already in hand when the fill is processed. Doing nothing
keeps every downstream consumer doing a racy lookup per fill, keeps the blotter's fill rows empty,
and leaves the order-tree work (SPEC-0022/0023) without the per-root ordering it builds on.

## What Changes

- **New Avro record `OrderExecution`** in oms-contracts: the execution (`execId`, `lastQty`,
  `lastPx`, `execType`, `lastCapacity`, `lastMkt`, `transactTime`), the order's identity
  (`orderId`, `rootOrderId`, `parentOrderId`, `leg`, `clOrdId`, `sessionId`, `account`), its
  economics (`side`, `symbol`, `securityId`, `ordType`, `price`, `orderQty`, `settlCurrency`,
  `exDestination`), the resulting position (`cumQty`, `leavesQty`, `avgPx`, `state`),
  `orderVersion` (the event-log version the fill produced) and `tradeDate`.
- **New topic `oms_order_executions`** (configurable like the others). Every fill that oms-core
  applies publishes exactly one `OrderExecution` there, staged through the outbox in the same
  transaction as the fill. A fill that is refused or rolled back publishes nothing.
- **`Execution.avsc` gains `rootOrderId` and `orderVersion`**, both nullable with a `null` default
  (E1, E2). Additive.
- **Partition key `rootOrderId`** for `oms_orders`, `oms_executions` and `oms_order_executions`:
  the order's `rootOrderId`, or its own `orderId` when it has none. Every order today is its own
  root, so today's keys keep their values; once trees exist, all records of one tree share a
  partition and are consumed in commit order. Per-order ordering is unchanged, so no consumer
  breaks.
- **The streaming service builds its execution stream from `oms_order_executions`**, deduplicating
  on `(execId, orderVersion)`. Blotter fill events (`blotter.stream` with `EXECUTIONS` or `ALL`)
  carry the order's fields after the fill instead of ids only.
- **A consumer-side Testcontainers test** that consumes the published topics and proves per-root
  ordering and deduplication.
- No **BREAKING** changes: the Avro changes are additive, the key values of existing orders do not
  change, and blotter events only gain fields.

## Scope

### In scope

- The `OrderExecution` contract, its topic and publication through the outbox, for fills
  (`ExecutionCreateCmd`) received over REST and Kafka.
- `rootOrderId` and `orderVersion` on `Execution`.
- The `rootOrderId` partition key on the three outbound topics.
- The streaming service's switch to `oms_order_executions` for fills, its dedup, and the enriched
  blotter fill events.
- The consumer-side ordering and deduplication test (finding 16).
- Avro compatibility guards for `Execution` and `OrderExecution`, like the existing ones for
  `OrderMessage` and `CommandMessage`.
- KB pages: `interfaces/kafka-topics.md`, `interfaces/avro-messages.md`,
  `oms-concepts/booking-integration.md` (§3.2 and §12 E1–E3), `oms-concepts/streaming-architecture.md`,
  `capabilities/real-time-streaming.md`, `capabilities/event-publication.md`.

### Out of scope

- The projection framework: `Projection`/`ProjectTask`, a generic outbox payload,
  `order_execution_view`, `GET /api/query/executions`, the rebuilder (SPEC-0020, ticket C).
- Order trees, the place command, upward rippling and cancel fan-out (SPEC-0022/0023). This ticket
  only keys by `rootOrderId`; it does not create trees.
- Bust and correction of executions (finding 14). `OrderExecution` is published for new fills only.
- A booking adapter. The streaming service is the consumer this ticket changes.
- Removing `oms_executions` or changing the exchange simulator. Both topics keep publishing.
- `avgPx` computation. It is carried as oms-core has it (null today).
- oms-ui changes. If the blotter already renders `order` fields on events, fill rows fill in by
  themselves; any UI work is a follow-up.
- Measuring the fill-path cost with the load harness (SPEC-0024, ticket G, not built yet).

## Acceptance Criteria

- **AC-1** — Given the oms-contracts build, when its schemas are compiled and checked, then
  `OrderExecution` exists with every field listed under What Changes, and `Execution` has
  `rootOrderId` and `orderVersion`, both nullable with default `null`. A compatibility test shows
  that `Execution` records written with the previous schema are readable with the new one and the
  other way round.
- **AC-2** — Given an accepted order `O` with no `rootOrderId`, when a fill is applied to it over
  REST and another over Kafka, then for each fill exactly one `OrderExecution` record is published on
  `oms_order_executions` with key `O`, carrying the fill's `execId`, `lastQty` and `lastPx`, and
  order fields (`account`, `side`, `symbol`, `orderQty`, `price`, `cumQty`, `leavesQty`, `state`)
  equal to the order after that fill. Its `orderVersion` equals the `version` of the fill's
  `order_events` row and the `eventId` of the `oms_orders` record of the same change, and its
  `tradeDate` is the UTC date of the fill's `transactTime`.
- **AC-3** — Given the same fills as AC-2, when their `oms_executions` records are read, then each
  carries `rootOrderId` `O` and the same `orderVersion` as its `OrderExecution`.
- **AC-4** — Given an accepted order, when a fill is refused (a second fill with an `execId` the
  order already has, or a fill whose `lastQty` exceeds `leavesQty`), then no record for it is
  published on `oms_order_executions` or `oms_executions`, and the order's event count is unchanged.
- **AC-5** — Given an order `C` created with `rootOrderId` `R` and `parentOrderId` `R`, when it is
  accepted and filled, then every record for `C` on `oms_orders`, `oms_executions` and
  `oms_order_executions` has the key `R`. An order created without `rootOrderId` is keyed by its own
  `orderId` on all three topics.
- **AC-6** — Given a root order `R` and an order `C` with `rootOrderId` `R`, when fills are applied
  alternately to `R` and `C` (at least two each), then a consumer reading `oms_order_executions`
  from the earliest offset receives all of them from a single partition, in the order they were
  committed, with each order's `orderVersion` strictly increasing. (Testcontainers Kafka and
  Postgres, consuming the real topic.)
- **AC-7** — Given the streaming service has emitted a blotter event for fill `X` at `orderVersion`
  `v`, when an `OrderExecution` with the same `(execId, orderVersion)` is delivered again, then no
  second event is emitted for it. A following `OrderExecution` for the same order with a new
  `execId` and a higher `orderVersion` is emitted.
- **AC-8** — Given a client subscribed to `blotter.stream` with stream type `EXECUTIONS` (and,
  separately, `ALL`), when a fill is published, then the event emitted for it has `eventType`
  `EXECUTION_<execType>` and an `order` whose `orderId`, `symbol`, `side`, `account`, `orderQty`,
  `cumQty`, `leavesQty` and `state` equal the `OrderExecution`'s values, instead of ids only.

## Impact

| Area | Impact |
|---|---|
| Modules | oms-contracts, oms-core, oms-streaming-service, oms-knowledge-base (already set on the ticket). oms-mcp-server and oms-exchange-simulator rebuild against the new contracts jar with no code change |
| Contracts (OpenAPI / Avro) | Avro: new `OrderExecution.avsc`; `Execution.avsc` gains two nullable fields with `null` defaults. Both additive (P-04). No OpenAPI change |
| Data (tables, migrations) | None expected: the outbox already stores the order and execution payloads of a fill. If the design needs a column, it adds a new Liquibase changeset (P-07) |
| Events / Kafka topics | New topic `oms_order_executions` (key `rootOrderId`). `oms_orders` and `oms_executions` keyed by `rootOrderId`, falling back to `orderId`; identical key values for every order existing today. One more outbox row and record per fill |
| Consumers (oms-ui, oms-mcp-server, downstream) | oms-streaming-service: consumes `oms_order_executions` for fills instead of `oms_executions`, dedups, enriches blotter fill events. oms-ui: receives richer fill events, no change required. Exchange simulator: consumes `oms_orders` only; key values unchanged. Booking (future): reads `oms_order_executions` |
| Knowledge base | `interfaces/kafka-topics.md`, `interfaces/avro-messages.md`, `oms-concepts/booking-integration.md` (§3.2, §12 E1–E3), `oms-concepts/streaming-architecture.md`, `capabilities/real-time-streaming.md`, `capabilities/event-publication.md` |

## Open Questions

- [resolved] How is `tradeDate` determined? → assumption: the UTC calendar date of the fill's
  `transactTime`, or of the processing time when the fill has no `transactTime`. The OMS has no
  venue calendar or venue time zone today. This differs from the exchange-local trade date (FIX 75)
  for fills near midnight UTC, for example US fills after 20:00 New York time. **Please confirm at
  approval**, or name the rule booking needs (for example the venue's local date from
  `exDestination`), which would need a venue time-zone table.
- [resolved] Key by `rootOrderId` now, although SPEC-0018 deferred it to the tree tickets? → yes,
  as the Goal asks and the roadmap orders it (B before E). With the `orderId` fallback, no key value
  changes until trees exist.
- [resolved] Should the streaming service keep consuming `oms_executions`? → assumption: no; it
  switches to `oms_order_executions` for fills, which is the review's recommendation (§5 item 6) and
  removes its execution-to-order gap. `oms_executions` stays published for other consumers.
- [resolved] What is the consumer's dedup key? → `(execId, orderVersion)`, as the review and the
  booking paper specify. Two deliveries of the same fill carry the same pair.
- [resolved] Does `OrderExecution` cover busts and corrections? → no; they have no processor yet
  (finding 14). The record is designed so they can be added later (`execType` distinguishes them).
- [deferred] Measuring the extra cost per fill (one more outbox row and record) → safe to defer to
  the load harness (SPEC-0024); the change adds one insert and one send per fill, both of which the
  relay already does for the other two topics.
