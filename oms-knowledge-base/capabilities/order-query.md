---
type: Capability
title: "Order Query"
description: "Reading orders, executions, event logs and entity metadata."
tags: [query, read-model, api]
status: draft
updated: "2026-11-14T12:00:00Z"
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
see [decision](../architecture/decisions/ADR-003-shared-table-cqrs.md)); the query side never mutates.

## Use cases

- [UC-007 Search and inspect orders](use-cases/UC-007-inspect-orders.md)

## Requirements

- [FR-018 Search orders with dynamic filters](functional-requirements/FR-018-search-orders.md)
- [FR-019 Describe entities for the UI](functional-requirements/FR-019-describe-entities.md)
- [FR-053 Read the event log of an order](functional-requirements/FR-053-read-order-history.md)
- [FR-054 Serve fills with the order as of each fill](functional-requirements/FR-054-serve-fills-with-order.md)

## Interfaces and domain

[Query API](../domain/interfaces/query-api.md), [REST Read API](../domain/interfaces/rest-read-api.md).

## Detailed specifications

- [Query Engine](../framework/query-engine.md) — how queries are answered: filters, paging, sorting, read services
- [State Store](../architecture/concepts/state-store.md) — the tables queries read
- [State-Query Store](../archive/state-query-store.md) — archived design of a separate read store; not built

## Known gaps

- `/api/orders` and `/api/executions` have no automated tests and are not in the OpenAPI contracts. The event log is contracted as `getOrderEvents` in the [Query API](../domain/interfaces/query-api.md) (SPEC-0035).
- No separate read-optimised store exists; the State-Query Store specification evaluates options only.

## Verification

`OrderSpecificationsIntegrationTest`, `OrderEventQueryIntegrationTest`, `MetamodelServiceTest`. Conventions: [Testing Patterns](../delivery/testing.md).
