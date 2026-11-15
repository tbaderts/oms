---
type: Use Case
title: "Cancel a working order"
description: "The client asks to cancel a working order; the venue confirms or refuses, and the OMS records each step."
tags: [use-case]
status: draft
updated: "2026-11-14T12:00:00Z"
id: "UC-003"
actors: [/capabilities/actors/trader.md, /capabilities/actors/client-system.md, /capabilities/actors/venue.md]
capability: "/capabilities/order-cancellation.md"
---
# UC-003 Cancel a working order

The client asks to cancel a working order; the venue confirms or refuses, and the OMS records each step.

Capability: [order-cancellation](../order-cancellation.md). Actors: [Trader](../actors/trader.md), [Client System](../actors/client-system.md), [Venue](../actors/venue.md).

## Preconditions

- The order is LIVE with open quantity and no cancel pending.

## Main Flow

1. The client sends `OrderCancelRequestCmd`; the OMS sets the cancel state to pending (PCXL).
2. The venue confirms with `OrderCancelCmd`; the OMS moves the order to CXL and closes the open quantity.
3. Each change is appended and published.

## Alternative Flows

- The venue refuses with `OrderCancelRejectCmd`: the cancel state becomes REJ and the order keeps working.
- A cancel is already pending or the order is not LIVE: the request is refused.
- Two commands race on the order: one wins, the other is retried (Kafka) or answered 409 (REST).

## Postconditions

- The order is CXL with no open quantity, or still LIVE with the cancel rejected.

## Requirements

- [FR-007](../functional-requirements/FR-007-request-cancel.md)
- [FR-008](../functional-requirements/FR-008-confirm-cancel.md)
- [FR-009](../functional-requirements/FR-009-reject-cancel-request.md)
- [FR-010](../functional-requirements/FR-010-deduplicate-lifecycle-commands.md)
- [NFR-002](../non-functional-requirements/NFR-002-optimistic-concurrency.md)
