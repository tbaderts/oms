---
type: Capability
title: "Real-time Streaming"
description: "Pushing live orders and executions to the trade blotter over RSocket, after an initial snapshot."
tags: [streaming, rsocket, trade-blotter]
status: draft
maturity: "implemented"
commands: []
generated: { by: claude-code/claude-opus-5-5, at: "2026-10-27T17:30:00Z" }
sources:
  - resource: "repo:oms-streaming-service/src/main/java/org/example/streaming/controller/TradeBlotterController.java"
  - resource: "repo:oms-streaming-service/src/main/java/org/example/streaming/service/KafkaEventStreamProvider.java"
  - resource: "repo:oms-streaming-service/src/main/resources/application.yml"
---
# Real-time Streaming

## Summary

The streaming service gives the UI a snapshot of orders and executions and then every change as it happens.

## Actors

Admin UI / trade blotter users.

## Behaviour

RSocket routes `orders.stream`, `executions.stream`, `blotter.stream`, `orders.snapshot`,
`executions.snapshot` and `health` (`TradeBlotterController`). The snapshot comes from the oms-core
[Query API](../interfaces/query-api.md); live updates from the `oms_orders` and `oms_executions`
topics. Metadata over HTTP under `/trade-blotter`.

After the snapshot, live order events are deduplicated **per order on the event version**: a live
event whose `eventId` is at or below the snapshot's `eventVersion` for the same order is dropped,
because the snapshot already holds that state or a newer one. Newer events, and events for orders
the snapshot does not hold, pass. `eventId` on both sides is the order's event-log version (the
snapshot takes it from the Query API's `OrderDto.eventVersion`, live events from
`OrderMessage.eventId`).

## Requirements

- [FR-025 Filter streamed orders and executions](../functional-requirements/FR-025-filter-streams.md)
- [FR-026 Map OMS messages to blotter records](../functional-requirements/FR-026-map-blotter-records.md)

## Interfaces and domain

[Kafka Topics](../interfaces/kafka-topics.md); component [Streaming Service](../architecture/streaming-service.md).

## Detailed specifications

- [Trade Blotter Backend Component Specification](../oms-concepts/streaming-architecture.md)

## Known gaps

- The RSocket routes have no automated tests. The snapshot-then-stream merge is covered only at unit
  level (`KafkaEventStreamProviderTest`, with mocked Kafka and Query API).
- `/api/test` endpoints (`TestStreamController`) are diagnostics, not a product interface.

## Verification

`FilterServiceTest`, `OrderMessageMapperTest`, `MetadataServiceTest`. Conventions: [Testing Patterns](../oms-framework/testing-patterns.md).
