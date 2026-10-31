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

- `Projection` (`org.example.oms.projection`): `name()` (its table), `project(ProjectionContext)`
  (upserts its rows, returns the messages to stage) and `clear()`.
- `ProjectTask` runs every `Projection` bean, in name order, as the last task of the fill pipeline,
  after `PublishExecutionEventTask` (which assigns the event version). Only the fill pipeline runs
  projections today.
- A projection that throws fails the task; the pipeline fails and the whole fill rolls back: no
  execution, no event, no outbox row, no projection row.
- Messages a projection returns are staged by `OrderEventAppender.stageMessage` as `PROJECTION`
  outbox rows with a generic payload: `payload_type` is the Avro record's schema name, `payload`
  its binary Avro encoding. The relay publishes them like any other row
  ([Event Publication](../capabilities/event-publication.md)). Pending `PROJECTION` rows must be
  published before a deployment that changes their record's schema.

## order_execution_view

The first projection: one row per applied fill, unique on `(order_id, execid)`, with the fill, the
order as of that fill, `order_version` and `trade_date` (UTC date of `transactTime`). It is built
from the same `OrderExecution` record that it stages for `oms_order_executions`, so the row and the
published record cannot disagree. Read through `GET /api/query/executions`
([Query API](../interfaces/query-api.md)).

## Rebuild

`POST /actuator/projections/{name}/rebuild` (e.g. `order_execution_view`) runs
`ProjectionRebuilder`: in one transaction it locks the projection's table (fills wait meanwhile),
clears it, and re-runs the projection for every fill event in `order_events`, matched to its
`executions` row by the execId in the stored command, or, for REST fills recorded before SPEC-0018
without their command, by position within the order. It publishes nothing. It answers
`{"projection": name, "rows": n}`, `404` for an unknown projection, and records the
`oms.projection.rebuild` timer. Run it once after deploying a new projection, to fill it for
existing orders, and after fixing a projection bug.

The management endpoints, this one included, have no authentication today.

## Not yet

Projections on other pipelines (create, accept, lifecycle), republishing during a rebuild, and
moving the `ORDER` and `EXECUTION` messages onto the generic payload.
