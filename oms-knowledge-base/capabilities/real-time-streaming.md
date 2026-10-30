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

## Requirements

- [FR-025 Filter streamed orders and executions](../functional-requirements/FR-025-filter-streams.md)
- [FR-026 Map OMS messages to blotter records](../functional-requirements/FR-026-map-blotter-records.md)

## Interfaces and domain

[Kafka Topics](../interfaces/kafka-topics.md); component [Streaming Service](../architecture/streaming-service.md).

## Detailed specifications

- [Trade Blotter Backend Component Specification](../oms-concepts/streaming-architecture.md)

## Known gaps

- The RSocket routes and the snapshot-then-stream sequence have no automated tests.
- `/api/test` endpoints (`TestStreamController`) are diagnostics, not a product interface.

## Verification

`FilterServiceTest`, `OrderMessageMapperTest`, `MetadataServiceTest`. Conventions: [Testing Patterns](../oms-framework/testing-patterns.md).
