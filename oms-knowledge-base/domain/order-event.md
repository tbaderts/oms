---
type: Domain Concept
title: "Order Event"
description: "Append-only log entry recording each order state change with a per-order version, the command, the resulting state and a snapshot of the order."
tags: [event-sourcing, audit, entity]
status: draft
entity: "OrderEvent"
generated: { by: claude-code/claude-opus-5-5, at: "2026-10-27T17:30:00Z" }
sources:
  - resource: "repo:oms-core/src/main/java/org/example/oms/model/OrderEvent.java"
  - resource: "repo:oms-core/src/main/java/org/example/oms/model/Event.java"
  - resource: "repo:oms-core/src/main/java/org/example/oms/service/OrderEventAppender.java"
  - resource: "repo:oms-core/src/main/java/org/example/oms/service/OrderReplayService.java"
  - resource: "repo:oms-core/src/main/resources/db/changelog/003-event-sourcing-and-outbox.yaml"
  - resource: "repo:oms-core/src/main/resources/db/changelog/006-order-event-command-id.yaml"
  - resource: "repo:oms-core/src/test/java/org/example/oms/integration/EventSourcingIntegrationTest.java"
---
# Order Event

Every change to an order appends one row to `order_events` in the same transaction as the change
itself. The log is the audit trail and the source for replay.

## Structure

| Field | Meaning |
|---|---|
| `orderId`, `version` | The order and a contiguous per-order sequence starting at 1; unique `(order_id, version)` (`uq_order_events_order_id_version`) |
| `event` | What happened: `NEW_ORDER`, `ACK`, `PARTIAL_FILL`, `FILL`, `CXL`, `REJ`, `CXL_REQUEST`, `CXL_REJ` |
| `transaction` | The command that caused it, as received over REST or Kafka (fills included). Null only for events recorded by internal callers that have no command |
| `commandId` (`command_id`) | The command's `commandId`, when it has one (the four lifecycle commands). Unique per order (`uq_order_events_order_id_command_id`); it is what [de-duplication](../functional-requirements/FR-010-deduplicate-lifecycle-commands.md) looks up. Null otherwise; rows written before the column existed were backfilled from `transaction` |
| `resultingState`, `orderSnapshot` | The state and the full order after the change |
| `timeStamp` | When it was recorded |

`OrderEventAppender` is the only writer: it assigns the next version, writes the event and stages
an [outbox message](outbox-message.md) in the caller's transaction. Because every event carries a
snapshot, `OrderReplayService` reconstructs the order at any version with a single lookup and can
check that the log has no gaps.

## Related

- [Event Sourcing and Replay](../capabilities/event-sourcing-and-replay.md)
- Decision: [Event Sourcing](../architecture/event-sourcing.md)
- [Order State](order-state.md)
