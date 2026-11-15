---
type: Use Case
title: "Reject an order at the venue"
description: "The venue refuses an order; the OMS records the refusal and why, so the trader can see it."
tags: [use-case]
status: draft
updated: "2026-11-14T12:00:00Z"
id: "UC-004"
actors: [/capabilities/actors/venue.md, /capabilities/actors/trader.md]
capability: "/capabilities/order-rejection.md"
---
# UC-004 Reject an order at the venue

The venue refuses an order; the OMS records the refusal and why, so the trader can see it.

Capability: [order-rejection](../order-rejection.md). Actors: [Venue](../actors/venue.md), [Trader](../actors/trader.md).

## Preconditions

- The order is UNACK or LIVE.

## Main Flow

1. The venue sends `OrderRejectCmd` with a reason.
2. The OMS moves the order to REJ, closes its open quantity and stores the reason.
3. The trader sees the rejected order and its reason in the blotter and the query API.

## Alternative Flows

- The order is already final: the command is refused.

## Postconditions

- The order is REJ with its reason recorded.

## Requirements

- [FR-011](../functional-requirements/FR-011-reject-orders.md)
- [FR-012](../functional-requirements/FR-012-expose-reject-reason.md)
