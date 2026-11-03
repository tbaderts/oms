# Proposal — SPEC-0041: Align executions blotter fields and keys with orders

> **Stage 1 of 3 — why and what, not how.** The acceptance criteria below are the contract that
> the verify stage checks. If they are vague, the goal cannot be proven met.

## Why

The executions blotter in oms-ui leaves columns empty that users expect: id, execution id and avgPx
(ticket Goal). It is also unclear which of `id`, `executionId` and `execID` identifies a fill.
Today's code shows three separate causes:

1. **Column names don't match the data.** The Execution metamodel
   (`oms-core` `MetamodelService.buildExecutionMetadata`, served at `/api/v1/metamodel/Execution`)
   is built by reflection over the JPA entity. Its default columns are
   `id, orderId, executionId, execID, execType, lastQty, lastPx, cumQty, avgPx`.
   - The REST blotter reads `/api/executions`, which returns raw entities. On those, `executionId`
     is never set: `OrderMapper.toExecution` ignores it.
   - The streaming blotter receives `ExecutionDto` from oms-streaming-service. That DTO calls the
     venue id `execId`, not `execID`, and has no `id`. In streaming mode the `id` and `execID`
     columns are therefore always blank.
2. **No average price is computed.** `OrderMapper.toExecution` ignores `avgPx`, and nothing sets
   it later. The Avro schema says so: "Not currently computed by oms-core; always null until it
   is". The column is empty in every mode, and so is `avgPx` in `/api/query/executions` and on
   the Kafka messages.
3. **Rows are keyed on the wrong field.** `StreamingBlotter.getRowId` returns `orderId || id` for
   every domain object. Every fill of the same order gets the same AG Grid row id, so a
   partially-filled order displays wrongly in the streaming executions blotter. The REST blotter
   pins the column named by `primaryKey: "id"`, a database surrogate that has no meaning to a
   trader.

The orders blotter does this consistently:
- Rows are identified by the business key `orderId`, and the default columns name fields that
  exist in both modes.
- The surrogate `id` can be selected as an extra column in REST mode but is never the identity.

The goal asks the executions blotter to follow the same approach. Doing nothing leaves traders
without the average fill price, and with a streaming blotter that drops fills.

## What Changes

- **One name for the fill id.** The executions blotter, its metamodel and both feeds (REST and
  streaming) call the venue execution id `execId`.
  - `execID` disappears from the blotter-facing payloads.
  - `executionId`, a column that is never populated, disappears from the metamodel and the
    streaming DTO and metadata.
  - **BREAKING (minor)** for anyone reading `execID`/`executionId` from the `@Hidden`
    `/api/executions` endpoint or from the streaming `ExecutionDto`. The only known consumer is
    oms-ui, which changes in this ticket.
- **Identity follows orders.** A fill is identified by the business key `(orderId, execId)`,
  matching the `uq_executions_order_id_execid` constraint.
  - The metamodel's `primaryKey` for Execution becomes `execId`.
  - Both blotters key rows by `orderId` + `execId`.
  - The database `id` stays available as a non-default column in REST mode, as it is for orders.
- **Every default column has data.** The default columns of the executions blotter name only
  fields that the blotter receives in both modes: `execId, orderId, execType, lastQty, lastPx,
  cumQty, leavesQty, avgPx, transactTime`.
- **avgPx is computed.** For each applied fill, oms-core computes the order's volume-weighted
  average price over all of its applied fills up to and including that one, and stores it.
  - The value appears in `/api/executions`, `/api/query/executions` (order-execution projection),
    the `executions` Avro message and the `OrderExecution` message that feeds streaming.
  - The Avro `avgPx` doc is corrected. This is additive and changes no schema.

## Scope

### In scope

- oms-core: compute `avgPx` per fill, fix the Execution metamodel (fields, defaults,
  `primaryKey`), and expose `execId` on the REST executions feed.
- oms-streaming-service: drop `executionId` from `ExecutionDto` and its metadata; populate `avgPx`.
- oms-contracts: Avro doc text for `avgPx` (no structural change).
- oms-ui: key execution rows by `orderId` + `execId` in streaming and REST mode, and remove stale
  `execID`/`executionId` assumptions from the types.
- Knowledge base: the executions blotter section of `oms-knowledge-base/ui/oms-admin-ui_spec.md`.

### Out of scope

- An average price on the **order** itself (Order entity / `OrderDto` / orders blotter). This is a
  natural follow-up ticket.
