---
type: Capability
title: "Exchange Simulation"
description: "A simulated venue that acknowledges, fills, rejects and cancels OMS orders so the lifecycle runs end to end."
tags: [exchange-simulator, testing, kafka]
status: draft
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

Listens to `oms_orders`, decides per order, and answers with commands on `commands`. See component [Exchange Simulator](../architecture/exchange-simulator.md).

## Requirements

- [FR-027 Decide the venue outcome of an order](../functional-requirements/FR-027-decide-venue-outcome.md)
- [FR-028 Split executions into several fills](../functional-requirements/FR-028-slice-fills.md)
- [FR-029 Drive the OMS lifecycle over Kafka](../functional-requirements/FR-029-drive-oms-lifecycle.md)

## Interfaces and domain

[Kafka Topics](../interfaces/kafka-topics.md).

## Detailed specifications

- [Exchange Simulator](../oms-concepts/exchange-simulator.md)

## Known gaps

None known.

## Verification

`OrderEvaluatorTest`, `FillSlicerTest`, `ExchangeEngineTest`, `ExchangeSimulatorKafkaIntegrationTest`, `SimulatorMetricsIntegrationTest`. Conventions: [Testing Patterns](../oms-framework/testing-patterns.md).
