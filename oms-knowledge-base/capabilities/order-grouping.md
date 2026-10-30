---
type: Capability
title: "Order Grouping"
description: "Combining many small client orders into one market order and allocating the fills back."
tags: [order-grouping, execution-desk, allocation]
status: draft
maturity: "planned"
commands: []
generated: { by: claude-code/claude-opus-5-5, at: "2026-10-27T17:30:00Z" }
sources:
  - resource: "/oms-concepts/order-grouping.md"
---
# Order Grouping

## Summary

Rebalances generate many small orders for the same security; grouping lets the desk work them as one.

## Behaviour

As specified; requires parent/child order trees and `placeQty`/`allocQty`, which the OMS does not maintain yet.

## Requirements

- [FR-039 Group client orders for the market](../functional-requirements/FR-039-group-client-orders.md)
- [FR-040 Allocate grouped fills back to client orders](../functional-requirements/FR-040-allocate-group-fills.md)

## Detailed specifications

- [Order Grouping](../oms-concepts/order-grouping.md)
- [Order Quantity Calculations](../oms-concepts/order-quantity-calculations.md)

## Known gaps

None known.
