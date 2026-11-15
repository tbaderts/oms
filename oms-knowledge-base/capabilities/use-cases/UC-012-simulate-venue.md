---
type: Use Case
title: "Run the order lifecycle against a simulated venue"
description: "A developer runs orders end to end without a real market: the simulator plays the venue."
tags: [use-case]
status: draft
updated: "2026-11-14T12:00:00Z"
id: "UC-012"
actors: [/capabilities/actors/developer.md, /capabilities/actors/venue.md]
capability: "/capabilities/exchange-simulation.md"
---
# UC-012 Run the order lifecycle against a simulated venue

A developer runs orders end to end without a real market: the simulator plays the venue.

Capability: [exchange-simulation](../exchange-simulation.md). Actors: [Developer](../actors/developer.md), [Venue](../actors/venue.md).

## Preconditions

- The stack runs with the exchange simulator.

## Main Flow

1. The simulator reads each new market order from `oms_orders`.
2. It decides the outcome (ack, fill, partial fills, reject, cancel) from the order's triggers.
3. It answers with commands on `commands`, splitting fills where configured.

## Alternative Flows

- The simulator is switched off: orders stay UNACK until another venue answers.

## Postconditions

- The order has gone through its lifecycle.

## Requirements

- [FR-027](../functional-requirements/FR-027-decide-venue-outcome.md)
- [FR-028](../functional-requirements/FR-028-slice-fills.md)
- [FR-029](../functional-requirements/FR-029-drive-oms-lifecycle.md)
