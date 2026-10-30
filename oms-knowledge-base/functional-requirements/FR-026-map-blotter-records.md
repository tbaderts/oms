---
type: Requirement
title: "Map OMS messages to blotter records"
description: "Order messages from oms_orders are mapped to blotter rows with all fields the UI shows."
tags: [functional, real-time-streaming]
status: draft
id: "FR-026"
priority: "must"
implementation: "implemented"
capability: "/capabilities/real-time-streaming.md"
generated: { by: claude-code/claude-opus-5-5, at: "2026-10-27T17:30:00Z" }
sources:
  - resource: "repo:oms-streaming-service/src/main/java/org/example/streaming/mapper/OrderMessageMapper.java"
  - resource: "repo:oms-streaming-service/src/test/java/org/example/streaming/mapper/OrderMessageMapperTest.java"
---
# Map OMS messages to blotter records

Consumed from `oms_orders` and `oms_executions` by `KafkaEventStreamProvider`.

Capability: [real-time-streaming](../capabilities/real-time-streaming.md).
