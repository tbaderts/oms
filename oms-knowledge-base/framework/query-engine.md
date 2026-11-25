---
type: Specification
title: "Query Engine"
description: "How oms-core answers queries: dynamic filters translated into JPA Specifications on the orders table, paging and sorting, the read services behind the Query API, and the rules a new query follows."
tags: [query, cqrs, jpa, specification, framework]
status: draft
updated: "2026-11-14T12:00:00Z"
sources:
  - resource: "repo:oms-core/src/main/java/org/example/oms/service/OrderQueryService.java"
  - resource: "repo:oms-core/src/main/java/org/example/oms/service/OrderSpecifications.java"
  - resource: "repo:oms-core/src/main/java/org/example/oms/api/QueryController.java"
  - resource: "repo:oms-core/src/main/java/org/example/oms/api/OrderEventController.java"
  - resource: "repo:oms-core/src/main/java/org/example/oms/api/ExecutionViewController.java"
  - resource: "repo:oms-core/src/test/java/org/example/oms/integration/OrderSpecificationsIntegrationTest.java"
---
# Query Engine

The read side of the OMS. Commands and queries have separate APIs and models (policy P-09), but
both use the same tables: there is no separate read store
([ADR-003](../architecture/decisions/ADR-003-shared-table-cqrs.md)). A query therefore sees every
committed change at once. The interfaces are documented on the [Query API](../domain/interfaces/query-api.md)
and [REST Read API](../domain/interfaces/rest-read-api.md) pages; this page is about how they are
answered.

## Order search

`GET /api/query/search` (`QueryController`, generated `SearchApi`) → `OrderQueryService.search` →
`OrderRepository.findAll(Specification, Pageable)`.

- **Filters** are query parameters named `<field>` or `<field>__<op>`. `OrderSpecifications.dynamic`
  turns each into a JPA predicate and ANDs them:

  | Field kind | Fields (examples) | Operations |
  |---|---|---|
  | Text | `orderId`, `clOrdId`, `symbol`, `account`, … | `eq` (default), `like` (case-insensitive contains) |
  | Number | `price`, `orderQty`, `cashOrderQty` | `eq`, `gt`, `gte`, `lt`, `lte`, `between` (`a,b`) |
  | Time | `sendingTime`, `transactTime`, … | `eq`, `gt`, `gte`, `lt`, `lte`, `between` |
  | Enum | `side`, `ordType`, `state`, `cancelState` | `eq` |

  An unknown field is logged and ignored. An unparseable number is ignored rather than failing
  the query.
- **Paging.** `page` (from 0) and `size` (1 to 500, default 50).
- **Sorting.** `sort=field,dir;field,dir`. Without it, newest first by database id.
- **Version.** Each result carries `eventVersion`, the order's `txNr`, read in the same row as the
  state. A client that needs to see its own change waits until search returns the order at the
  version its command result named (read-your-writes, SPEC-0050).

## Other reads

| Read | Endpoint | Served by |
|---|---|---|
| An order's event log | `GET /api/query/orders/{orderId}/events` | `OrderEventController` → `OrderEventReadService` (`order_events`) |
| An order's command log | `GET /api/query/orders/{orderId}/commands` | `OrderEventController` → `CommandLogReadService` (`command_log`) |
| Stored fills, searched like orders | `GET /api/query/executions/search` | `ExecutionViewController` → `ExecutionQueryService` with `ExecutionSpecifications` (`executions`; SPEC-0070) |
| Fills with their order | `GET /api/query/executions` | `ExecutionViewController` → `OrderExecutionProjectionQueryService` (`order_execution_projection`) |
| Field metadata | `GET /api/v1/metamodel` | `MetamodelService`, for the UI's columns and filters |

## Adding a query

1. Add the operation to `oms-contracts/src/main/openapi/oms-query-api.yml` and regenerate
   ([Contract-first Code Generation](../architecture/patterns/contract-first-codegen.md)).
2. Implement the generated interface in a controller in `oms-core/.../api`, delegating to a
   read-only (`@Transactional(readOnly = true)`) service in `.../service`.
3. Read through a repository or a projection table. Never call command processors or change state
   from a query.
4. Prove it with an integration test against PostgreSQL (see
   [Testing](../delivery/testing.md)), as `OrderSpecificationsIntegrationTest` does for filters.

## Not built

A query service on a read replica (SPEC-0021, proposal). The separate read store fed by replication
designed earlier is archived: [State-Query Store](../archive/state-query-store.md).
