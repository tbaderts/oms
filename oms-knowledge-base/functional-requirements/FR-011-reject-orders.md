---
type: Requirement
title: "Apply market rejects"
description: "An OrderRejectCmd on an UNACK or LIVE order moves it to REJ, closes the open quantity and stores the reason truncated to the column width."
tags: [functional, order-rejection]
status: draft
id: "FR-011"
priority: "must"
implementation: "implemented"
capability: "/capabilities/order-rejection.md"
generated: { by: claude-code/claude-opus-5-5, at: "2026-10-27T17:30:00Z" }
sources:
  - resource: "repo:oms-core/src/main/java/org/example/oms/service/lifecycle/OrderLifecycleCommandProcessor.java"
  - resource: "repo:oms-core/src/main/java/org/example/oms/service/lifecycle/LifecycleAction.java"
  - resource: "repo:oms-core/src/main/java/org/example/oms/service/lifecycle/tasks/ValidateLifecycleActionTask.java"
  - resource: "repo:oms-core/src/main/java/org/example/oms/service/lifecycle/tasks/ApplyLifecycleActionTask.java"
  - resource: "repo:oms-core/src/test/java/org/example/oms/service/lifecycle/OrderLifecycleCommandProcessorTest.java"
  - resource: "repo:oms-core/src/test/java/org/example/oms/integration/ExchangeWorkflowIntegrationTest.java"
---
# Apply market rejects

Refused on terminal orders. A reject without text clears an earlier reason. The client's `text` is
never changed. Event `REJ`; no execution is created.

Capability: [order-rejection](../capabilities/order-rejection.md).
