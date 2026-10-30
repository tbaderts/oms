---
type: Decision
title: "Decision: Transactional Outbox"
description: "Kafka messages are staged in the database with the change and published by a relay."
tags: [decision, outbox, kafka]
status: draft
generated: { by: claude-code/claude-opus-5-5, at: "2026-10-27T17:30:00Z" }
sources:
  - resource: "repo:oms-core/src/main/java/org/example/oms/service/OutboxRelay.java"
  - resource: "repo:specs/policies/architecture-policies.md"
---
# Decision: Transactional Outbox

## Context
Publishing to Kafka from the command path lets the database and Kafka disagree after a failure.

## Decision
Stage messages in `outbox` in the command's transaction; only `OutboxRelay` publishes (policy P-06).

## Consequences
- At-least-once delivery, ordered per order; consumers must be idempotent.
- Kafka outages delay publication but do not fail commands.

Capability: [Event Publication](../capabilities/event-publication.md).

Context: [System Context](system-context.md).
