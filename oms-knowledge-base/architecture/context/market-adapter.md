---
type: Concept Paper
title: "Market Adapter (planned)"
description: "The planned venue adapter that will connect the OMS to real markets over FIX, taking the exchange simulator's place behind the same Kafka contract: consume oms_orders, answer with commands."
tags: [market-adapter, venue, fix, connectivity, planned]
status: draft
updated: "2026-11-14T12:00:00Z"
sources:
  - resource: "repo:oms-exchange-simulator/src/main/java/org/example/simulator/kafka/CommandGateway.java"
---
# Market Adapter (planned)

> **Status: planned, nothing built.** The OMS has no market connectivity. The
> [exchange simulator](exchange-simulator.md) plays the venue so the whole lifecycle can run.

## Role

The market adapter is a separate service between the OMS and real venues. The
[target architecture](../concepts/target-architecture.md) calls it the *venue adapter*:

- **In:** it consumes `oms_orders` and acts on market orders (new order, cancel, later replace),
  translating them to FIX (`NewOrderSingle`, `OrderCancelRequest`, …) for the venue.
- **Out:** it turns the venue's execution reports into OMS commands on the `commands` topic
  (`OrderAcceptCmd`, `OrderRejectCmd`, `ExecutionCreateCmd`, `OrderCancelCmd`,
  `OrderCancelRejectCmd`, …), each with a `CommandHeader`, exactly as the simulator does today
  ([Message API](../../domain/interfaces/message-api.md)).
- It owns the FIX sessions (logon, sequence numbers, resend, heartbeats) and nothing about order
  state: the OMS stays the system of record.

Because it uses the same contract as the simulator, switching from simulator to venue is a
deployment choice, not an OMS change.

## Open questions

- FIX engine (QuickFIX/J or a commercial engine) and which venues first.
- How market orders are distinguished from client orders once order trees exist (`leg`, SPEC-0022).
- Venue expiries and session times, which the OMS currently drives itself
  ([Order Expiry and Close](../../capabilities/order-expiry-and-close.md)).
- Replace (`OrderCancelReplaceRequest`) depends on the planned [Order Replace](../../capabilities/order-replace.md).
