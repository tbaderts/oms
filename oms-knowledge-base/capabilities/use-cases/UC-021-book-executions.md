---
type: Use Case
title: "Book executions downstream (planned)"
description: "Fills are booked in the downstream booking system from the OMS events. Not built."
tags: [use-case, planned]
status: draft
updated: "2026-11-14T12:00:00Z"
id: "UC-021"
actors: [/capabilities/actors/downstream-system.md]
capability: "/capabilities/booking-integration.md"
---
# UC-021 Book executions downstream (planned)

Fills are booked in the downstream booking system from the OMS events. Not built.

Capability: [booking-integration](../booking-integration.md). Actors: [Downstream System](../actors/downstream-system.md).

## Preconditions

- The booking adapter consumes `oms_order_executions`.

## Main Flow

1. The adapter reads each fill with the order as of the fill.
2. It books it and records the booking reference.

## Alternative Flows

- A fill is busted: the booking is reversed.

## Postconditions

- Every fill is booked once.

## Requirements

- [FR-043](../functional-requirements/FR-043-book-executions.md)
