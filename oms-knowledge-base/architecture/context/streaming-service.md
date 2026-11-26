---
aliases: [architecture/streaming-service]
type: Component
title: "Streaming Service"
description: "Spring Boot service that streams orders and executions to the UI over RSocket."
tags: [component, rsocket, streaming]
status: draft
updated: "2026-11-25T20:00:00Z"
component: "streaming-service"
generated: { by: claude-code/claude-opus-5-5, at: "2026-10-27T17:30:00Z" }
sources:
  - resource: "repo:oms-streaming-service/src/main/java/org/example/streaming/StreamingServiceApplication.java"
  - resource: "repo:oms-streaming-service/src/main/resources/application.yml"
  - resource: "repo:oms-streaming-service/src/main/java/org/example/streaming/service/KafkaEventStreamProvider.java"
  - resource: "repo:oms-streaming-service/src/main/java/org/example/streaming/client/OmsQueryClient.java"
  - resource: "repo:oms-streaming-service/src/main/java/org/example/streaming/config/KafkaConfig.java"
  - resource: "repo:oms-streaming-service/src/main/java/org/example/streaming/kafka/errors/RecordErrorPolicy.java"
---
# Streaming Service

Consumes `oms_orders` and `oms_executions` (Reactor Kafka), takes each subscription's initial
snapshot from the oms-core Query API, and serves the RSocket routes `orders.stream`,
`executions.stream` and `health` over WebSocket (port 7000). Capability:
[Real-time Streaming](../../capabilities/real-time-streaming.md).

**It holds no orders or executions (SPEC-0071).** Every snapshot is read from the database, through
the query API, when a subscription asks for it, so what the blotter shows matches what the OMS
stores: a fill deleted from `executions` is not shown again. The former in-memory caches, their
startup load from the order-execution projection (SPEC-0067) and the routes that served them
(`blotter.stream`, `orders.snapshot`, `executions.snapshot`) were removed in SPEC-0071.

## Snapshots

- **Orders:** the newest matching orders from `GET /api/query/search`, then live order messages
  from `oms_orders`.
- **Executions:** the newest matching stored fills from the
  [execution search](../../domain/interfaces/query-api.md#execution-search)
  (`GET /api/query/executions/search`, newest stored first), then live fills from `oms_executions`:
  the `Execution` record, the fill as the venue reported it with its instrument (SPEC-0069),
  without its order's fields.
- **Both:** at most the client's snapshot limit, then `SNAPSHOT_END` with the matching count (the
  search's `totalElements`). Live events at or below the version the snapshot showed for that
  order or fill are dropped for that subscription. A Kafka redelivery between snapshots is not
  filtered on the server; oms-ui upserts the row by key and does not count it as new.
- **oms-core unreachable:** a subscription that asks for a snapshot ends with an error (the blotter
  shows it and reconnects); a live-only subscription is unaffected. There is no cached fallback.
- **Kafka:** one consumer group; the executions receiver starts at `latest` when the group has no
  offset on `oms_executions`, since history comes from the snapshot.
- **Kafka failures (SPEC-0077).** The receivers read values as bytes; each record is decoded and
  handled through `RecordErrorPolicy`, one at a time, following the
  [Kafka error policy](../patterns/kafka-messaging.md#error-policy-every-consumer-and-producer).
  - A retryable failure is retried for `kafka.error-policy.retry-for` (`KAFKA_RETRY_FOR`, PT2M).
  - After that, or at once for a record that cannot be decoded or a failure that cannot succeed,
    the record goes to `oms_orders.oms-streaming-service.DLT` or
    `oms_executions.oms-streaming-service.DLT`, created at startup.
  - The stream carries on with the next record. Before SPEC-0077 a record that could not be
    deserialized failed inside the Kafka client, where no error handling could reach it.
  - An offset is acknowledged only once its record was emitted or dead-lettered.
- Execution filters apply to execution fields (`orderId`, `symbol`, `execType`, `lastMkt`, …), the
  same for snapshot and live fills; the snapshot passes them to the search as its filters. A live
  fill's `status` follows its FIX ExecType (H busted, G corrected, otherwise applied), as the
  search reports it for stored fills.

Context: [System Context](system-context.md).
