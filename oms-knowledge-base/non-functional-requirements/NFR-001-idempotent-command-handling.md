---
type: Requirement
title: "Idempotent command handling"
description: "A command delivered more than once has exactly one effect."
tags: [non-functional, reliability]
status: draft
id: "NFR-001"
priority: "must"
implementation: "implemented"
capability: "/capabilities/order-capture.md"
category: "reliability"
metric: "Second effects caused by a redelivered command"
target: "0"
generated: { by: claude-code/claude-opus-5-5, at: "2026-10-27T17:30:00Z" }
sources:
  - resource: "repo:oms-core/src/main/java/org/example/oms/service/lifecycle/tasks/DeduplicateCommandTask.java"
  - resource: "repo:oms-core/src/main/java/org/example/oms/service/execution/tasks/PersistExecutionTask.java"
  - resource: "repo:oms-core/src/main/java/org/example/oms/service/command/tasks/PersistOrderTask.java"
  - resource: "repo:oms-core/src/main/resources/db/changelog/002-order-idempotency-constraint.yaml"
  - resource: "repo:oms-core/src/test/java/org/example/oms/integration/ExchangeWorkflowIntegrationTest.java"
  - resource: "repo:oms-core/src/test/java/org/example/oms/integration/EventSourcingIntegrationTest.java"
  - resource: "repo:oms-core/src/test/java/org/example/oms/service/command/tasks/PersistOrderTaskTest.java"
---
# Idempotent command handling

| Category | Metric | Target |
|---|---|---|
| reliability | Second effects caused by a redelivered command | 0 |

Kafka redelivers and clients retry, so every command type has a guard: order creation by
`(sessionId, clOrdId)` ([FR-004](../functional-requirements/FR-004-reject-duplicate-client-order-id.md)),
executions by `(orderId, execID)` ([FR-017](../functional-requirements/FR-017-reject-duplicate-execution.md)),
lifecycle commands by `commandId` and state preconditions ([FR-010](../functional-requirements/FR-010-deduplicate-lifecycle-commands.md)).
Acceptance relies on its state precondition (UNACK → LIVE happens once).

Capability: [order-capture](../capabilities/order-capture.md).
