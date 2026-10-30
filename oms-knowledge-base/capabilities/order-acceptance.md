---
type: Capability
title: "Order Acceptance"
description: "Moving an order to LIVE when the market acknowledges it."
tags: [order-acceptance, ack, orders]
status: draft
maturity: "implemented"
commands: ["OrderAcceptCmd"]
generated: { by: claude-code/claude-opus-5-5, at: "2026-10-27T17:30:00Z" }
sources:
  - resource: "repo:oms-core/src/main/java/org/example/oms/service/command/OrderAcceptCommandProcessor.java"
  - resource: "repo:oms-core/src/main/java/org/example/common/state/OrderStateMachineConfig.java"
---
# Order Acceptance

## Summary

When the market acknowledges an order, the OMS marks it LIVE; only LIVE orders can be filled.

## Actors

The market or venue adapter (today the [exchange simulator](exchange-simulation.md)).

## Behaviour

`OrderAcceptCommandProcessor` loads the order, checks UNACK → LIVE with the state machine,
saves it, records `ACK` and stages publication, all in one transaction.

## Requirements

- [FR-005 Move acknowledged orders to LIVE](../functional-requirements/FR-005-acknowledge-orders.md)
- [FR-006 Refuse invalid acknowledgements](../functional-requirements/FR-006-refuse-invalid-acceptance.md)

## Interfaces and domain

[Command API](../interfaces/command-api.md), [Kafka Topics](../interfaces/kafka-topics.md); [Order State](../domain/order-state.md).

## Detailed specifications

- [Order Lifecycle Management Specification](../oms-concepts/order-lifecycle.md)
- [State Machine Framework](../oms-framework/state-machine-framework_spec.md)

## Known gaps

- [Order Lifecycle](../oms-concepts/order-lifecycle.md) §9.3 "Duplicate Acknowledgments" says a
  duplicate ack is ignored; the code refuses it as an invalid transition (failure, 400 on the API),
  writing nothing. The effect is the same (no second change) but the response differs.

## Verification

`OrderAcceptCommandProcessorTest`, `CommandListenerKafkaIntegrationTest`, `OrderLifecycleIntegrationTest`. Conventions: [Testing Patterns](../oms-framework/testing-patterns.md).
