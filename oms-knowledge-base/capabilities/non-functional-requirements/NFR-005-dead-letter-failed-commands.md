---
aliases: [non-functional-requirements/NFR-005-dead-letter-failed-commands]
type: Requirement
title: "No silently dropped commands"
description: "A command from Kafka that keeps failing is retried and then parked on a dead-letter topic, never dropped."
tags: [non-functional, reliability]
status: draft
updated: "2026-11-14T12:00:00Z"
id: "NFR-005"
priority: "must"
implementation: "implemented"
capability: "/capabilities/order-capture.md"
category: "reliability"
metric: "Commands lost without trace"
target: "0"
generated: { by: claude-code/claude-opus-5-5, at: "2026-10-27T17:30:00Z" }
sources:
  - resource: "repo:oms-core/src/main/java/org/example/oms/config/KafkaConsumerConfig.java"
  - resource: "repo:oms-core/src/test/java/org/example/oms/integration/CommandRetryBudgetIntegrationTest.java"
  - resource: "repo:oms-core/src/test/java/org/example/oms/integration/CommandDeadLetterIntegrationTest.java"
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

Every command also leaves a row in the command log (`APPLIED`, `REFUSED` or `FAILED`, SPEC-0046), so
nothing is lost without trace. Tested end to end: `CommandRetryBudgetIntegrationTest` (back-off, then
`.DLT`), `CommandDeadLetterIntegrationTest` (undecodable and unhandled records reach `commands.DLT`
with their bytes) and `CommandListenerTest`.

Capability: [order-capture](../order-capture.md).
