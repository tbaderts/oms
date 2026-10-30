---
type: Requirement
title: "Complete audit trail of order changes"
description: "Every order state change is recorded in the event log in the same transaction as the change."
tags: [non-functional, auditability]
status: draft
id: "NFR-003"
priority: "must"
implementation: "implemented"
capability: "/capabilities/event-sourcing-and-replay.md"
category: "auditability"
metric: "Order state changes without a corresponding event"
target: "0"
generated: { by: claude-code/claude-opus-5-5, at: "2026-10-27T17:30:00Z" }
sources:
  - resource: "repo:oms-core/src/main/java/org/example/oms/service/OrderEventAppender.java"
  - resource: "repo:oms-core/src/test/java/org/example/oms/integration/EventSourcingIntegrationTest.java"
  - resource: "repo:oms-core/src/test/java/org/example/oms/integration/ExchangeWorkflowIntegrationTest.java"
---
# Complete audit trail of order changes

| Category | Metric | Target |
|---|---|---|
| auditability | Order state changes without a corresponding event | 0 |

See [FR-020](../functional-requirements/FR-020-append-event-per-change.md). Verified by comparing each workflow's events with the expected sequence.

Capability: [event-sourcing-and-replay](../capabilities/event-sourcing-and-replay.md).
