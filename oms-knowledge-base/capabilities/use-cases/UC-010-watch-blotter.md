---
type: Use Case
title: "Watch orders live on the blotter"
description: "A trader sees orders and fills update live, filtered to what they care about."
tags: [use-case]
status: draft
updated: "2026-11-14T12:00:00Z"
id: "UC-010"
actors: [/capabilities/actors/trader.md]
capability: "/capabilities/real-time-streaming.md"
---
# UC-010 Watch orders live on the blotter

A trader sees orders and fills update live, filtered to what they care about.

Capability: [real-time-streaming](../real-time-streaming.md). Actors: [Trader](../actors/trader.md).

## Preconditions

- The streaming service is connected to Kafka and to the query API.

## Main Flow

1. The blotter subscribes over RSocket with a filter.
2. The streaming service sends a snapshot from the query API, then live changes from Kafka.
3. Each record is mapped to a blotter row and filtered.

## Alternative Flows

- The connection drops: the blotter reconnects and reloads the snapshot.

## Postconditions

- The blotter shows current orders and fills.

## Requirements

- [FR-025](../functional-requirements/FR-025-filter-streams.md)
- [FR-026](../functional-requirements/FR-026-map-blotter-records.md)
