---
type: Use Case
title: "Expire and close orders at end of day"
description: "At the end of the trading day, orders whose time in force ran out expire and finished orders are closed."
tags: [use-case]
status: draft
updated: "2026-11-14T12:00:00Z"
id: "UC-014"
actors: [/capabilities/actors/scheduler.md, /capabilities/actors/operations-user.md]
capability: "/capabilities/order-expiry-and-close.md"
---
# UC-014 Expire and close orders at end of day

At the end of the trading day, orders whose time in force ran out expire and finished orders are closed.

Capability: [order-expiry-and-close](../order-expiry-and-close.md). Actors: [Scheduler](../actors/scheduler.md), [Operations User](../actors/operations-user.md).

## Preconditions

- The scheduler runs on the leader instance.

## Main Flow

1. GTD orders past their expire time and DAY orders at end of day are sent `OrderExpireCmd`: they become EXP with no open quantity.
2. Every finished order (FILLED, CXL, REJ, EXP) is sent `OrderCloseCmd` and becomes CLOSED.
3. An operations user can expire or close an order by sending the command.

## Alternative Flows

- An order changes between the query and the command: the command is refused and the next run catches it.

## Postconditions

- Only working orders remain open.

## Requirements

- [FR-055](../functional-requirements/FR-055-expire-orders.md)
- [FR-056](../functional-requirements/FR-056-close-finished-orders.md)
