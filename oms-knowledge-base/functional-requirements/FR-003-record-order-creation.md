---
type: Requirement
title: "Record order creation as an event"
description: "Creating an order appends a NEW_ORDER event (version 1) and stages the order for publication in the same transaction."
tags: [functional, order-capture]
status: draft
id: "FR-003"
priority: "must"
implementation: "implemented"
capability: "/capabilities/order-capture.md"
generated: { by: claude-code/claude-opus-5-5, at: "2026-10-27T17:30:00Z" }
sources:
  - resource: "repo:oms-core/src/main/java/org/example/oms/service/command/tasks/PublishOrderEventTask.java"
  - resource: "repo:oms-core/src/main/java/org/example/oms/service/OrderEventAppender.java"
  - resource: "repo:oms-core/src/test/java/org/example/oms/service/command/tasks/PublishOrderEventTaskTest.java"
---
# Record order creation as an event

The last task of the creation pipeline records `NEW_ORDER` through `OrderEventAppender`, which
writes the event and an outbox message in the creating transaction; if that fails, the whole
creation rolls back.

Capability: [order-capture](../capabilities/order-capture.md).
