---
type: Requirement
title: "Serve fills with the order as of each fill"
description: "Clients can list fills, each with the order as it was after that fill, filtered and paged, from the order-execution projection."
tags: [functional]
status: draft
updated: "2026-11-14T12:00:00Z"
id: "FR-054"
priority: "should"
implementation: "implemented"
capability: "/capabilities/order-query.md"
generated: { by: claude-code/claude-opus-5-5, at: "2026-11-14T12:00:00Z" }
sources:
  - resource: "repo:oms-core/src/main/java/org/example/oms/api/ExecutionViewController.java"
  - resource: "repo:oms-core/src/test/java/org/example/oms/integration/ExecutionViewQueryIntegrationTest.java"
---
# FR-054 Serve fills with the order as of each fill

Clients can list fills, each with the order as it was after that fill, filtered and paged, from the order-execution projection.

`GET /api/query/executions` reads `order_execution_projection` ([Order-Execution Projection](../../domain/model/order-execution-projection.md), SPEC-0020, SPEC-0045).

Capability: [order-query](../order-query.md).
