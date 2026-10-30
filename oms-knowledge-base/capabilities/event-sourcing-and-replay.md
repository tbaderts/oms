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

[REST Read API](../interfaces/rest-read-api.md) (`/api/order-events`); [Order Event](../domain/order-event.md).

## Detailed specifications

- [OMS State Store](../oms-framework/oms-state-store.md)

## Known gaps

- Events store full snapshots rather than deltas; folding deltas, as some specs describe, is not implemented (a deliberate simplification).

## Verification

`EventSourcingIntegrationTest`, `ExchangeWorkflowIntegrationTest`. Conventions: [Testing Patterns](../oms-framework/testing-patterns.md).
