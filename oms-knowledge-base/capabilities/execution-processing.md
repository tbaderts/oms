---
type: Capability
title: "Execution Processing"
description: "Applying venue fills to orders; busts and manual cancels of executions are specified but not built."
tags: [executions, fills, quantities]
status: draft
maturity: "partial"
commands: ["ExecutionCreateCmd", "ExecutionBustCmd", "ExecutionWhackCmd"]
generated: { by: claude-code/claude-opus-5-5, at: "2026-10-27T17:30:00Z" }
sources:
  - resource: "repo:oms-core/src/main/java/org/example/oms/service/execution/ExecutionCommandProcessor.java"
  - resource: "repo:oms-core/src/main/java/org/example/oms/service/execution/tasks/ValidateExecutionTask.java"
  - resource: "repo:oms-core/src/main/java/org/example/oms/service/execution/tasks/CalculateOrderQuantitiesTask.java"
  - resource: "repo:oms-core/src/main/java/org/example/oms/service/execution/tasks/DetermineOrderStateTask.java"
  - resource: "repo:oms-core/src/main/java/org/example/oms/service/execution/tasks/UpdateOrderTask.java"
  - resource: "repo:oms-core/src/main/java/org/example/oms/service/execution/tasks/PersistExecutionTask.java"
---
# Execution Processing

## Summary

Fills reported by a venue update the order's quantities and state. Corrections (bust, whack) are not built yet.

## Actors

The market (today the [exchange simulator](exchange-simulation.md)); operators for busts and whacks (planned).

## Behaviour

`ExecutionCommandProcessor` runs: `ValidateExecutionTask` → `CalculateOrderQuantitiesTask` →
`DetermineOrderStateTask` → `PersistExecutionTask` → `UpdateOrderTask` → `PublishExecutionEventTask`.

## Requirements

- [FR-013 Apply fills to LIVE orders](../functional-requirements/FR-013-apply-fills.md)
- [FR-014 Publish fills with the resulting position](../functional-requirements/FR-014-publish-fills.md)
- [FR-015 Bust executions](../functional-requirements/FR-015-bust-executions.md)
- [FR-016 Manually cancel (whack) executions](../functional-requirements/FR-016-whack-executions.md)
- [FR-017 Reject duplicate executions](../functional-requirements/FR-017-reject-duplicate-execution.md)
- [NFR-001 Idempotent command handling](../non-functional-requirements/NFR-001-idempotent-command-handling.md)

## Interfaces and domain

[Command API](../interfaces/command-api.md), [Kafka Topics](../interfaces/kafka-topics.md); [Execution](../domain/execution.md), [Order Quantities](../domain/order-quantities.md).

## Detailed specifications

- [Execution Reporting](../oms-concepts/execution-reporting.md)
- [Order Quantity Calculations](../oms-concepts/order-quantity-calculations.md)
- [Order Allocation Diagrams](../illustrations/order_allocation_diagrams.md)

## Known gaps

- `ExecutionBustCmd` and `ExecutionWhackCmd` have schemas but no handler (FR-015, FR-016).
- The over-fill guard (a fill that would make `cumQty` exceed `orderQty` is refused) has no dedicated test.
- The OMS does not compute an average price; `avgPx` is taken from the report.
- Execution Reporting describes trade corrections and order-tree propagation that are not built.
- No SLA ingress time is taken for an `ExecutionCreateCmd` received over REST. Its command is
  recorded in the fill's event, as over Kafka (SPEC-0018).
- Differences from [Order Lifecycle](../oms-concepts/order-lifecycle.md), which reads as current behaviour:
  - §9.4 "Fill Without Acknowledgment" says to process a fill that arrives before the ack; the code
    refuses any fill unless the order is LIVE (FR-013).
  - §4.6 "UNACK → FILLED (Immediate Fill)" is not in the standard state machine.

## Verification

`ExchangeWorkflowIntegrationTest`, `EventSourcingIntegrationTest`, `OrderLifecycleIntegrationTest`, `OrderMapperExecutionTest`. Conventions: [Testing Patterns](../oms-framework/testing-patterns.md).
