---
type: Domain Concept
title: "Order"
description: "The order aggregate: identity, instrument, economics, quantities, state and SLA timestamps, persisted in the orders table."
tags: [order, entity, aggregate]
status: draft
entity: "Order"
generated: { by: claude-code/claude-opus-5-5, at: "2026-10-27T17:30:00Z" }
sources:
  - resource: "repo:oms-core/src/main/java/org/example/common/model/Order.java"
  - resource: "repo:oms-core/src/main/resources/db/changelog/001-initial-schema.yaml"
  - resource: "repo:oms-core/src/main/resources/db/changelog/002-order-idempotency-constraint.yaml"
  - resource: "repo:oms-contracts/src/main/avro/Order.avsc"
  - resource: "repo:oms-core/src/test/java/org/example/oms/model/EntityEqualityTest.java"
---
# Order

An order is an instruction to buy or sell a quantity of an instrument. It is the aggregate root of
the OMS: every command targets one order, and every state change of an order is recorded as an
[order event](order-event.md).

## Persistence

- Table `orders`, JPA entity `org.example.common.model.Order`. The Avro record `Order.avsc`
  (used inside `OrderCreateCmd`) carries only what a client sends: identity, instrument and
  economics. State, cancel state, `txNr`, `leg`, `transactTime`, `cumQty`/`leavesQty`,
  `rejectReason` and the SLA checkpoints are entity-only; the published view is `OrderMessage`.
- **Optimistic locking**: `txNr` is the JPA `@Version`. A concurrent update fails with an
  optimistic-lock exception instead of overwriting (see
  [NFR-002](../non-functional-requirements/NFR-002-optimistic-concurrency.md)).
- **Idempotent creation**: unique constraint `uq_orders_session_cl_ord_id` on
  `(session_id, cl_ord_id)`; a second create with the same client order id in the same session
  is refused (see [FR-004](../functional-requirements/FR-004-reject-duplicate-client-order-id.md)).

## Fields

| Group | Fields |
|---|---|
| Identity | `orderId` (assigned by the OMS), `parentOrderId`, `rootOrderId`, `sessionId`, `clOrdId`, `origClOrdId`, `account`, `leg` (`CLI` / `MKT`, not yet populated) |
| Instrument | `symbol`, `securityId`, `securityIdSource`, `securityExchange`, `securityDesc`, `securityType`, `maturityMonthYear`, `strikePrice`, `putOrCall`, `underlyingSecurityType` |
| Economics | `side`, `ordType`, `price`, `stopPx`, `priceType`, `timeInForce`, `expireTime`, `execInst`, `handlInst`, `positionEffect`, `settlCurrency`, `exDestination` |
| Quantities | `orderQty`, `cashOrderQty`, `cumQty`, `leavesQty`, `placeQty`, `allocQty` — see [Order Quantities](order-quantities.md) |
| State | `state`, `cancelState` — see [Order State](order-state.md) |
| Text | `text` (client free text, never changed by the OMS), `rejectReason` (latest venue refusal) |
| Time | `sendingTime` (FIX 52, counterparty clock), `transactTime` (FIX 60, time of the latest business event), `tifTimestamp`, SLA checkpoints `orderReceivedTime`, `ackTime`, `marketSendTime`, `marketAckTime` (see [Order SLA Monitoring](../capabilities/order-sla-monitoring.md)) |

Field semantics follow FIX 4.4/5.0; the detailed field-by-field specification is in
[Domain Model Organization](../oms-framework/domain-model_spec.md).

## Related

- [Order Capture](../capabilities/order-capture.md), [Order Acceptance](../capabilities/order-acceptance.md),
  [Order Cancellation](../capabilities/order-cancellation.md), [Order Rejection](../capabilities/order-rejection.md)
- [Execution](execution.md), [Order Event](order-event.md), [Glossary](glossary.md)
