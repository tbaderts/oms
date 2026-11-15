---
type: Capability
title: "Execution Processing"
description: "Applying venue fills to orders; busts, corrections and manual cancels are recorded in the event log but have no command handlers yet."
tags: [executions, fills, quantities]
status: draft
updated: "2026-11-14T12:00:00Z"
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

Fills reported by a venue update the order's quantities and state. The event log can already record busts,
corrections and whacks of an execution (`EXEC_BUST`, `EXEC_CORRECT`, `EXEC_WHACK`, SPEC-0044), but
`ExecutionBustCmd` and `ExecutionWhackCmd` have no handler yet (SPEC-0030).

## Actors

The market (today the [exchange simulator](exchange-simulation.md)); operators for busts and whacks (planned).

## Behaviour

`ExecutionCommandProcessor` runs: `DeduplicateCommandTask` → `ValidateExecutionTask` →
`CalculateOrderQuantitiesTask` → `DetermineOrderStateTask` → `PersistExecutionTask` →
`UpdateOrderTask` → `PublishExecutionEventTask` → `ProjectTask`.

The order is loaded under its row **lock** first (SPEC-0048), as lifecycle commands do. Concurrent
fills on one order, from any instance or path, wait for each other and then apply on top, rather
than racing for the next event version and failing. The version check stays as the safety net. Once
order trees exist, the root order is locked first (SPEC-0022).

Since SPEC-0046:
- **Duplicate commandIds.** A fill whose commandId the order already applied is refused as a
  duplicate, even with a new execId: REST answers 409 `urn:oms:error:duplicate-command`, and Kafka
  acknowledges it. A repeated execId is still refused by `PersistExecutionTask` (FR-017).
- **Every fill stores its command.** The processor requires the `ExecutionCreateCmd`; the
  command-less overload is gone.
- **Command log.** Every fill command, applied or not, is recorded in the
  [command log](../domain/model/command-log.md).

## Use cases

- [UC-005 Report a fill](use-cases/UC-005-report-fill.md)
- [UC-006 Correct an execution (planned)](use-cases/UC-006-correct-execution.md)

## Requirements

- [FR-013 Apply fills to LIVE orders](functional-requirements/FR-013-apply-fills.md)
- [FR-014 Publish fills with the resulting position](functional-requirements/FR-014-publish-fills.md)
- [FR-015 Bust executions](functional-requirements/FR-015-bust-executions.md)
- [FR-016 Manually cancel (whack) executions](functional-requirements/FR-016-whack-executions.md)
- [FR-017 Reject duplicate executions](functional-requirements/FR-017-reject-duplicate-execution.md)
- [NFR-001 Idempotent command handling](non-functional-requirements/NFR-001-idempotent-command-handling.md)

## Interfaces and domain

[Command API](../domain/interfaces/command-api.md), [Kafka Topics](../domain/interfaces/message-api.md); [Execution](../domain/model/execution.md), [Order Quantities](../domain/model/order-quantities.md).

## Detailed specifications

- [Execution Reporting](../domain/concepts/execution-reporting.md)
- [Order Quantity Calculations](../domain/concepts/order-quantity-calculations.md)
- [Order Allocation Diagrams](../architecture/illustrations/order-allocation-diagrams.md)

## Known gaps

- `ExecutionBustCmd` and `ExecutionWhackCmd` have schemas but no handler (FR-015, FR-016).
- The over-fill guard (a fill that would make `cumQty` exceed `orderQty` is refused) has no dedicated test.
- The average price is computed per fill (`Execution.avgPx`, SPEC-0041) but not kept on the order:
  `Order`, `OrderDto` and the orders blotter have no `avgPx`. Fills stored before SPEC-0041 have none.
- Execution Reporting describes trade corrections and order-tree propagation that are not built.
- No SLA ingress time is taken for an `ExecutionCreateCmd` received over REST. Its command is
  recorded in the fill's event, as over Kafka (SPEC-0018).
- Differences from [Order Lifecycle](../domain/concepts/order-lifecycle.md), which reads as current behaviour:
  - §9.4 "Fill Without Acknowledgment" says to process a fill that arrives before the ack; the code
    refuses any fill unless the order is LIVE (FR-013).
  - §4.6 "UNACK → FILLED (Immediate Fill)" is not in the standard state machine.

## Verification

`ExchangeWorkflowIntegrationTest`, `EventSourcingIntegrationTest`, `OrderLifecycleIntegrationTest`, `OrderMapperExecutionTest`. Conventions: [Testing Patterns](../delivery/testing.md).
