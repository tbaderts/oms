---
type: Requirement
title: "Record every order change as a versioned event"
description: "Every state change of an order appends exactly one event with the next contiguous per-order version, in the same transaction."
tags: [functional, event-sourcing-and-replay]
status: draft
id: "FR-020"
priority: "must"
implementation: "implemented"
capability: "/capabilities/event-sourcing-and-replay.md"
generated: { by: claude-code/claude-opus-5-5, at: "2026-10-27T17:30:00Z" }
sources:
  - resource: "repo:oms-core/src/main/java/org/example/oms/service/OrderEventAppender.java"
  - resource: "repo:oms-core/src/main/java/org/example/oms/model/OrderEvent.java"
  - resource: "repo:oms-core/src/test/java/org/example/oms/integration/EventSourcingIntegrationTest.java"
---
# Record every order change as a versioned event

Versions start at 1 and have no gaps; `(order_id, version)` is unique. Covers create, accept, fills, cancel, reject, cancel request and cancel reject.

Capability: [event-sourcing-and-replay](../capabilities/event-sourcing-and-replay.md).
