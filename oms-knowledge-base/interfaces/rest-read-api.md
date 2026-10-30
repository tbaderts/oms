---
type: Interface
title: "REST Read API"
description: "Hand-written read endpoints for orders, executions, order events and the entity metamodel."
tags: [api, rest, read]
status: draft
covers: ["http:/api/orders", "http:/api/executions", "http:/api/order-events", "http:/api/v1/metamodel"]
generated: { by: claude-code/claude-opus-5-5, at: "2026-10-27T17:30:00Z" }
sources:
  - resource: "repo:oms-core/src/main/java/org/example/oms/api/OrderController.java"
  - resource: "repo:oms-core/src/main/java/org/example/oms/api/ExecutionController.java"
  - resource: "repo:oms-core/src/main/java/org/example/oms/api/OrderEventController.java"
  - resource: "repo:oms-core/src/main/java/org/example/oms/api/MetamodelController.java"
  - resource: "repo:oms-core/src/test/java/org/example/oms/service/MetamodelServiceTest.java"
---
# REST Read API

Read-only endpoints in oms-core that are not (yet) part of the OpenAPI contracts:

| Endpoint | Returns |
|---|---|
| `GET /api/orders`, `/api/orders/{id}`, `/api/orders/orderId/{orderId}` | Orders (list, by database id, by orderId) |
| `GET /api/executions`, `/api/executions/{id}` | Executions |
| `GET /api/order-events/orderId/{orderId}` | The event log of one order |
| `GET /api/v1/metamodel`, `/{entityName}`, `/entities` | Field metadata of the entities, used by the UI to build columns and filters |

Known gap: these endpoints are hand-written, not generated from a contract, unlike the
[Command API](command-api.md) and [Query API](query-api.md). Capability:
[Order Query](../capabilities/order-query.md).
