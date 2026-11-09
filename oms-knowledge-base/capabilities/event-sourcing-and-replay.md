---
type: Capability
title: "Event Sourcing and Replay"
description: "The append-only order event log and the ability to rebuild any order from it."
tags: [event-sourcing, audit, replay]
status: draft
maturity: "implemented"
commands: []
generated: { by: claude-code/claude-opus-5-5, at: "2026-10-27T17:30:00Z" }
sources:
  - resource: "repo:oms-core/src/main/java/org/example/oms/service/OrderEventAppender.java"
  - resource: "repo:oms-core/src/main/java/org/example/oms/service/OrderReplayService.java"
---
# Event Sourcing and Replay

## Summary

Every change of an order is recorded as an event with a snapshot, giving a complete audit trail that can rebuild the order.

## Behaviour

See [Order Event](../domain/order-event.md) and the [Event Sourcing decision](../architecture/event-sourcing.md).

## Requirements

- [FR-020 Record every order change as a versioned event](../functional-requirements/FR-020-append-event-per-change.md)
- [FR-021 Reconstruct orders from their events](../functional-requirements/FR-021-replay-orders.md)
- [FR-022 Leave no partial writes on failure](../functional-requirements/FR-022-atomic-command-processing.md)
- [NFR-003 Auditability](../non-functional-requirements/NFR-003-auditability.md)
- [NFR-008 Replayability](../non-functional-requirements/NFR-008-replayability.md)

## Interfaces and domain

[Query API](../interfaces/query-api.md) (`GET /api/query/orders/{orderId}/events`); [Order Event](../domain/order-event.md).

## Detailed specifications

- [OMS State Store](../oms-framework/oms-state-store.md)

## Runtime reconciliation (SPEC-0049)

`EventLogReconciler` checks policy P-05 in production: that the log agrees with the state.

- **When and where.** Every `oms.reconciliation.interval-ms` (default 300000, 5 minutes, after
  `oms.reconciliation.initial-delay-ms`, default 60000), on the scheduler leader only (SPEC-0048).
  `oms.reconciliation.enabled=false` turns the schedule off.
- **What it samples.** The `oms.reconciliation.recent` orders with the newest events (default 50),
  and `oms.reconciliation.random` orders from a random starting id (default 10).
- **What it checks, per order, in one read-only snapshot.**
  - The `orders` row equals the latest event's snapshot. Instants are compared to the microsecond,
    because a snapshot keeps the clock's nanoseconds while Postgres stores (rounds to)
    microseconds.
  - The versions run from 1 with no gap.
- **What it reports.**
  - Gauges `oms.event_log.inconsistent` and `oms.event_log.gaps`: orders found in the latest run.
  - Counter `oms.event_log.sampled`: orders checked by this instance.
  - WARN `Event log inconsistent for order <id>: the row differs from its latest event in {…}` with
    the fields, and `Event log gap for order <id>: missing versions [...]`.
- **It never repairs.** A non-zero gauge means a path changed an order without an event, or an
  event went missing: investigate with the order's history.

## Known gaps

- Events store full snapshots rather than deltas; folding deltas, as some specs describe, is not implemented (a deliberate simplification).

## Verification

`EventSourcingIntegrationTest`, `ExchangeWorkflowIntegrationTest`. Conventions: [Testing Patterns](../oms-framework/testing-patterns.md).
