---
type: Requirement
title: "Refuse commands sent against a stale version"
description: "A command that carries the order version its sender acted on is refused, not applied, when the order has moved on."
tags: [functional]
status: draft
updated: "2026-11-14T12:00:00Z"
id: "FR-050"
priority: "should"
implementation: "implemented"
capability: "/capabilities/order-capture.md"
generated: { by: claude-code/claude-opus-5-5, at: "2026-11-14T12:00:00Z" }
sources:
  - resource: "repo:oms-core/src/main/java/org/example/oms/service/command/tasks/CheckExpectedVersionTask.java"
  - resource: "repo:oms-core/src/test/java/org/example/oms/integration/ExpectedVersionIntegrationTest.java"
---
# FR-050 Refuse commands sent against a stale version

A command that carries the order version its sender acted on is refused, not applied, when the order has moved on.

A command whose `CommandHeader.expectedVersion` differs from the current version of the order is refused and acknowledged, not retried (SPEC-0050). Without `expectedVersion` there is no check. Clients read the version as `eventVersion` from the Query API ([Command API](../../domain/interfaces/command-api.md)).

Capability: [order-capture](../order-capture.md).
