---
type: Requirement
title: "Leave no partial writes on failure"
description: "If any step of a command fails, no order, execution, event or outbox row of that command remains."
tags: [functional, event-sourcing-and-replay]
status: draft
id: "FR-022"
priority: "must"
implementation: "implemented"
capability: "/capabilities/event-sourcing-and-replay.md"
generated: { by: claude-code/claude-opus-5-5, at: "2026-10-27T17:30:00Z" }
sources:
  - resource: "repo:oms-core/src/main/java/org/example/oms/service/command/tasks/PublishOrderEventTask.java"
  - resource: "repo:oms-core/src/main/java/org/example/oms/service/execution/ExecutionCommandProcessor.java"
  - resource: "repo:oms-core/src/test/java/org/example/oms/integration/EventSourcingIntegrationTest.java"
  - resource: "repo:oms-core/src/test/java/org/example/oms/service/command/tasks/PublishOrderEventTaskTest.java"
---
# Leave no partial writes on failure

Each command runs in one database transaction; a failing task (including the event append) rolls everything back.

Capability: [event-sourcing-and-replay](../capabilities/event-sourcing-and-replay.md).
