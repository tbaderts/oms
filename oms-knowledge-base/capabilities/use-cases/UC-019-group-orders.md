---
type: Use Case
title: "Group client orders into a market order (planned)"
description: "Many small client orders are combined into one market order and its fills are allocated back. Not built; needs order trees."
tags: [use-case, planned]
status: draft
updated: "2026-11-14T12:00:00Z"
id: "UC-019"
actors: [/capabilities/actors/trader.md]
capability: "/capabilities/order-grouping.md"
---
# UC-019 Group client orders into a market order (planned)

Many small client orders are combined into one market order and its fills are allocated back. Not built; needs order trees.

Capability: [order-grouping](../order-grouping.md). Actors: [Trader](../actors/trader.md).

## Preconditions

- Client orders for the same instrument and side are working.

## Main Flow

1. The trader groups the client orders under one market order.
2. The market order is sent to the venue.
3. Each fill is allocated back to the client orders.

## Alternative Flows

- A client order is cancelled while grouped: the group is adjusted.

## Postconditions

- Each client order shows its share of the fills.

## Requirements

- [FR-039](../functional-requirements/FR-039-group-client-orders.md)
- [FR-040](../functional-requirements/FR-040-allocate-group-fills.md)
