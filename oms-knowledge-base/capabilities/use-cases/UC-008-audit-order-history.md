---
type: Use Case
title: "Audit and replay an order's history"
description: "Someone needs to know exactly what happened to an order, who caused it, and what the order looked like at any point."
tags: [use-case]
status: draft
updated: "2026-11-14T12:00:00Z"
id: "UC-008"
actors: [/capabilities/actors/operations-user.md, /capabilities/actors/developer.md]
capability: "/capabilities/event-sourcing-and-replay.md"
---
# UC-008 Audit and replay an order's history

Someone needs to know exactly what happened to an order, who caused it, and what the order looked like at any point.

Capability: [event-sourcing-and-replay](../event-sourcing-and-replay.md). Actors: [Operations User](../actors/operations-user.md), [Developer](../actors/developer.md).

## Preconditions

- The order has events.

## Main Flow

1. The user reads the order's command log: every command received and its outcome.
2. The user reads the event log: each version with its command, metadata and field changes.
3. The user reconstructs the order at any version from its snapshot.

## Alternative Flows

- A change without an event is found by the reconciliation job and reported.

## Postconditions

- The order's history is explained command by command.

## Requirements

- [FR-020](../functional-requirements/FR-020-append-event-per-change.md)
- [FR-021](../functional-requirements/FR-021-replay-orders.md)
- [FR-022](../functional-requirements/FR-022-atomic-command-processing.md)
- [FR-049](../functional-requirements/FR-049-log-every-command.md)
- [FR-051](../functional-requirements/FR-051-record-event-metadata.md)
- [FR-052](../functional-requirements/FR-052-reconcile-event-log.md)
- [NFR-003](../non-functional-requirements/NFR-003-auditability.md)
- [NFR-008](../non-functional-requirements/NFR-008-replayability.md)
