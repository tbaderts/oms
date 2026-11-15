---
type: Requirement
title: "Read the event log of an order"
description: "Clients can read every event of one order, oldest first, with its version, command, resulting state, metadata and changes, optionally for one execution."
tags: [functional]
status: draft
updated: "2026-11-14T12:00:00Z"
id: "FR-053"
priority: "should"
implementation: "implemented"
capability: "/capabilities/order-query.md"
generated: { by: claude-code/claude-opus-5-5, at: "2026-11-14T12:00:00Z" }
sources:
  - resource: "repo:oms-core/src/main/java/org/example/oms/api/OrderEventController.java"
  - resource: "repo:oms-core/src/test/java/org/example/oms/integration/OrderEventQueryIntegrationTest.java"
---
# FR-053 Read the event log of an order

Clients can read every event of one order, oldest first, with its version, command, resulting state, metadata and changes, optionally for one execution.

`GET /api/query/orders/{orderId}/events` (`getOrderEvents`, SPEC-0035), filterable by `execId` ([Query API](../../domain/interfaces/query-api.md)).

Capability: [order-query](../order-query.md).
