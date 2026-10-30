---
type: Requirement
title: "No silently dropped commands"
description: "A command from Kafka that keeps failing is retried and then parked on a dead-letter topic, never dropped."
tags: [non-functional, reliability]
status: draft
id: "NFR-005"
priority: "must"
implementation: "partial"
capability: "/capabilities/order-capture.md"
category: "reliability"
metric: "Commands lost without trace"
target: "0"
generated: { by: claude-code/claude-opus-5-5, at: "2026-10-27T17:30:00Z" }
sources:
  - resource: "repo:oms-core/src/main/java/org/example/oms/config/KafkaConsumerConfig.java"
  - resource: "repo:oms-core/src/main/java/org/example/oms/config/CommandListener.java"
  - resource: "repo:oms-core/src/test/java/org/example/oms/config/CommandListenerTest.java"
---
# No silently dropped commands

| Category | Metric | Target |
|---|---|---|
| reliability | Commands lost without trace | 0 |

Exponential back-off, then `<topic>.DLT` via `DeadLetterPublishingRecoverer`. Unsupported command
types also reach the DLT. A lifecycle command refused by its business rules is acknowledged, not
retried.

**Partial**: built, but only the listener side is tested (`CommandListenerTest` shows an unsupported
command is thrown rather than swallowed and a refused lifecycle command is acknowledged). The
back-off and the routing to `.DLT` in `KafkaConsumerConfig` have no automated test.

Capability: [order-capture](../capabilities/order-capture.md).
