---
type: Requirement
title: "Retry failed publication"
description: "A message that fails to publish stays in the outbox with its attempt count; the batch stops at the first failure; after max attempts it is no longer retried."
tags: [functional, event-publication]
status: draft
id: "FR-024"
priority: "must"
implementation: "implemented"
capability: "/capabilities/event-publication.md"
generated: { by: claude-code/claude-opus-5-5, at: "2026-10-27T17:30:00Z" }
sources:
  - resource: "repo:oms-core/src/main/java/org/example/oms/service/OutboxRelay.java"
  - resource: "repo:oms-core/src/test/java/org/example/oms/service/OutboxRelayTest.java"
  - resource: "repo:oms-core/src/test/java/org/example/oms/integration/EventSourcingIntegrationTest.java"
---
# Retry failed publication

`kafka.outbox.max-attempts` defaults to 10. Stuck messages stay in the table and are counted by the `oms.outbox.stuck` gauge.

Capability: [event-publication](../capabilities/event-publication.md).
