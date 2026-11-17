---
aliases: [architecture/streaming-service]
type: Component
title: "Streaming Service"
description: "Spring Boot service that streams orders and executions to the UI over RSocket."
tags: [component, rsocket, streaming]
status: draft
updated: "2026-11-17T08:00:00Z"
component: "streaming-service"
generated: { by: claude-code/claude-opus-5-5, at: "2026-10-27T17:30:00Z" }
sources:
  - resource: "repo:oms-streaming-service/src/main/java/org/example/streaming/StreamingServiceApplication.java"
  - resource: "repo:oms-streaming-service/src/main/resources/application.yml"
  - resource: "repo:oms-streaming-service/src/main/java/org/example/streaming/service/KafkaEventStreamProvider.java"
  - resource: "repo:oms-streaming-service/src/main/java/org/example/streaming/client/OmsQueryClient.java"
---
# Streaming Service

Consumes `oms_orders` and `oms_order_executions` (Reactor Kafka), takes its initial snapshot from the oms-core Query
API, and serves RSocket routes over WebSocket (port 7000). Capability:
[Real-time Streaming](../../capabilities/real-time-streaming.md).

## Snapshots

- **Orders:** each subscription with a snapshot reads the newest matching orders from
  `GET /api/query/search`, then follows Kafka.
- **Executions:** served from an in-memory cache (`streaming.buffer.max-size`, default 10,000).
  - Live fills from `oms_order_executions` are added as they arrive.
  - At startup the service also loads the newest stored fills, each with its order, from
    [`GET /api/query/executions?order=newest`](../../domain/interfaces/query-api.md#fills-with-their-order)
    (`streaming.executions.warm-up-size`, default 5,000, the API's per-request maximum; 0 turns it
    off). Before SPEC-0067 the Kafka consumer resumed from its committed offset after a restart,
    so the executions snapshot started empty.
  - If OMS Core is not reachable, the service starts anyway, streams live fills, and retries the
    load with backoff (2 s, doubling to 1 min) until it succeeds.
  - A stored fill that Kafka delivers again is not emitted twice: the same `orderId`, `execId` and
    `orderVersion` count as a redelivery.
  - Execution filters apply to execution fields (`orderId`, `execType`, `lastMkt`, …), the same for
    stored and live fills.

Context: [System Context](system-context.md).
