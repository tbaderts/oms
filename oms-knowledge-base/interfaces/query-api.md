---
type: Interface
title: "Query API"
description: "The contract-first search endpoint for orders with dynamic filters, sorting and pagination."
tags: [api, query, search]
status: draft
covers: ["openapi:/search", "http:/api/query"]
generated: { by: claude-code/claude-opus-5-5, at: "2026-10-27T17:30:00Z" }
sources:
  - resource: "repo:oms-contracts/src/main/openapi/oms-query-api.yml"
  - resource: "repo:oms-core/src/main/java/org/example/oms/api/QueryController.java"
  - resource: "repo:oms-core/src/main/java/org/example/oms/service/OrderQueryService.java"
  - resource: "repo:oms-core/src/main/java/org/example/oms/service/OrderSpecifications.java"
  - resource: "repo:oms-core/src/test/java/org/example/oms/integration/OrderSpecificationsIntegrationTest.java"
---
# Query API

Defined in `oms-query-api.yml` as `/search`; implemented by `QueryController` (generated
`SearchApi`) under `/api/query`. Filters are translated into JPA Specifications by
`OrderSpecifications` (equality, `like`, ranges); invalid numeric filter values are ignored rather
than failing the query. Results are paginated.

Used by the trade blotter's initial snapshot ([Real-time Streaming](../capabilities/real-time-streaming.md)),
the admin UI and the MCP server's `searchOrders` tool. Capability: [Order Query](../capabilities/order-query.md).
