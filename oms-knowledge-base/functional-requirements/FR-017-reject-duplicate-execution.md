---
type: Requirement
title: "Reject duplicate executions"
description: "An execution with an execID already applied to the order is refused and changes nothing."
tags: [functional, execution-processing]
status: draft
id: "FR-017"
priority: "must"
implementation: "implemented"
capability: "/capabilities/execution-processing.md"
generated: { by: claude-code/claude-opus-5-5, at: "2026-10-27T17:30:00Z" }
sources:
  - resource: "repo:oms-core/src/main/java/org/example/oms/service/execution/tasks/PersistExecutionTask.java"
  - resource: "repo:oms-core/src/main/resources/db/changelog/003-event-sourcing-and-outbox.yaml"
  - resource: "repo:oms-core/src/test/java/org/example/oms/integration/EventSourcingIntegrationTest.java"
---
# Reject duplicate executions

`PersistExecutionTask` checks `existsByOrderIdAndExecID`; the unique constraint `uq_executions_order_id_execid` backs it under concurrency.

Capability: [execution-processing](../capabilities/execution-processing.md).
