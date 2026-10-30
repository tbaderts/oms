---
type: Requirement
title: "Apply fills to LIVE orders"
description: "An ExecutionCreateCmd for a LIVE order adds lastQty to cumQty, recomputes leavesQty, keeps the order LIVE or moves it to FILLED, and records PARTIAL_FILL or FILL."
tags: [functional, execution-processing]
status: draft
id: "FR-013"
priority: "must"
implementation: "implemented"
capability: "/capabilities/execution-processing.md"
generated: { by: claude-code/claude-opus-5-5, at: "2026-10-27T17:30:00Z" }
sources:
  - resource: "repo:oms-core/src/main/java/org/example/oms/service/execution/ExecutionCommandProcessor.java"
  - resource: "repo:oms-core/src/main/java/org/example/oms/service/execution/tasks/ValidateExecutionTask.java"
  - resource: "repo:oms-core/src/main/java/org/example/oms/service/execution/tasks/CalculateOrderQuantitiesTask.java"
  - resource: "repo:oms-core/src/main/java/org/example/oms/service/execution/tasks/DetermineOrderStateTask.java"
  - resource: "repo:oms-core/src/main/java/org/example/oms/service/execution/tasks/UpdateOrderTask.java"
  - resource: "repo:oms-core/src/test/java/org/example/oms/integration/ExchangeWorkflowIntegrationTest.java"
  - resource: "repo:oms-core/src/test/java/org/example/oms/integration/EventSourcingIntegrationTest.java"
  - resource: "repo:oms-core/src/test/java/org/example/oms/integration/OrderLifecycleIntegrationTest.java"
---
# Apply fills to LIVE orders

Required: orderId, execID, positive lastQty and lastPx, and the order in LIVE (an execution before
the acknowledgement is refused). `cumQty` += `lastQty`; `leavesQty` = `orderQty` − `cumQty`;
FILLED when `leavesQty` = 0. The execution and the updated order are persisted in one transaction.

Capability: [execution-processing](../capabilities/execution-processing.md).