- Dropping or backfilling the `executions.execution_id` DB column, and backfilling `avgPx` for
  fills recorded before this change. Old rows keep `avgPx = null`.
- Paging or sorting changes to `/api/query/executions`, and any new filters.
- The orders blotter. Its behaviour is the reference and is not changed.
- `dayAvgPx`, `dayCumQty`, `dayOrderQty` and `secondaryExecID`. They stay unpopulated and out of
  the default columns.

## Acceptance Criteria

- **AC-1** — Given oms-core is running, when `GET /api/v1/metamodel/Execution` is called, then
  `primaryKey` is `execId`, the response has no field named `execID` or `executionId`, and every
  name in `defaultColumns` is the name of a field in `fields`. `defaultColumns` includes `execId`,
  `orderId` and `avgPx`.
- **AC-2** — Given an order of 100 that receives a fill of 40 @ 10 and then a fill of 60 @ 11,
  when `GET /api/executions` is called, then each row has non-null `id`, `execId`, `orderId` and
  `avgPx`, and no `execID` or `executionId` property. The first fill has `avgPx` = 10 and the
  second has `avgPx` = 10.6.
- **AC-3** — Given the two fills of AC-2, when `GET /api/query/executions?orderId=<id>` is called
  and the `OrderExecution` and `executions` Kafka messages are read, then the fills carry
  `avgPx` 10 and 10.6 respectively.
- **AC-4** — Given the second fill of AC-2 is delivered again with the same `execId`, when
  oms-core processes it, then no extra execution row exists and the stored `avgPx` values are
  still 10 and 10.6. The duplicate is not counted twice.
- **AC-5** — Given two fills of the same order arrive on the streaming executions blotter, when
  they are rendered, then the grid holds two rows with distinct row ids.
- **AC-6** — Given two fills with the same `execId` on two different orders, when they arrive on
  the streaming executions blotter, or are returned to the REST executions blotter, then the grid
  holds two rows. `execId` alone is not treated as unique.
- **AC-7** — Given a streaming `ExecutionDto` and the Execution metamodel, when the executions
  blotter builds its default column definitions and a row from that DTO, then every default
  column resolves to a field present on the row, including `execId`, `orderId` and `avgPx`. The
  oms-streaming-service Execution metadata has no `executionId` field.

## Impact

| Area | Impact |
|---|---|
| Modules | oms-core, oms-streaming-service, oms-ui, oms-contracts (doc only) |
| Contracts (OpenAPI / Avro) | Avro `Execution.avgPx`/`OrderExecution.avgPx` doc text only: no field added, removed or retyped. OpenAPI `ExecutionViewDto` unchanged (it already has `execId` and `avgPx`). |
| Data (tables, migrations) | No schema change. `executions.avg_px` and `order_execution_view.avg_px` start being written for new fills. Existing rows are left as they are. |
| Events / Kafka topics | `executions` and the order-execution topic now carry a non-null `avgPx` for new fills. Schemas are unchanged. |
| Consumers (oms-ui, oms-mcp-server, downstream) | oms-ui (changed here). `/api/executions` JSON loses `execID`/`executionId` and gains `execId` (`@Hidden`, oms-ui only). Streaming `ExecutionDto` loses `executionId`. oms-mcp-server is not affected (it uses the query API). |
| Knowledge base | `oms-knowledge-base/ui/oms-admin-ui_spec.md` (executions blotter columns and identity) |

## Open Questions

- [resolved] Which field identifies a fill: `id`, `executionId` or `execID`? → `(orderId, execId)`,
  the business key the database already enforces as unique, mirroring `orderId` on the orders
  blotter. `executionId` is never populated, so it is removed from the blotter-facing models.
  `id` stays an optional REST-only column, as on orders. Assumption, reversible.
- [resolved] How is `avgPx` defined? → assumption: the order's volume-weighted average price
  after this fill, Σ(lastQty × lastPx) / cumQty over the order's applied fills, at scale 8 with
  HALF_EVEN rounding (the OMS decimal scale, SPEC-0039). **Money semantics: the reviewer should
  confirm this at proposal approval.**
- [deferred] Backfilling `avgPx` for fills recorded before this change → old rows are not
  rewritten (event log and projections stay as recorded), and the blotter just shows them blank.
  A replay-based backfill can be its own ticket.
- [deferred] An average price on the order itself → out of scope here, so it does not touch the
  order model or the orders blotter, which the goal names as the reference.
