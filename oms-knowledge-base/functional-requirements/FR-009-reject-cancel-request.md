---
type: Requirement
title: "Apply cancel rejects"
description: "An OrderCancelRejectCmd on an order with a pending cancel sets cancelState REJ, stores the reason and keeps the order LIVE."
tags: [functional, order-cancellation]
status: draft
id: "FR-009"
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
# Apply cancel rejects

Refused when no cancel is pending (including after an earlier cancel reject). Event `CXL_REJ`.

Capability: [order-cancellation](../capabilities/order-cancellation.md).
