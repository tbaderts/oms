---
type: Requirement
title: "Run several oms-core instances safely"
description: "oms-core can run as several instances against one database without losing ordering, duplicating scheduled work or applying a command twice."
tags: [non-functional, scalability, reliability]
status: draft
updated: "2026-11-14T12:00:00Z"
id: "NFR-011"
priority: "should"
implementation: "implemented"
capability: "/capabilities/event-publication.md"
category: "scalability"
metric: "Ordering violations, duplicate scheduled runs and double-applied commands with two instances under load"
target: "0"
generated: { by: claude-code/claude-opus-5-5, at: "2026-11-14T12:00:00Z" }
sources:
  - resource: "repo:oms-core/src/main/java/org/example/oms/service/leadership/Leadership.java"
  - resource: "repo:oms-core/src/main/java/org/example/oms/service/OutboxRelay.java"
  - resource: "repo:oms-core/src/test/java/org/example/oms/integration/TwoInstanceIntegrationTest.java"
  - resource: "repo:oms-core/src/test/java/org/example/oms/integration/OrderVersionTwoInstanceIntegrationTest.java"
---
# NFR-011 Run several oms-core instances safely

| Category | Metric | Target |
|---|---|---|
| scalability | Ordering violations, duplicate scheduled runs and double-applied commands with two instances under load | 0 |

The outbox relay and the scheduled jobs run on one leader per database (`Leadership`); commands
lock the order row and append a unique version; ids are drawn in blocks unique across instances
(SPEC-0047, SPEC-0048). `TwoInstanceIntegrationTest` and `OrderVersionTwoInstanceIntegrationTest`
run two instances against one database ([Transaction Handling](../../architecture/patterns/transaction-handling.md)).

Capability: [event-publication](../event-publication.md).
