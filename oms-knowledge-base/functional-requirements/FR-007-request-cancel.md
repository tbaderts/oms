---
type: Requirement
title: "Accept cancel requests"
description: "An OrderCancelRequestCmd on a LIVE order with open quantity and no pending cancel sets cancelState PCXL, keeps the state and clears an earlier reject reason."
tags: [functional, order-cancellation]
status: draft
id: "FR-007"
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
# Accept cancel requests

A cancel request is refused on UNACK or terminal orders, on orders without open quantity, and when
a cancel is already pending. On success only `cancelState` changes (→ PCXL); event `CXL_REQUEST`.

Capability: [order-cancellation](../capabilities/order-cancellation.md).
