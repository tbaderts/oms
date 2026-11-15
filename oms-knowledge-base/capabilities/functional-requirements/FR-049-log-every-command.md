---
type: Requirement
title: "Log every command and its outcome"
description: "Every command received over REST, Kafka or from the scheduler is recorded with its source and whether it was applied, refused or failed, and the log of one order can be read back."
tags: [functional]
status: draft
updated: "2026-11-14T12:00:00Z"
id: "FR-049"
priority: "must"
implementation: "implemented"
capability: "/capabilities/event-sourcing-and-replay.md"
generated: { by: claude-code/claude-opus-5-5, at: "2026-11-14T12:00:00Z" }
sources:
  - resource: "repo:oms-core/src/main/java/org/example/oms/service/commandlog/CommandLogWriter.java"
  - resource: "repo:oms-core/src/main/java/org/example/oms/service/command/CommandDispatcher.java"
  - resource: "repo:oms-core/src/test/java/org/example/oms/integration/CommandLogIntegrationTest.java"
  - resource: "repo:oms-core/src/test/java/org/example/oms/integration/OrderCommandQueryIntegrationTest.java"
---
# FR-049 Log every command and its outcome

Every command received over REST, Kafka or from the scheduler is recorded with its source and whether it was applied, refused or failed, and the log of one order can be read back.

`CommandDispatcher` writes a `command_log` row for every command: `APPLIED` in the command transaction, `REFUSED` after the change is rolled back, `FAILED` per failed attempt (SPEC-0046). `GET /api/query/orders/{orderId}/commands` returns the log of one order ([Command Log](../../domain/model/command-log.md)).

Capability: [event-sourcing-and-replay](../event-sourcing-and-replay.md).
