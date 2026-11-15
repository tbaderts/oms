---
type: Use Case
title: "Acknowledge an order at the venue"
description: "The venue confirms it has the order, and the OMS marks it as working."
tags: [use-case]
status: draft
updated: "2026-11-14T12:00:00Z"
id: "UC-002"
actors: [/capabilities/actors/venue.md]
capability: "/capabilities/order-acceptance.md"
---
# UC-002 Acknowledge an order at the venue

The venue confirms it has the order, and the OMS marks it as working.

Capability: [order-acceptance](../order-acceptance.md). Actors: [Venue](../actors/venue.md).

## Preconditions

- The order is UNACK.

## Main Flow

1. The venue sends `OrderAcceptCmd` on the `commands` topic.
2. The OMS checks the transition UNACK → LIVE, records the market acknowledgement time and appends the event.
3. The relay publishes the LIVE order.

## Alternative Flows

- The order is not UNACK (already LIVE, rejected, unknown): the command is refused and acknowledged, not retried.

## Postconditions

- The order is LIVE and can be filled or cancelled.

## Requirements

- [FR-005](../functional-requirements/FR-005-acknowledge-orders.md)
- [FR-006](../functional-requirements/FR-006-refuse-invalid-acceptance.md)
