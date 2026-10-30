---
type: Requirement
title: "Accept new orders"
description: "An OrderCreateCmd received over REST or Kafka creates an order with an OMS orderId in state UNACK with its whole quantity open."
tags: [functional, order-capture]
status: draft
id: "FR-001"
priority: "must"
implementation: "implemented"
capability: "/capabilities/order-capture.md"
generated: { by: claude-code/claude-opus-5-5, at: "2026-10-27T17:30:00Z" }
sources:
  - resource: "repo:oms-core/src/main/java/org/example/oms/service/command/OrderCreateCommandProcessor.java"
  - resource: "repo:oms-core/src/main/java/org/example/oms/service/command/tasks/AssignOrderIdTask.java"
  - resource: "repo:oms-core/src/main/java/org/example/oms/service/command/tasks/SetOrderStateTask.java"
  - resource: "repo:oms-core/src/test/java/org/example/oms/api/CommandControllerWebMvcTest.java"
  - resource: "repo:oms-core/src/test/java/org/example/oms/config/CommandListenerTest.java"
  - resource: "repo:oms-core/src/test/java/org/example/oms/service/command/tasks/SetOrderStateTaskTest.java"
---
# Accept new orders

When the OMS receives an `OrderCreateCmd` on `POST /api/command/execute` or on the `commands`
topic, it validates the order, assigns an `orderId`, sets the state NEW → UNACK through the state
machine, sets `cumQty` = 0 and `leavesQty` = `orderQty`, stamps `transactTime` (and `sendingTime`
if missing), persists the order and answers 201 with the new orderId.

Capability: [order-capture](../capabilities/order-capture.md).
