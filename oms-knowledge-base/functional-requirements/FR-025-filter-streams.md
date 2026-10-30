---
type: Requirement
title: "Filter streamed orders and executions"
description: "Streams can be filtered by field conditions (eq, like, gt, gte, lt, lte, between) combined with AND or OR."
tags: [functional, real-time-streaming]
status: draft
id: "FR-025"
priority: "must"
implementation: "implemented"
capability: "/capabilities/real-time-streaming.md"
generated: { by: claude-code/claude-opus-5-5, at: "2026-10-27T17:30:00Z" }
sources:
  - resource: "repo:oms-streaming-service/src/main/java/org/example/streaming/service/FilterService.java"
  - resource: "repo:oms-streaming-service/src/main/java/org/example/streaming/model/StreamFilter.java"
  - resource: "repo:oms-streaming-service/src/test/java/org/example/streaming/service/FilterServiceTest.java"
---
# Filter streamed orders and executions

The same filter model is used for the snapshot query and the live stream.

Capability: [real-time-streaming](../capabilities/real-time-streaming.md).
