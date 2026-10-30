---
type: Requirement
title: "Orders can be rebuilt from their events"
description: "Replaying the event log reproduces every order exactly."
tags: [non-functional, auditability]
status: draft
id: "NFR-008"
priority: "must"
implementation: "implemented"
capability: "/capabilities/event-sourcing-and-replay.md"
category: "auditability"
metric: "Orders whose replay differs from the live row"
target: "0"
generated: { by: claude-code/claude-opus-5-5, at: "2026-10-27T17:30:00Z" }
sources:
  - resource: "repo:oms-core/src/main/java/org/example/oms/service/OrderReplayService.java"
  - resource: "repo:oms-core/src/test/java/org/example/oms/integration/EventSourcingIntegrationTest.java"
  - resource: "repo:oms-core/src/test/java/org/example/oms/integration/ExchangeWorkflowIntegrationTest.java"
---
# Orders can be rebuilt from their events

| Category | Metric | Target |
|---|---|---|
| auditability | Orders whose replay differs from the live row | 0 |

See [FR-021](../functional-requirements/FR-021-replay-orders.md).

Capability: [event-sourcing-and-replay](../capabilities/event-sourcing-and-replay.md).
