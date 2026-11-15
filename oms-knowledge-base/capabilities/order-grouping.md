---
type: Capability
title: "Order Grouping"
description: "Combining many small client orders into one market order and allocating the fills back."
tags: [order-grouping, execution-desk, allocation]
status: draft
updated: "2026-11-14T12:00:00Z"
maturity: "planned"
commands: []
generated: { by: claude-code/claude-opus-5-5, at: "2026-10-27T17:30:00Z" }
sources:
  - resource: "/domain/concepts/order-grouping.md"
---
# Order Grouping

## Summary

Rebalances generate many small orders for the same security; grouping lets the desk work them as one.

## Behaviour

As specified; requires parent/child order trees and `placeQty`/`allocQty`, which the OMS does not maintain yet.

## Use cases

- [UC-019 Group client orders into a market order (planned)](use-cases/UC-019-group-orders.md)

## Requirements

- [FR-039 Group client orders for the market](functional-requirements/FR-039-group-client-orders.md)
- [FR-040 Allocate grouped fills back to client orders](functional-requirements/FR-040-allocate-group-fills.md)

## Detailed specifications

- [Order Grouping](../domain/concepts/order-grouping.md)
- [Order Quantity Calculations](../domain/concepts/order-quantity-calculations.md)

## Known gaps

None known.
