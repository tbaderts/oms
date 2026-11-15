---
type: Use Case
title: "Analyse post-trade data (planned)"
description: "An analytics platform outside the OMS is fed with its events for post-trade analysis. Not built."
tags: [use-case, planned]
status: draft
updated: "2026-11-14T12:00:00Z"
id: "UC-022"
actors: [/capabilities/actors/downstream-system.md]
capability: "/capabilities/post-trade-analytics.md"
---
# UC-022 Analyse post-trade data (planned)

An analytics platform outside the OMS is fed with its events for post-trade analysis. Not built.

Capability: [post-trade-analytics](../post-trade-analytics.md). Actors: [Downstream System](../actors/downstream-system.md).

## Preconditions

- The platform consumes the event topics.

## Main Flow

1. The platform stores the events.
2. Analysts query them.

## Alternative Flows

- None.

## Postconditions

- Analysts have the data.

## Requirements

- [FR-044](../functional-requirements/FR-044-post-trade-data-feed.md)
