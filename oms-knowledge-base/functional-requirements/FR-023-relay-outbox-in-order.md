---
type: Requirement
title: "Publish staged messages in commit order"
description: "The outbox relay publishes each aggregate's staged messages to Kafka in primary-key order, one after another, and removes each one once acknowledged."
tags: [functional, event-publication]
status: draft
id: "FR-023"
priority: "must"
implementation: "implemented"
capability: "/capabilities/event-publication.md"
generated: { by: claude-code/claude-opus-5-5, at: "2026-10-27T17:30:00Z" }
sources:
  - resource: "repo:oms-core/src/main/java/org/example/oms/service/OutboxRelay.java"
  - resource: "repo:oms-core/src/main/java/org/example/oms/repository/OutboxRepository.java"
  - resource: "repo:oms-core/src/test/java/org/example/oms/service/OutboxRelayTest.java"
  - resource: "repo:oms-core/src/test/java/org/example/oms/integration/EventSourcingIntegrationTest.java"
---
# Publish staged messages in commit order

The relay polls every `kafka.outbox.poll-interval-ms` (default 200 ms) and works in batches.

- **Within an aggregate** (one topic and key, so one partition), messages are sent in id order.
  Each is sent only after the broker acknowledged the previous one, which preserves the order of
  each order's transitions on its partition.
- **Different aggregates** are in flight together, with no order between them (SPEC-0026).

Capability: [event-publication](../capabilities/event-publication.md).
