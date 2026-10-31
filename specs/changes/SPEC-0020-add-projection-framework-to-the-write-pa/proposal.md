# Proposal — SPEC-0020: Add projection framework to the write path

> **Stage 1 of 3 — why and what, not how.** The acceptance criteria below are the contract that
> the verify stage checks. If they are vague, the goal cannot be proven met.

## Why

This is roadmap ticket C of the architecture review (`oms-core/docs/architecture-review-2026-10-30.md`
§5 "Recommended design" items 2–4; [ticket Goal](./ticket.md)). SPEC-0019 (ticket B, done) made
every fill publish a self-contained `OrderExecution` record. Two gaps remain:

1. **Pull consumers have nothing to read.** The `OrderExecution` data exists only as a Kafka
   message. The UI, operators and a future booking reconciliation (booking paper W10) need to
   *query* fills with their order context, by order, root order, account and time. Today the only
   executions endpoint is a hidden controller outside the contract (`/api/executions`, review
   finding 10) that returns bare execution rows without order fields.
2. **Each new projection would be ad hoc.** SPEC-0019 added the `OrderExecution` message by hand
   in `OrderEventAppender` with its own outbox type and two payload columns. The tree tickets
   (SPEC-0022/0023) and booking will need more such views. Without a common mechanism, each adds
   code to the appender, new outbox columns, and its own consistency story, and none can be rebuilt
   after a bug or a schema change.

The event log already holds everything needed: every event carries a full order snapshot, and
the `executions` table is complete. A projection computed in the command transaction is
consistent with the order by construction, and can be rebuilt from the log at any time. That is
the event-sourcing property the team wants, from data that is already stored.

## What Changes

- **A projection framework in oms-core.** A `Projection` contract: given the state of one command
  (the order as changed, the fill, the event version), it returns rows to upsert and messages to
  stage. A `ProjectTask` runs every projection bean in the fill pipeline, after `UpdateOrderTask`
  and before the events are published, inside the command transaction. If a projection fails, the
  whole command rolls back.
- **A generic outbox payload.** A new Liquibase changeset adds a `payload` (JSONB) column and a
  `payload_type` discriminator to `outbox`. `MessagePublisher` publishes any typed payload without
  a column per message type.
- **The first projection, `order_execution_view`:** one row per applied fill, with the fill, the
  order as of that fill, `orderVersion` and `tradeDate`, the same content as the `OrderExecution`
  message. The `OrderExecution` message moves into this projection: it is staged through the
  generic payload. What consumers receive on `oms_order_executions` does not change.
- **`GET /api/query/executions`** in the query contract, served from `order_execution_view`,
  filtered by `orderId`, `rootOrderId`, `account` and a `transactTime` range.
- **A `ProjectionRebuilder`** that empties a projection's table and rebuilds it from `order_events`
  and `executions`, triggered by an operator through an actuator endpoint. It publishes nothing.
- No **BREAKING** change. The query API gains one path (additive). The Kafka output is unchanged.
  The hidden `/api/executions` stays as it is, since oms-ui uses it.

## Scope

### In scope

- `Projection`, `ProjectTask`, the generic outbox payload and its changeset.
- `order_execution_view`: table (new changeset), projection, entity, repository.
- Moving the `OrderExecution` message onto the projection and the generic payload.
- `GET /api/query/executions` in `oms-query-api.yml`, its generated interface and controller.
- `ProjectionRebuilder` and its actuator trigger.
- KB pages: event publication and the outbox, the query API, the projection concept (new page or
  section), the booking paper's §8/§12 references to a fill view.

### Out of scope

- Projections on other pipelines (create, accept, lifecycle). Only the fill pipeline has an
  `UpdateOrderTask` today, and the only projection is about fills. The framework is built so a
  later ticket can add `ProjectTask` to another pipeline.
