---
type: Decision
title: "Decision: Event Sourcing with Snapshots"
description: "Orders keep current state in a table and every change as an event carrying a full snapshot."
tags: [decision, event-sourcing]
status: draft
generated: { by: claude-code/claude-opus-5-5, at: "2026-10-27T17:30:00Z" }
sources:
  - resource: "repo:oms-core/src/main/java/org/example/oms/service/OrderEventAppender.java"
  - resource: "repo:oms-core/src/main/java/org/example/oms/service/OrderReplayService.java"
  - resource: "repo:specs/policies/architecture-policies.md"
---
# Decision: Event Sourcing with Snapshots

## Context
The OMS needs an audit trail of every order change and the ability to reconstruct past states.

## Decision
Keep the current order in `orders` and append each change to `order_events` (per-order version,
command, resulting state, full snapshot) in the same transaction, through one appender.

## Consequences
- Replay is a lookup, not a fold; events are larger than deltas.
- A path that changes an order without appending is a defect (policy P-05), detectable by replay.

Capability: [Event Sourcing and Replay](../capabilities/event-sourcing-and-replay.md).

Context: [System Context](system-context.md).
