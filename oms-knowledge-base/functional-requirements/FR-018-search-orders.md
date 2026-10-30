---
type: Requirement
title: "Search orders with dynamic filters"
description: "The query API returns orders matching field filters (equality, like, ranges) with paging; invalid filter values are ignored rather than failing."
tags: [functional, order-query]
status: draft
id: "FR-018"
priority: "must"
implementation: "partial"
capability: "/capabilities/order-query.md"
generated: { by: claude-code/claude-opus-5-5, at: "2026-10-27T17:30:00Z" }
sources:
  - resource: "repo:oms-core/src/main/java/org/example/oms/api/QueryController.java"
  - resource: "repo:oms-core/src/main/java/org/example/oms/service/OrderQueryService.java"
  - resource: "repo:oms-core/src/main/java/org/example/oms/service/OrderSpecifications.java"
  - resource: "repo:oms-core/src/test/java/org/example/oms/integration/OrderSpecificationsIntegrationTest.java"
---
# Search orders with dynamic filters

Served by `GET /api/query/search` ([Query API](../interfaces/query-api.md)).

**Partial**: built, but the tests cover only the `like` filter and an invalid numeric value;
equality, range filters and paging are untested.

Capability: [order-query](../capabilities/order-query.md).
