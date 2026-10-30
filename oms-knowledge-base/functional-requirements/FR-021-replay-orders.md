---
type: Requirement
title: "Reconstruct orders from their events"
description: "Replaying an order's events reproduces the order at any version and matches the live row."
tags: [functional, event-sourcing-and-replay]
status: draft
id: "FR-021"
priority: "must"
implementation: "implemented"
capability: "/capabilities/event-sourcing-and-replay.md"
generated: { by: claude-code/claude-opus-5-5, at: "2026-10-27T17:30:00Z" }
sources:
  - resource: "repo:oms-core/src/main/java/org/example/oms/service/OrderReplayService.java"
  - resource: "repo:oms-core/src/test/java/org/example/oms/integration/EventSourcingIntegrationTest.java"
  - resource: "repo:oms-core/src/test/java/org/example/oms/integration/ExchangeWorkflowIntegrationTest.java"
---
# Reconstruct orders from their events

Each event stores a snapshot, so `replayAt(orderId, version)` is one lookup; the integration tests compare replay with the `orders` row after each workflow.

Capability: [event-sourcing-and-replay](../capabilities/event-sourcing-and-replay.md).
