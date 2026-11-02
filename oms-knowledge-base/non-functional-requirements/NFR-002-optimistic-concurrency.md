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

The order's `txNr` is the version of its latest event, and each command appends the next one in the same transaction (SPEC-0027). The event log's unique `(order_id, version)` lets only one of two concurrent commands commit; the appender turns the loser's violation into an optimistic-lock failure. A lock failure or deadlock between two commands (for example a fill and a cancel holding the order's row lock) is the other way to lose. The command processors rethrow both, any Spring `ConcurrencyFailureException`, from their pipelines. The command is retried over Kafka and answered 409 (`concurrent-modification`, retryable) over REST, never acknowledged as a refusal.

Capability: [order-cancellation](../capabilities/order-cancellation.md).
