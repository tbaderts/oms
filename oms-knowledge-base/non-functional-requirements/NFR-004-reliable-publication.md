---
type: Requirement
title: "Reliable, ordered event publication"
description: "Every committed order change reaches Kafka at least once and in order per order."
tags: [non-functional, reliability]
status: draft
id: "NFR-004"
priority: "must"
implementation: "implemented"
capability: "/capabilities/event-publication.md"
category: "reliability"
metric: "Committed changes never published, or published out of order for one order"
target: "0; publication delay ≈ poll interval (default 200 ms) when Kafka is up"
generated: { by: claude-code/claude-opus-5-5, at: "2026-10-27T17:30:00Z" }
sources:
  - resource: "repo:oms-core/src/main/java/org/example/oms/service/OutboxRelay.java"
  - resource: "repo:oms-core/src/main/java/org/example/oms/service/MessagePublisher.java"
  - resource: "repo:oms-core/src/test/java/org/example/oms/service/OutboxRelayTest.java"
  - resource: "repo:oms-core/src/test/java/org/example/oms/integration/EventSourcingIntegrationTest.java"
---
# Reliable, ordered event publication

| Category | Metric | Target |
|---|---|---|
| reliability | Committed changes never published, or published out of order for one order | 0; publication delay ≈ poll interval (default 200 ms) when Kafka is up |

Transactional outbox drained in id order; failures are retried up to `kafka.outbox.max-attempts`. Delivery is at-least-once, so consumers must tolerate duplicates.

Capability: [event-publication](../capabilities/event-publication.md).
