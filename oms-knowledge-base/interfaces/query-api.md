---
type: Interface
title: "Query API"
description: "The contract-first search endpoint for orders with dynamic filters, sorting and pagination."
tags: [api, query, search]
status: draft
covers: ["openapi:/search", "openapi:/orders/{orderId}/events", "openapi:/executions", "http:/api/query"]
generated: { by: claude-code/claude-opus-5-5, at: "2026-10-27T17:30:00Z" }
sources:
  - resource: "repo:oms-contracts/src/main/openapi/oms-query-api.yml"
  - resource: "repo:oms-core/src/main/java/org/example/oms/api/QueryController.java"
  - resource: "repo:oms-core/src/main/java/org/example/oms/api/OrderEventController.java"
  - resource: "repo:oms-core/src/main/java/org/example/oms/api/ExecutionViewController.java"
  - resource: "repo:oms-core/src/test/java/org/example/oms/integration/ExecutionViewQueryIntegrationTest.java"
  - resource: "repo:oms-core/src/test/java/org/example/oms/integration/OrderEventQueryIntegrationTest.java"
  - resource: "repo:oms-core/src/main/java/org/example/oms/service/OrderQueryService.java"
  - resource: "repo:oms-core/src/main/java/org/example/oms/service/OrderSpecifications.java"
  - resource: "repo:oms-core/src/test/java/org/example/oms/integration/OrderSpecificationsIntegrationTest.java"
---
# Query API

Defined in `oms-query-api.yml` as `/search`; implemented by `QueryController` (generated
`SearchApi`) under `/api/query`. Filters are translated into JPA Specifications by
`OrderSpecifications` (equality, `like`, ranges); invalid numeric filter values are ignored rather
than failing the query. Results are paginated.

Each `OrderDto` carries `eventVersion`: the order's latest event-log version, the same number its
newest `oms_orders` message carries as `eventId` (absent when the order has no events). The orders
and their versions are read in one REPEATABLE_READ transaction, so the version always belongs to the
state on the page. The trade blotter uses it to drop live events the snapshot already contains.

## Order event log

`GET /api/query/orders/{orderId}/events` (`getOrderEvents`, generated `OrdersApi`, implemented by
`OrderEventController`, SPEC-0035) returns every entry of one order's event log, oldest first. Each
`OrderEventDto` carries `orderId`, `version`, `event` (`OrderEventType`: `NEW_ORDER`, `ACK`,
`PARTIAL_FILL`, `FILL`, `CXL`, `REJ`, `CXL_REQUEST`, `CXL_REJ`), `commandId`, `resultingState`,
`timeStamp`, `transaction` (the causing command as JSON, with its `type`) and `orderSnapshot` (the
order after the change, as an `OrderDto`). The database id is not exposed. An order id without
events gives `200 []`; whether the order exists is answered by `/search`. It replaces the former hidden,
uncontracted event-log endpoint outside `/api/query`, which no longer exists. The developer cockpit's
API Explorer follow-up reads it.

## Fills with their order

`GET /api/query/executions` (`getExecutions`, generated `ExecutionsApi`, implemented by
`ExecutionViewController`, SPEC-0020) returns fills from the `order_execution_view`
[projection](../oms-concepts/projections.md): each `ExecutionViewDto` has the fill (`execId`,
`lastQty`, `lastPx`, `execType`, `lastCapacity`, `lastMkt`, `transactTime`), the order as of that
fill (identity, account, side, instrument, price, quantities, state), `orderVersion` and
`tradeDate`. Filters `orderId`, `rootOrderId` (an order without a root is its own root), `account`,
`transactTimeFrom` (inclusive) and `transactTimeTo` (exclusive) combine with AND; results are
oldest first, at most `limit` (default 1000, max 5000). No match gives `200 []`. The hidden
`/api/executions` (bare execution rows, used by oms-ui) is unchanged.

Used by the trade blotter's initial snapshot ([Real-time Streaming](../capabilities/real-time-streaming.md)),
the admin UI and the MCP server's `searchOrders` tool. Capability: [Order Query](../capabilities/order-query.md).
