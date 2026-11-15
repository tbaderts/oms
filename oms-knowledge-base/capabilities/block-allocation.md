---
type: Capability
title: "Block Allocation and Average Pricing"
description: "Block orders for multi-account institutional clients, allocation to accounts and average pricing."
tags: [block-orders, allocation, average-pricing]
status: draft
updated: "2026-11-14T12:00:00Z"
maturity: "planned"
commands: []
generated: { by: claude-code/claude-opus-5-5, at: "2026-10-27T17:30:00Z" }
sources:
  - resource: "/domain/concepts/block-order-allocation.md"
---
# Block Allocation and Average Pricing

## Summary

Institutional clients trade one block for many accounts; the OMS will need to allocate and average-price it.

## Behaviour

Open for discussion in the concept papers, including the split between OMS and post-trade.

## Use cases

- [UC-020 Allocate a block execution to accounts (planned)](use-cases/UC-020-allocate-block.md)

## Requirements

- [FR-041 Allocate block executions to accounts](functional-requirements/FR-041-allocate-block-executions.md)
- [FR-042 Average-price allocations](functional-requirements/FR-042-average-price.md)

## Detailed specifications

- [Block Orders, Allocation and Average Pricing](../domain/concepts/block-order-allocation.md)
- [Order Model, Trading Capacity and Booking Legs](../domain/concepts/order-model-trading-capacity.md)

## Known gaps

None known.
