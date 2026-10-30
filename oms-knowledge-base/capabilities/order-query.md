---
type: Capability
title: "Order Query"
description: "Reading orders, executions, event logs and entity metadata."
tags: [query, read-model, api]
status: draft
maturity: "implemented"
commands: []
generated: { by: claude-code/claude-opus-5-5, at: "2026-10-27T17:30:00Z" }
sources:
  - resource: "repo:oms-core/src/main/java/org/example/oms/api/QueryController.java"
  - resource: "repo:oms-core/src/main/java/org/example/oms/api/OrderController.java"
  - resource: "repo:oms-core/src/main/java/org/example/oms/api/ExecutionController.java"
  - resource: "repo:oms-core/src/main/java/org/example/oms/api/OrderEventController.java"
---
# Order Query

## Summary

Clients and tools read the current state of orders and executions, an order's event log and the entity metadata.

## Actors

Admin UI, streaming service (snapshot), MCP server, operators.

## Behaviour

Reads use the same `orders` and `executions` tables the commands write (shared-table CQRS,
see [decision](../architecture/shared-table-cqrs.md)); the query side never mutates.

## Requirements

- [FR-018 Search orders with dynamic filters](../functional-requirements/FR-018-search-orders.md)
- [FR-019 Describe entities for the UI](../functional-requirements/FR-019-describe-entities.md)

## Interfaces and domain

[Query API](../interfaces/query-api.md), [REST Read API](../interfaces/rest-read-api.md).

## Detailed specifications

- [State-Query Store CQRS Specification](../oms-framework/state-query-store_spec.md) (options for a separate read store; not built)
- [OMS State Store](../oms-framework/oms-state-store.md)

## Known gaps

- `/api/orders`, `/api/executions` and `/api/order-events` have no automated tests and are not in the OpenAPI contracts.
- No separate read-optimised store exists; the State-Query Store specification evaluates options only.

## Verification

`OrderSpecificationsIntegrationTest`, `MetamodelServiceTest`. Conventions: [Testing Patterns](../oms-framework/testing-patterns.md).
