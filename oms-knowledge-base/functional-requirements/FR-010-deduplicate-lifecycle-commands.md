---
type: Requirement
title: "Ignore redelivered lifecycle commands"
description: "A lifecycle command whose commandId the order has already applied is refused without writing anything."
tags: [functional, order-cancellation]
status: draft
id: "FR-010"
priority: "must"
implementation: "implemented"
capability: "/capabilities/order-cancellation.md"
generated: { by: claude-code/claude-opus-5-5, at: "2026-10-27T17:30:00Z" }
sources:
  - resource: "repo:oms-core/src/main/java/org/example/oms/service/lifecycle/tasks/DeduplicateCommandTask.java"
  - resource: "repo:oms-core/src/main/java/org/example/oms/service/lifecycle/tasks/LoadOrderTask.java"
  - resource: "repo:oms-core/src/main/resources/db/changelog/006-order-event-command-id.yaml"
  - resource: "repo:oms-core/src/test/java/org/example/oms/integration/OrderLifecycleIntegrationTest.java"
  - resource: "repo:oms-core/src/test/java/org/example/oms/integration/CommandIdBackfillMigrationIntegrationTest.java"
  - resource: "repo:oms-core/src/test/java/org/example/oms/service/lifecycle/OrderLifecycleCommandProcessorTest.java"
  - resource: "repo:oms-core/src/test/java/org/example/oms/integration/ExchangeWorkflowIntegrationTest.java"
---
# Ignore redelivered lifecycle commands

Each event in the order's log stores its command's `commandId` in `order_events.command_id`, under a
unique `(order_id, command_id)` constraint. `DeduplicateCommandTask` refuses a lifecycle command
when that lookup finds the id (`existsByOrderIdAndCommandId`), without reading the order's history.
A `commandId` names one command: any lifecycle command (reject, cancel, cancel request, cancel
reject) that reuses an id the order has already applied is refused, whatever its type. This catches
replays that state preconditions alone would accept (e.g. a cancel request after a cancel reject).
Commands without a commandId rely on their state preconditions and leave `command_id` null.

A refusal leaves the order and its log unchanged: REST answers `400` with status `FAILED` and a
message naming the `commandId`; Kafka acknowledges the record without retrying or dead-lettering it.

Concurrent copies of one command are serialised: the lifecycle pipeline loads the order under a row
lock (`SELECT … FOR UPDATE`, `OrderRepository.findLockedByOrderId`), so the second copy waits, then
sees the first copy's committed event and is refused as a duplicate. The unique constraint is the
integrity backstop. Events written before the column existed were backfilled from their stored
command (Liquibase `006-order-event-command-id.yaml`), so a redelivery of a command applied before
the upgrade is refused too.

Capability: [order-cancellation](../capabilities/order-cancellation.md).
