---
type: Requirement
title: "Apply market cancels"
description: "An OrderCancelCmd moves a LIVE order to CXL with cancelState CXL, sets leavesQty to 0 and keeps cumQty."
tags: [functional, order-cancellation]
status: draft
id: "FR-008"
priority: "must"
implementation: "implemented"
capability: "/capabilities/order-cancellation.md"
generated: { by: claude-code/claude-opus-5-5, at: "2026-10-27T17:30:00Z" }
sources:
  - resource: "repo:oms-core/src/main/java/org/example/oms/service/lifecycle/OrderLifecycleCommandProcessor.java"
  - resource: "repo:oms-core/src/main/java/org/example/oms/service/lifecycle/LifecycleAction.java"
  - resource: "repo:oms-core/src/main/java/org/example/oms/service/lifecycle/tasks/ValidateLifecycleActionTask.java"
  - resource: "repo:oms-core/src/main/java/org/example/oms/service/lifecycle/tasks/ApplyLifecycleActionTask.java"
  - resource: "repo:oms-core/src/test/java/org/example/oms/service/lifecycle/OrderLifecycleCommandProcessorTest.java"
  - resource: "repo:oms-core/src/test/java/org/example/oms/integration/ExchangeWorkflowIntegrationTest.java"
---
# Apply market cancels

Whether or not a cancel was requested, a market cancel closes the open quantity: state CXL,
cancelState CXL, `leavesQty` = 0, `cumQty` unchanged. The client's `text` and the `rejectReason`
are not touched. Refused on terminal orders. Event `CXL`.

Capability: [order-cancellation](../capabilities/order-cancellation.md).
