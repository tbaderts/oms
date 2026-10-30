---
type: Requirement
title: "Publish fills with the resulting position"
description: "Each applied fill stages the execution and the updated order for publication, carrying the fill and the resulting cumQty and leavesQty."
tags: [functional, execution-processing]
status: draft
id: "FR-014"
priority: "must"
implementation: "implemented"
capability: "/capabilities/execution-processing.md"
generated: { by: claude-code/claude-opus-5-5, at: "2026-10-27T17:30:00Z" }
sources:
  - resource: "repo:oms-core/src/main/java/org/example/oms/service/execution/tasks/PublishExecutionEventTask.java"
  - resource: "repo:oms-core/src/main/java/org/example/oms/service/OrderEventAppender.java"
  - resource: "repo:oms-core/src/test/java/org/example/oms/integration/EventSourcingIntegrationTest.java"
---
# Publish fills with the resulting position

Staged through the outbox (see [Event Publication](../capabilities/event-publication.md)) on `oms_executions` and `oms_orders`.

Capability: [execution-processing](../capabilities/execution-processing.md).
