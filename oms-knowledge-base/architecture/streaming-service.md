---
type: Component
title: "Streaming Service"
description: "Spring Boot service that streams orders and executions to the UI over RSocket."
tags: [component, rsocket, streaming]
status: draft
component: "streaming-service"
generated: { by: claude-code/claude-opus-5-5, at: "2026-10-27T17:30:00Z" }
sources:
  - resource: "repo:oms-streaming-service/src/main/java/org/example/streaming/StreamingServiceApplication.java"
  - resource: "repo:oms-streaming-service/src/main/resources/application.yml"
---
# Streaming Service

Consumes `oms_orders` and `oms_executions`, takes its initial snapshot from the oms-core Query
API, and serves RSocket routes over WebSocket (port 7000). Capability:
[Real-time Streaming](../capabilities/real-time-streaming.md).

Context: [System Context](system-context.md).
