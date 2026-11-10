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
[Query API](../interfaces/query-api.md); live updates from the `oms_orders` and
`oms_order_executions` topics. Metadata over HTTP under `/trade-blotter`.

Fills come from `oms_order_executions` (since SPEC-0019; before, `oms_executions`). Each record
carries the order as of that fill, so a fill's blotter event (`EXECUTION_<execType>`) has an
`order` with its symbol, side, account, quantities and state instead of ids only, and stream
filters on order fields apply to fills too. A fill whose `(orderId, execId, orderVersion)` was already
emitted is a redelivery and is dropped; a newer version of the same `execId` passes.

After the snapshot, live order events are deduplicated **per order on the event version**: a live
event whose `eventId` is at or below the snapshot's `eventVersion` for the same order is dropped,
because the snapshot already holds that state or a newer one. Newer events, and events for orders
the snapshot does not hold, pass. `eventId` on both sides is the order's event-log version (the
snapshot takes it from the Query API's `OrderDto.eventVersion`, live events from
`OrderMessage.eventId`). Before SPEC-0057 `OmsQueryClient` did not read `eventVersion`, so this
deduplication never applied to real snapshots.

**Bounded snapshot and its end marker (SPEC-0057).**
- **The client says how many snapshot rows it keeps.** `StreamFilter.snapshotLimit` is optional.
  Without it, the snapshot is unbounded, as before. It is kept within 0 and 100,000.
- **Orders:**
  - `OmsQueryClient.fetchOrderSnapshot` pages the Query API newest first (`sort=id,DESC`) and
    stops at the limit.
  - The first page's `totalElements` is the matching count.
  - If oms-core is down, the newest matching cached orders by `transactTime` are sent instead.
- **Executions:**
  - The snapshot is the matching fills of the in-memory cache, newest by `transactTime`, up to the
    limit.
  - `executions.stream` now honours `includeSnapshot`; without it, only live fills follow.
  - The filter is applied inside the provider, so it never drops the marker.
  - The live sink replays its last events to a new subscriber. A replayed fill the snapshot
    already accounted for, at the same or a lower `orderVersion`, is skipped.
- **The marker.** After the last snapshot row, a `SNAPSHOT_END` event carries `snapshotTotal`:
  how many rows matched, including those beyond the limit. Live events follow it.
  `blotter.stream` filters the marker out and keeps its old shape.

**Back-pressure (SPEC-0057).**
- oms-ui requests events in batches of 256, over RSocket REQUEST_N.
- On the server, the live part of each stream holds at most `streaming.subscriber.max-pending`
  (default 10,000, env `SUBSCRIBER_MAX_PENDING`) unrequested events for one subscriber. Past that,
  its stream ends with an error, which the blotter shows with Retry.
- Each overflow is logged at WARN and counted in `oms_streaming_subscriber_overflow_total{route}`.

## Requirements

- [FR-025 Filter streamed orders and executions](../functional-requirements/FR-025-filter-streams.md)
- [FR-026 Map OMS messages to blotter records](../functional-requirements/FR-026-map-blotter-records.md)

## Interfaces and domain

[Kafka Topics](../interfaces/kafka-topics.md); component [Streaming Service](../architecture/streaming-service.md).

## Detailed specifications

- [Trade Blotter Backend Component Specification](../oms-concepts/streaming-architecture.md)

## Known gaps

- The RSocket routes have no automated tests. The snapshot-then-stream merge, the snapshot limit and
  marker, and the overflow bound are covered at unit level (`KafkaEventStreamProviderTest`,
  `OmsQueryClientTest`, with mocked Kafka and a stubbed Query API).
- `/api/test` endpoints (`TestStreamController`) are diagnostics, not a product interface.

## Verification

`FilterServiceTest`, `OrderMessageMapperTest`, `MetadataServiceTest`, `KafkaEventStreamProviderTest`,
`OmsQueryClientTest`, `StreamFilterTest`. Conventions: [Testing Patterns](../oms-framework/testing-patterns.md).
