---
type: Use Case
title: "Allocate a block execution to accounts (planned)"
description: "A block order for an institutional client is executed and allocated to its accounts at an average price. Not built."
tags: [use-case, planned]
status: draft
updated: "2026-11-14T12:00:00Z"
id: "UC-020"
actors: [/capabilities/actors/operations-user.md]
capability: "/capabilities/block-allocation.md"
---
# UC-020 Allocate a block execution to accounts (planned)

A block order for an institutional client is executed and allocated to its accounts at an average price. Not built.

Capability: [block-allocation](../block-allocation.md). Actors: [Operations User](../actors/operations-user.md).

## Preconditions

- A block order is filled.

## Main Flow

1. The operations user allocates the fills to the accounts.
2. Each account gets the average price.

## Alternative Flows

- An allocation is wrong: it is reversed and redone.

## Postconditions

- The block is fully allocated.

## Requirements

- [FR-041](../functional-requirements/FR-041-allocate-block-executions.md)
- [FR-042](../functional-requirements/FR-042-average-price.md)
