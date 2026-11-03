---
type: Domain Concept
title: "Execution"
description: "A fill reported by a venue against an order, persisted in the executions table, identified by (orderId, execId) and carrying the order's average price as of that fill."
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
  `PersistExecutionTask` checks `existsByOrderIdAndExecId` first, so a redelivered execution is
  refused without changing anything ([FR-017](../functional-requirements/FR-017-reject-duplicate-execution.md)).

## Fields

| Field | Meaning |
|---|---|
| `orderId`, `execId` | The business key of a fill: the order it belongs to and the venue's execution id, unique per order only (column `execid`; the Java field was `execID` before SPEC-0041) |
| `id`, `secondaryExecID` | Database surrogate key (never the identity: the blotters key rows by `orderId` + `execId`); secondary venue id, not populated. The `execution_id` column is unmapped since SPEC-0041 |
| `lastQty`, `lastPx` | Quantity and price of this fill |
| `cumQty`, `leavesQty` | Order totals after this fill, as computed by the OMS |
| `avgPx` | The order's volume-weighted average price after this fill: Σ(lastQty × lastPx) over its applied fills ÷ `cumQty`, scale 8, HALF_EVEN, computed by `CalculateOrderQuantitiesTask` (SPEC-0041). Null for fills stored before SPEC-0041 |
| `dayOrderQty`, `dayCumQty`, `dayAvgPx` | Not populated |
| `execType`, `lastCapacity`, `lastMkt` | FIX ExecType, capacity and venue of the fill |
| `transactTime`, `creationDate` | Venue time of the fill; time the OMS stored it |

Bust (cancel) and correction of executions are specified but not built; see
[Execution Reporting](../oms-concepts/execution-reporting.md) and the known gaps of
[Execution Processing](../capabilities/execution-processing.md).

## Related

- [Order](order.md), [Order Quantities](order-quantities.md), [Glossary](glossary.md)
