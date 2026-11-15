---
type: Domain Concept
title: "Order-Execution Projection"
description: "One row per applied fill with the order as of that fill: the read model behind GET /api/query/executions and the oms_order_executions topic, written in the fill's transaction and rebuildable from the event log."
tags: [projection, execution, read-model, entity]
status: draft
updated: "2026-11-14T12:00:00Z"
entity: "OrderExecutionProjectionRow"
generated: { by: claude-code/claude-opus-5-5, at: "2026-11-14T12:00:00Z" }
sources:
  - resource: "repo:oms-core/src/main/java/org/example/oms/model/OrderExecutionProjectionRow.java"
  - resource: "repo:oms-core/src/main/java/org/example/oms/projection/OrderExecutionProjection.java"
  - resource: "repo:oms-core/src/main/java/org/example/oms/service/OrderExecutionProjectionQueryService.java"
  - resource: "repo:oms-core/src/test/java/org/example/oms/integration/ProjectionIntegrationTest.java"
  - resource: "repo:oms-core/src/test/java/org/example/oms/integration/ProjectionRebuildIntegrationTest.java"
---
# Order-Execution Projection

Table `order_execution_projection` (entity `OrderExecutionProjectionRow`, SPEC-0020, renamed from
`order_execution_view` in SPEC-0045). Each row is one applied fill together with the order **as of
that fill**, so a consumer needs no join and no second message to know the order's state at the
time.

| Group | Fields |
|---|---|
| Identity | `orderId`, `execId` (unique together), `rootOrderId`, `parentOrderId`, `leg` |
| Order | `clOrdId`, `sessionId`, `account`, `side`, `symbol`, `securityId`, `ordType`, `price`, `orderQty`, `settlCurrency`, `exDestination` |
| Fill | `lastQty`, `lastPx`, `execType`, `lastCapacity`, `lastMkt`, `transactTime` |
| Order after the fill | `cumQty`, `leavesQty`, `avgPx`, `state`, and the order version it was projected at |

- **Written** only in the fill's command transaction by `OrderExecutionProjection`, or by a
  rebuild from the event log (`ProjectionRebuilder`). Re-projecting a fill rewrites its row.
- **Read** by `GET /api/query/executions` ([Query API](../interfaces/query-api.md)) and published
  as `OrderExecution` on `oms_order_executions` ([Message API](../interfaces/message-api.md)).
- How projections work in general: [Projections](../../architecture/concepts/projections.md).

Related: [Execution](execution.md), [Order Event](order-event.md).
