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
| `event` | What happened: `NEW_ORDER`, `ACK`, `PARTIAL_FILL`, `FILL`, `CXL`, `REJ`, `CXL_REQUEST`, `CXL_REJ`, `EXP`, `CLOSE` (SPEC-0029), and the execution lifecycle events `EXEC_BUST`, `EXEC_CORRECT`, `EXEC_WHACK` (SPEC-0044) |
| `execId` (`exec_id`) | The execution the event is about, when it is about one: a fill, bust, correction or whack (SPEC-0044). Indexed with `order_id` (`idx_order_events_order_id_exec_id`). Older fills were backfilled from the stored command, or by position for fills recorded without one. The query API filters on it: `GET /api/query/orders/{orderId}/events?execId=…` |
| `transaction` | The command that caused it, as received over REST or Kafka (fills included). Null only for events recorded by internal callers that have no command |
| `commandId` (`command_id`) | The command's `commandId`, when it has one (the four lifecycle commands). Unique per order (`uq_order_events_order_id_command_id`); it is what [de-duplication](../functional-requirements/FR-010-deduplicate-lifecycle-commands.md) looks up. Null otherwise; rows written before the column existed were backfilled from `transaction` |
| `resultingState`, `orderSnapshot` | The state and the full order after the change |
| `timeStamp` | When it was recorded |
| `correlationId`, `causationId` (`correlation_id`, `causation_id`) | The causing command's ids, from the Kafka header or the REST body (SPEC-0049). `correlation_id` is indexed (`idx_order_events_correlation_id`), so every event of one business flow can be found |
| `principal`, `source` | Who sent the causing command and where it entered: `KAFKA` with the header's `producer`, `SCHEDULER` with the job (`oms-core:expiry`, `oms-core:end-of-day`), `REST` with no principal until REST has authentication (SPEC-0049) |
| `changes` | What the event changed, as jsonb `{"<field>": {"from": old, "to": new}}`: the difference between the order as the command loaded it and as it saved it (SPEC-0049). Only changed fields are listed; numbers compare by value. A first event lists every field set at creation with `from` null. A partial fill, for example, lists `cumQty`, `leavesQty` and `txNr`, not `state`, which stays `LIVE` |

The five SPEC-0049 columns are null on events recorded before changelog 016; there is no backfill.
The query API returns them on every entry of `GET /api/query/orders/{orderId}/events`.

`OrderEventAppender` is the only writer. It takes the next version from the order itself
(`txNr + 1`, no query), sets it on the order, writes the event and stages an
[outbox message](outbox-message.md) in the caller's transaction (SPEC-0027). The order's `txNr` is
therefore always the version of its latest event. A concurrent writer that took the same version
makes the insert fail on `uq_order_events_order_id_version`, and the appender reports it as a
concurrent modification. Because every event carries a snapshot, `OrderReplayService`
reconstructs the order at any version with a single lookup, with the event's version as `txNr`,
and can check that the log has no gaps.

An execution is an entity inside the order, not a stream of its own (SPEC-0044):
- **Creation and reversal.** It is created by a fill event and busted, corrected or whacked by a
  later order event naming it in `exec_id`, through
  `OrderEventAppender.appendExecutionLifecycleEvent`.
- **Ordering.** "Was EX-1 busted before EX-2 filled?" is answered by the versions, because both are
  in the one stream.
- **Executions at a version.** `OrderReplayService.executionsAt(orderId, version)` returns the
  executions in force at any version, from `executions.order_version` and `busted_at_version`.

## Related

- [Event Sourcing and Replay](../capabilities/event-sourcing-and-replay.md)
- Decision: [Event Sourcing](../architecture/event-sourcing.md)
- [Order State](order-state.md)
