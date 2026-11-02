---
type: Requirement
title: "Retry failed publication"
description: "A message that fails to publish stays in the outbox with its attempt count and holds back only its own aggregate; after max attempts it is no longer retried and holds its aggregate until an operator acts."
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

A failed message stays in the outbox. Its attempt count goes up and its error is recorded. The later
messages of its aggregate (same topic and key) are not sent in that drain; other aggregates are
published as usual (SPEC-0026).

Only a definitive failure costs an attempt: a problem with the message itself, such as
serialization, size, authorization or a missing payload. A transient failure costs no attempt; it
is recorded as `lastError` and the message is retried later. Transient means a Kafka retriable
error, including a send that waited too long for topic metadata, or an I/O error reaching the
schema registry. A message the drain stopped waiting for is sent again later without costing an
attempt. So a broker or registry outage delays publication without exhausting anything.

`kafka.outbox.max-attempts` defaults to 10. A message that reaches it is no longer retried. It stays
in the table, is counted by the `oms.outbox.stuck` gauge, and holds the later messages of its
aggregate until an operator replays or removes it. `oms.outbox.oldest.age` shows how long the
waiting messages have waited.

Capability: [event-publication](../capabilities/event-publication.md).