- Republishing during a rebuild (the review's "optionally republish"). A rebuild only rewrites the
  table.
- Moving the `ORDER` and `EXECUTION` messages onto the generic payload. They keep their columns.
- Removing or migrating the hidden `/api/executions` and oms-ui's use of it.
- A read replica or a query-only runtime (SPEC-0021).
- Order trees and rippling (SPEC-0022/0023).
- Busts and corrections (no processor yet).

## Acceptance Criteria

- **AC-1** — Given an accepted order, when a fill is applied (over REST or Kafka), then exactly one
  `order_execution_view` row exists for its `(orderId, execId)`, whose fill fields, order fields
  (`account`, `side`, `symbol`, `orderQty`, `price`, `cumQty`, `leavesQty`, `state`),
  `orderVersion` and `tradeDate` equal the `OrderExecution` record published for that fill.
- **AC-2** — Given an accepted order and a projection that fails, when a fill is applied, then the
  command is refused and nothing of it is stored: no `executions` row, no `order_events` row, no
  outbox row, no projection row, and the order's state, `cumQty` and `txNr` are unchanged.
- **AC-3** — Given a refused fill (a duplicate `execId`, or an overfill), when it is processed, then
  no `order_execution_view` row is added or changed for it.
- **AC-4** — Given the migration has run, when a fill is applied, then its `OrderExecution` is staged
  as an outbox row with `payload_type` `OrderExecution` and a `payload`, and the record published on
  `oms_order_executions` equals what SPEC-0019 published: same key, same field values (the SPEC-0019
  publication tests pass unchanged). An `ORDER_EXECUTION` outbox row staged before the migration
  is still published.
- **AC-5** — Given fills on orders `A` and `B` (with `B` under root `R`, accounts differing), when
  `GET /api/query/executions` is called with `orderId=A`, with `rootOrderId=R`, with `account`, or
  with `transactTimeFrom`/`transactTimeTo`, then each returns exactly the matching fills, oldest
  first, with the fields of AC-1. A filter that matches nothing returns `200` with an empty list. The
  path, its parameters and its response schema are in `oms-query-api.yml`.
- **AC-6** — Given `order_execution_view` rows for several orders, including a fill whose
  `order_events` row has no stored command (REST fills before SPEC-0018), when the projection is
  rebuilt through the actuator endpoint, then the table afterwards holds the same rows as before
  (surrogate ids aside), and nothing is published to any topic. Rebuilding an unknown projection
  answers `404`.

## Impact

| Area | Impact |
|---|---|
| Modules | oms-contracts, oms-core, oms-knowledge-base (already set on the ticket); oms-mcp-server and oms-exchange-simulator rebuild against the new contracts jar |
| Contracts (OpenAPI / Avro) | `oms-query-api.yml`: new path `GET /executions` and an `ExecutionViewDto`-style response schema, additive. No Avro change |
| Data (tables, migrations) | New changeset: `outbox.payload` (JSONB, nullable), `outbox.payload_type` (nullable); new table `order_execution_view` with a unique `(order_id, execid)` and indexes for the query filters. Existing rows are untouched; the view starts empty and is filled for existing fills by one rebuild |
| Events / Kafka topics | None visible: `oms_order_executions` records are unchanged; only how the outbox row is stored changes |
| Consumers (oms-ui, oms-mcp-server, downstream) | None required. New endpoint available to oms-ui, the cockpit and MCP tools; the hidden `/api/executions` is unchanged |
| Knowledge base | `capabilities/event-publication.md`, `domain/outbox-message.md`, `interfaces/query-api.md`, a projection concept page or section, `oms-concepts/booking-integration.md` (fill view for reconciliation) |

## Open Questions

- [resolved] Which pipelines run `ProjectTask`? → assumption: the fill pipeline only, after
  `UpdateOrderTask` as the Goal says. No other pipeline has that task, and the only projection is
  about fills.
- [resolved] Does the `OrderExecution` message move into the projection? → assumption: yes, so the
  framework is proven on the existing message and there is one mechanism, not two. Its wire output
  is unchanged (AC-4). The `ORDER` and `EXECUTION` messages stay as they are.
- [resolved] How is the rebuild triggered, and is it safe while fills arrive? → assumption: an
  actuator endpoint (`POST /actuator/projections/{name}/rebuild`), added to the exposed endpoints
  next to `health`, `metrics` and `prometheus`. The rebuild runs in one transaction that locks the
  projection table, so concurrent fills wait for it rather than interleave. **Please confirm at
  approval**: this exposes a write operation on the management endpoint, which has no
  authentication today (P-16). If that is not acceptable, the alternative is a startup flag or a
  CLI runner, which is less convenient.
- [resolved] How are fill events matched to `executions` rows when the event has no stored command
  (REST fills before SPEC-0018)? → assumption: by `(order_id, execid)` from the stored command when
  present; otherwise the k-th fill event of an order (by version) matches the k-th `executions` row
  of that order (by id), since both are written in the same transaction in the same order. AC-6
  covers such a fill.
- [resolved] Do existing fills get view rows at deployment? → assumption: no automatic backfill in
  the migration (Liquibase cannot run the projection). One rebuild after deployment fills the view;
  the KB says so.
- [resolved] What about the hidden `/api/executions`? → unchanged; oms-ui calls it. Migrating the UI
  to the contracted endpoint is a follow-up.
- [deferred] Republishing messages during a rebuild → safe to defer: nothing needs it until a
  consumer must be re-fed, and the outbox and the event log keep everything needed to add it.
