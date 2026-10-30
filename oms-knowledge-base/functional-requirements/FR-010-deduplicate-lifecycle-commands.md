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
  - resource: "repo:oms-core/src/test/java/org/example/oms/service/lifecycle/OrderLifecycleCommandProcessorTest.java"
  - resource: "repo:oms-core/src/test/java/org/example/oms/integration/ExchangeWorkflowIntegrationTest.java"
---
# Ignore redelivered lifecycle commands

`DeduplicateCommandTask` looks up the `commandId` in the order's event log. This catches replays
that state preconditions alone would accept (e.g. a cancel request after a cancel reject). Commands
without a commandId rely on their state preconditions. Applies to reject as well.

Capability: [order-cancellation](../capabilities/order-cancellation.md).
