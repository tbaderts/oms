---
type: Domain Concept
title: "Execution"
description: "A fill reported by a venue against an order, persisted in the executions table and unique per order and execID."
tags: [execution, fill, entity]
status: draft
entity: "Execution"
generated: { by: claude-code/claude-opus-5-5, at: "2026-10-27T17:30:00Z" }
sources:
  - resource: "repo:oms-core/src/main/java/org/example/common/model/Execution.java"
  - resource: "repo:oms-core/src/main/resources/db/changelog/003-event-sourcing-and-outbox.yaml"
  - resource: "repo:oms-contracts/src/main/avro/Execution.avsc"
  - resource: "repo:oms-core/src/main/java/org/example/oms/service/execution/tasks/PersistExecutionTask.java"
  - resource: "repo:oms-core/src/test/java/org/example/oms/integration/EventSourcingIntegrationTest.java"
---
# Execution

An execution is a venue's report that part or all of an order traded: a quantity (`lastQty`) at a
price (`lastPx`). Applying it changes the order's quantities and possibly its state (see
[Execution Processing](../capabilities/execution-processing.md)).

## Persistence

- Table `executions`, entity `org.example.common.model.Execution`, index on `order_id`.
- **Uniqueness**: constraint `uq_executions_order_id_execid` on `(order_id, execid)`, and
  `PersistExecutionTask` checks `existsByOrderIdAndExecID` first, so a redelivered execution is
  refused without changing anything ([FR-017](../functional-requirements/FR-017-reject-duplicate-execution.md)).

## Fields

| Field | Meaning |
|---|---|
| `orderId`, `executionId`, `execID`, `secondaryExecID` | Order it belongs to; OMS and venue identifiers |
| `lastQty`, `lastPx` | Quantity and price of this fill |
| `cumQty`, `leavesQty` | Order totals after this fill, as computed by the OMS |
| `avgPx`, `dayOrderQty`, `dayCumQty`, `dayAvgPx` | Values as carried by the report; the OMS does not compute an average price |
| `execType`, `lastCapacity`, `lastMkt` | FIX ExecType, capacity and venue of the fill |
| `transactTime`, `creationDate` | Venue time of the fill; time the OMS stored it |

Bust (cancel) and correction of executions are specified but not built; see
[Execution Reporting](../oms-concepts/execution-reporting.md) and the known gaps of
[Execution Processing](../capabilities/execution-processing.md).

## Related

- [Order](order.md), [Order Quantities](order-quantities.md), [Glossary](glossary.md)
