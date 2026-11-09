---
type: Specification
title: "Projections"
description: "Read models computed from each order change inside the command transaction, published through the outbox and rebuildable from the event log."
tags: [projections, read-model, event-sourcing, outbox]
status: draft
version: "0.1"
updated: "2026-10-31T00:00:00Z"
---
# Projections

**Status:** Implemented for fills (SPEC-0020). Source: architecture review 2026-10-30, §5.

A projection is a read model derived from one order change: the order after the change, the fill
that caused it, and the event-log version the change was recorded at. Because it is computed in the
same transaction as the change, it is consistent with the order by construction, and because it
needs only an order snapshot and a fill, it can be rebuilt from the event log at any time.

## Where it runs

- `Projection` (`org.example.oms.projection`) has four methods:
  - `name()`: the rebuild selector and metric tag;
  - `table()`: the table holding its rows (SPEC-0045);
  - `project(ProjectionContext)`: upserts its rows and returns the messages to stage;
  - `clear()`.
- **Naming rule** (SPEC-0045). A projection's name is its subject, and its table is
  `<subject>_projection`: `order_execution` lives in `order_execution_projection`.
  `ProjectionIntegrationTest` checks the rule for every projection bean. A table is never called
  `_view`; in PostgreSQL that word means a SQL view, which a projection is not.
- `ProjectTask` runs every `Projection` bean, in name order, as the last task of the fill pipeline,
  after `PublishExecutionEventTask` (which assigns the event version). Only the fill pipeline runs
  projections today.
- A projection that throws fails the task; the pipeline fails and the whole fill rolls back: no
  execution, no event, no outbox row, no projection row.
- Messages a projection returns are staged by `OrderEventAppender.stageMessage` as `PROJECTION`
  outbox rows with a generic payload: `payload_type` is the Avro record's schema name, `payload`
  its binary Avro encoding. The relay publishes them like any other row
  ([Event Publication](../capabilities/event-publication.md)).
- Each row also records `payload_schema_id`, the Schema Registry id of the schema its payload was
  encoded with (SPEC-0049). The relay decodes with that writer schema and the current class as
  reader, so a compatible change to the record (a field added with a default, say) between staging
  and publishing no longer fails the row. The id is looked up in the background and cached, never
  on the command path: rows staged before it is known, and rows from before changelog 016, carry
  null and decode with the current class schema, as before. For those, and for an incompatible
  change, the old rule still holds: publish pending `PROJECTION` rows before such a deployment
  ([Avro Messages](../interfaces/avro-messages.md#precision-and-versions)).

## order_execution

The first projection, in the table `order_execution_projection`. The table was called
`order_execution_view` until SPEC-0045 renamed it, together with its sequence, key, constraint and
indexes, keeping every row. Each row is one applied fill, unique on `(order_id, execid)`, with the fill, the
order as of that fill, `order_version` and `trade_date` (UTC date of `transactTime`). It is built
from the same `OrderExecution` record that it stages for `oms_order_executions`, so the row and the
published record cannot disagree. Read through `GET /api/query/executions`
([Query API](../interfaces/query-api.md)).

## Rebuild

`POST /actuator/projections/{name}/rebuild` runs `ProjectionRebuilder`, for example
`POST /actuator/projections/order_execution/rebuild`. The selector is the projection's name; the
former `order_execution_view` answers 404. In one transaction it locks the projection's `table()`
(fills wait meanwhile),
clears it, and re-runs the projection for every fill event in `order_events`, matched to its
`executions` row by the event's `exec_id` (SPEC-0044). The migration that added `exec_id` backfilled
older fills, from the stored command or by position for REST fills recorded before SPEC-0018. The
rebuild no longer falls back to position: a fill event without `exec_id` fails the rebuild with an
error naming the order and the event version, and the table is left as it was. It publishes nothing. It answers
`{"projection": name, "rows": n}`, `404` for an unknown projection, and records the
`oms.projection.rebuild` timer. Run it once after deploying a new projection, to fill it for
existing orders, and after fixing a projection bug.

The management endpoints, this one included, have no authentication today.

## Not yet

Projections on other pipelines (create, accept, lifecycle), republishing during a rebuild, and
moving the `ORDER` and `EXECUTION` messages onto the generic payload.
