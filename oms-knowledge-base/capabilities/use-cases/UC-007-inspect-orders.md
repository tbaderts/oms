---
type: Use Case
title: "Search and inspect orders"
description: "A user finds orders by any field and looks at an order's history and fills."
tags: [use-case]
status: draft
updated: "2026-11-14T12:00:00Z"
id: "UC-007"
actors: [/capabilities/actors/trader.md, /capabilities/actors/operations-user.md]
capability: "/capabilities/order-query.md"
---
# UC-007 Search and inspect orders

A user finds orders by any field and looks at an order's history and fills.

Capability: [order-query](../order-query.md). Actors: [Trader](../actors/trader.md), [Operations User](../actors/operations-user.md).

## Preconditions

- Orders exist.

## Main Flow

1. The user searches with filters, paging and sorting (`/api/query/search`).
2. The user opens one order's event log (`/orders/{orderId}/events`) and its fills with the order as of each fill (`/executions`).
3. The UI builds its columns and filters from the entity metadata.

## Alternative Flows

- An unknown filter field is ignored; an unparseable number is ignored.

## Postconditions

- The user has the order, its history and its fills.

## Requirements

- [FR-018](../functional-requirements/FR-018-search-orders.md)
- [FR-019](../functional-requirements/FR-019-describe-entities.md)
- [FR-053](../functional-requirements/FR-053-read-order-history.md)
- [FR-054](../functional-requirements/FR-054-serve-fills-with-order.md)
