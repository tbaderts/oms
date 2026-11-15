---
type: Use Case
title: "Submit a new order"
description: "A trader or client system hands a new order to the OMS, which validates it, gives it an id and sends it towards the market."
tags: [use-case]
status: draft
updated: "2026-11-14T12:00:00Z"
id: "UC-001"
actors: [/capabilities/actors/trader.md, /capabilities/actors/client-system.md]
capability: "/capabilities/order-capture.md"
---
# UC-001 Submit a new order

A trader or client system hands a new order to the OMS, which validates it, gives it an id and sends it towards the market.

Capability: [order-capture](../order-capture.md). Actors: [Trader](../actors/trader.md), [Client System](../actors/client-system.md).

## Preconditions

- The sender has a session and a client order id unique within it.

## Main Flow

1. The sender posts an `OrderCreateCmd` (REST `/api/command` or the `commands` topic).
2. The OMS validates the order (required fields, positive quantity, price for limits, stop price for stops).
3. The OMS assigns an `orderId`, sets the state to UNACK and records the SLA checkpoints.
4. The order, its first event and the outbox message are stored in one transaction, and the command is logged as applied.
5. The relay publishes the order on `oms_orders` for the venue.

## Alternative Flows

- Validation fails: the command is refused with the reason (400 over REST); no order is stored.
- The client order id is already used in the session: the command is refused as a duplicate.
- The same command is delivered twice: the second is refused by its `commandId`; nothing changes.
- The command carries an `expectedVersion` that does not match: it is refused.
- Processing fails: Kafka retries with back-off, then dead-letters the command; it is logged as failed.

## Postconditions

- The order is UNACK, its event is version 1, and it is on its way to the venue.

## Requirements

- [FR-001](../functional-requirements/FR-001-accept-new-orders.md)
- [FR-002](../functional-requirements/FR-002-validate-new-orders.md)
- [FR-003](../functional-requirements/FR-003-record-order-creation.md)
- [FR-004](../functional-requirements/FR-004-reject-duplicate-client-order-id.md)
- [FR-050](../functional-requirements/FR-050-refuse-stale-version-commands.md)
- [NFR-001](../non-functional-requirements/NFR-001-idempotent-command-handling.md)
- [NFR-005](../non-functional-requirements/NFR-005-dead-letter-failed-commands.md)
