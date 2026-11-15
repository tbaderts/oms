---
type: Use Case
title: "Replace a working order (planned)"
description: "The client amends a working order's quantity or price (FIX OrderCancelReplaceRequest). Not built."
tags: [use-case, planned]
status: draft
updated: "2026-11-14T12:00:00Z"
id: "UC-017"
actors: [/capabilities/actors/trader.md, /capabilities/actors/client-system.md, /capabilities/actors/venue.md]
capability: "/capabilities/order-replace.md"
---
# UC-017 Replace a working order (planned)

The client amends a working order's quantity or price (FIX OrderCancelReplaceRequest). Not built.

Capability: [order-replace](../order-replace.md). Actors: [Trader](../actors/trader.md), [Client System](../actors/client-system.md), [Venue](../actors/venue.md).

## Preconditions

- The order is LIVE.

## Main Flow

1. The client sends a replace request.
2. The OMS marks the replace pending and forwards it to the venue.
3. The venue confirms; the OMS applies the new quantity or price and records it.

## Alternative Flows

- The venue refuses: the order keeps its old terms.
- A fill arrives while the replace is pending: quantities are reconciled.

## Postconditions

- The order works with its new terms.

## Requirements

- [FR-036](../functional-requirements/FR-036-replace-orders.md)
