---
type: Domain Concept
title: "Order Quantities"
description: "How orderQty, cumQty and leavesQty are set and changed by creation, fills, cancels and rejects as built, and which quantity fields are not maintained yet."
tags: [quantities, fills, order]
status: draft
generated: { by: claude-code/claude-opus-5-5, at: "2026-10-27T17:30:00Z" }
sources:
  - resource: "repo:oms-core/src/main/java/org/example/oms/service/command/tasks/SetOrderStateTask.java"
  - resource: "repo:oms-core/src/main/java/org/example/oms/service/execution/tasks/CalculateOrderQuantitiesTask.java"
  - resource: "repo:oms-core/src/main/java/org/example/oms/service/lifecycle/tasks/ApplyLifecycleActionTask.java"
  - resource: "repo:oms-core/src/main/java/org/example/oms/mapper/OrderMapper.java"
  - resource: "repo:oms-core/src/test/java/org/example/oms/service/command/tasks/SetOrderStateTaskTest.java"
  - resource: "repo:oms-core/src/test/java/org/example/oms/integration/ExchangeWorkflowIntegrationTest.java"
---
# Order Quantities

## Rules as built

| Event | Effect |
|---|---|
| Order created | `cumQty` = 0, `leavesQty` = `orderQty` (the whole quantity is open) |
| Execution applied | `cumQty` = previous `cumQty` + `lastQty`; `leavesQty` = `orderQty` − `cumQty`; a fill that would make `cumQty` exceed `orderQty` is refused |
| Cancel or reject | `leavesQty` = 0, `cumQty` unchanged (what traded stays traded) |

Quantities are `BigDecimal`, scaled with HALF_UP rounding.

## Not maintained yet

`placeQty` (quantity placed in the market) and `allocQty` (quantity allocated to accounts) exist
on the entity but are ignored by the mappers and set by nothing. The order-tree semantics for them
are specified in [Order Quantity Calculations](../oms-concepts/order-quantity-calculations.md) and
belong to planned capabilities ([Order Grouping](../capabilities/order-grouping.md),
[Block Allocation](../capabilities/block-allocation.md)).

## Related

- [Order](order.md), [Execution](execution.md), [Order State](order-state.md)
