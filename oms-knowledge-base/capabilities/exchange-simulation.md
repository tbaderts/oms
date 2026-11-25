---
type: Capability
title: "Exchange Simulation"
description: "A simulated venue that acknowledges, fills, rejects and cancels OMS orders so the lifecycle runs end to end."
tags: [exchange-simulator, testing, kafka]
status: draft
updated: "2026-11-25T12:00:00Z"
maturity: "implemented"
commands: []
generated: { by: claude-code/claude-opus-5-5, at: "2026-10-27T17:30:00Z" }
sources:
  - resource: "repo:oms-exchange-simulator/src/main/java/org/example/simulator/engine/ExchangeEngine.java"
  - resource: "repo:oms-exchange-simulator/src/main/resources/application.yml"
---
# Exchange Simulation

## Summary

The OMS has no real market connectivity; the exchange simulator plays the market.

## Actors

Developers and testers.

## Behaviour

Listens to `oms_orders`, decides per order, and answers with commands on `commands`. See component [Exchange Simulator](../architecture/context/exchange-simulator.md).

Each symbol's reference price comes from Alpha Vantage when `ALPHAVANTAGE_API_KEY` is set, so any
symbol order entry offers can be traded; otherwise, or when the provider cannot answer, it comes
from the static `simulator.reference-prices` (SPEC-0073). Limits are checked as US venues do:
sub-penny prices at or above 1.00 are rejected (Reg NMS Rule 612), and so are limits priced
through the reference by more than the NYSE-style collar (10 % / 5 % / 3 % by price tier).

Each answer is a bare command record, keyed by orderId, under its own Schema Registry subject
(SPEC-0025). Its `CommandHeader` is built from the `OrderMessage` it answers: `correlationId` is the
root order (the order itself when it has no root), `causationId` is `orderId:eventId`, and
`producer` is `oms-exchange-simulator`. Rejects, cancels and cancel rejects keep the deterministic
`commandId` derived from the event they answer, so a replayed event yields a duplicate oms-core
refuses; accepts and fills get a fresh UUID. See [Avro Messages](../domain/interfaces/message-api.md).

An order the OMS publishes in a final state (FILLED, CXL, REJ, EXP, CLOSED) is done: the simulator
stops working it, so no scheduled fill follows an expiry or a close (SPEC-0029). The simulator
never expires orders itself; the OMS does ([Order Expiry and Close](order-expiry-and-close.md)).

## Use cases

- [UC-012 Run the order lifecycle against a simulated venue](use-cases/UC-012-simulate-venue.md)

## Requirements

- [FR-027 Decide the venue outcome of an order](functional-requirements/FR-027-decide-venue-outcome.md)
- [FR-028 Split executions into several fills](functional-requirements/FR-028-slice-fills.md)
- [FR-029 Drive the OMS lifecycle over Kafka](functional-requirements/FR-029-drive-oms-lifecycle.md)

## Interfaces and domain

[Kafka Topics](../domain/interfaces/message-api.md).

## Detailed specifications

- [Exchange Simulator](../architecture/context/exchange-simulator.md)

## Known gaps

None known.

## Verification

`OrderEvaluatorTest`, `LimitPriceRulesTest`, `FillSlicerTest`, `ExchangeEngineTest`, `AlphaVantageQuoteClientTest`, `ReferencePriceServiceTest`, `ExchangeSimulatorKafkaIntegrationTest`, `AlphaVantageKafkaIntegrationTest`, `SimulatorMetricsIntegrationTest`. Conventions: [Testing Patterns](../delivery/testing.md).
