---
type: Requirement
title: "Optimistic concurrency on orders"
description: "Concurrent commands on the same order never overwrite each other; the loser fails with a conflict."
tags: [non-functional, consistency]
status: draft
id: "NFR-002"
priority: "must"
implementation: "implemented"
capability: "/capabilities/order-cancellation.md"
category: "consistency"
metric: "Lost updates under concurrent commands on one order"
target: "0 (conflicting command answered 409)"
generated: { by: claude-code/claude-opus-5-5, at: "2026-10-27T17:30:00Z" }
sources:
  - resource: "repo:oms-core/src/main/java/org/example/common/model/Order.java"
  - resource: "repo:oms-core/src/main/java/org/example/oms/api/GlobalExceptionHandler.java"
  - resource: "repo:oms-core/src/test/java/org/example/oms/api/CommandControllerWebMvcTest.java"
  - resource: "repo:oms-core/src/test/java/org/example/oms/service/lifecycle/OrderLifecycleCommandProcessorTest.java"
  - resource: "repo:oms-core/src/test/java/org/example/oms/integration/EventSourcingIntegrationTest.java"
---
# Optimistic concurrency on orders

| Category | Metric | Target |
|---|---|---|
| consistency | Lost updates under concurrent commands on one order | 0 (conflicting command answered 409) |

The order's `txNr` is the JPA `@Version`; every update increments it. An optimistic-lock failure is re-thrown by the lifecycle processor and mapped to HTTP 409.

Capability: [order-cancellation](../capabilities/order-cancellation.md).
