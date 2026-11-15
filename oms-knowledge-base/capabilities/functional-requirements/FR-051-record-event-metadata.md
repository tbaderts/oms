---
type: Requirement
title: "Record who, where and what changed on every event"
description: "Every order event records the correlation and causation ids of the causing command, the principal and source, and a field-by-field diff of the change."
tags: [functional]
status: draft
updated: "2026-11-14T12:00:00Z"
id: "FR-051"
priority: "should"
implementation: "implemented"
capability: "/capabilities/event-sourcing-and-replay.md"
generated: { by: claude-code/claude-opus-5-5, at: "2026-11-14T12:00:00Z" }
sources:
  - resource: "repo:oms-core/src/main/java/org/example/oms/service/OrderChanges.java"
  - resource: "repo:oms-core/src/main/java/org/example/oms/service/OrderEventAppender.java"
  - resource: "repo:oms-core/src/test/java/org/example/oms/integration/EventMetadataIntegrationTest.java"
---
# FR-051 Record who, where and what changed on every event

Every order event records the correlation and causation ids of the causing command, the principal and source, and a field-by-field diff of the change.

Events written since changelog 016 carry `correlation_id`, `causation_id`, `principal`, `source` and `changes` (`{"field": {"from", "to"}}`), see [Order Event](../../domain/model/order-event.md) (SPEC-0049).

Capability: [event-sourcing-and-replay](../event-sourcing-and-replay.md).
