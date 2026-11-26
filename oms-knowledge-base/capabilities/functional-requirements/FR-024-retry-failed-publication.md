---
aliases: [functional-requirements/FR-024-retry-failed-publication]
type: Requirement
title: "Retry failed publication"
description: "A message that fails to publish stays in the outbox and holds back only its own aggregate; a retryable failure is retried with back-off for a configurable window, then the message is dead-lettered and parked, holding its aggregate until an operator acts."
tags: [functional, event-publication]
status: draft
updated: "2026-11-25T20:00:00Z"
id: "FR-024"
priority: "must"
implementation: "implemented"
capability: "/capabilities/event-publication.md"
generated: { by: claude-code/claude-opus-5-5, at: "2026-10-27T17:30:00Z" }
sources:
  - resource: "repo:oms-core/src/main/java/org/example/oms/service/OutboxRelay.java"
  - resource: "repo:oms-core/src/test/java/org/example/oms/service/OutboxRelayTest.java"
  - resource: "repo:oms-core/src/test/java/org/example/oms/integration/EventSourcingIntegrationTest.java"
  - resource: "repo:oms-core/src/test/java/org/example/oms/integration/OutboxDeadLetterIntegrationTest.java"
---
# Retry failed publication

A failed message stays in the outbox. Its attempt count goes up and its error is recorded. The later
messages of its aggregate (same topic and key) are not sent in that drain; other aggregates are
published as usual (SPEC-0026).

Failures follow the Kafka error policy every client follows (SPEC-0077;
[Kafka Messaging](../../architecture/patterns/kafka-messaging.md#error-policy-every-consumer-and-producer)):
- **A retryable failure** is retried with exponential back-off (`next_attempt_at`) until
  `kafka.error-policy.retry-for` (default 2 minutes) has passed since it first failed.
- **A failure that cannot succeed**, such as serialization or authorization, is not retried. A
  missing payload is an `IllegalStateException`, which is retryable.
- **Either way, at the end** the message is written to `<topic>.oms-core.DLT` and parked.

A transient failure costs no attempt and does not start the window; it
is recorded as `lastError` and the message is retried later. Transient means a Kafka retriable
error, including a send that waited too long for topic metadata, or an I/O error reaching the
schema registry. A message the drain stopped waiting for is sent again later without costing an
attempt. So a broker or registry outage delays publication without dead-lettering anything.

A parked message is no longer retried. It stays in the table, is counted by the
`oms.outbox.stuck` gauge, and holds the later messages of its aggregate until an operator replays
or removes it. `kafka.outbox.max-attempts` (default 50) is a backstop: a message that reaches it
is dead-lettered even inside its window. `oms.outbox.oldest.age` shows how long the
waiting messages have waited.

Operators see which messages are stuck or held, with their attempts and last error, in oms-ui's
Outbox tab (SPEC-0075; [Query API](../../domain/interfaces/query-api.md#operations-outbox-and-dead-letters)).
Replaying or removing one is still a manual step, left to a follow-up ticket.

Capability: [event-publication](../event-publication.md).
